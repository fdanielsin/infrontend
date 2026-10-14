import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { DRIVERS, messageText } from './capture-drivers.ts';
import { assertImage, isForbiddenUrl } from './capture-guards.ts';
import {
	parseCaptureArgs,
	planCaptures,
	renderIndex,
	type CaptureEntry,
	type CaptureOptions,
	type CaptureResult
} from './capture-plan.ts';
import { runChild } from './run-child.ts';

// Unreachable on purpose: the API is the simulated one, whatever the build says.
const MOCKED_API_URL = 'http://localhost:59999';
const SETTLE_MS = 150;

function browsersPath(root: string): string | undefined {
	return [
		path.resolve(root, '..', '.playwright-browsers'),
		path.resolve(root, '.worktrees', '.playwright-browsers')
	].find((candidate) => existsSync(candidate));
}

async function waitForServer(url: string, signal: AbortSignal): Promise<void> {
	for (let attempt = 0; attempt < 120; attempt++) {
		if (signal.aborted) throw new Error('The preview stopped before it answered.');
		try {
			if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
		} catch {
			// Not up yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`The preview does not answer on ${url}.`);
}

// One browser context per width and language, one fresh page per state.
async function takeCaptures(
	browser: Browser,
	options: CaptureOptions,
	entries: CaptureEntry[],
	root: string
): Promise<{ results: CaptureResult[]; forbidden: string[]; requests: string[] }> {
	const results: CaptureResult[] = [];
	const forbidden: string[] = [];
	const requests: string[] = [];
	const origin = `http://localhost:${options.port}`;
	const groups = new Map<string, CaptureEntry[]>();
	for (const entry of entries) {
		const key = `${entry.width}-${entry.locale}`;
		groups.set(key, [...(groups.get(key) ?? []), entry]);
	}
	for (const group of groups.values()) {
		const { width, locale } = group[0]!;
		const context = await browser.newContext({
			viewport: { width, height: 900 },
			locale,
			reducedMotion: 'reduce',
			baseURL: origin
		});
		// Registered before any page: a request to a port of the user is cut short, and counted
		// whatever answers it (a page route of the simulated API comes first, so only the request
		// event tells everything).
		await context.route(
			(url) => isForbiddenUrl(url.href),
			(route) => route.abort()
		);
		context.on('request', (request) => {
			requests.push(request.url());
			if (isForbiddenUrl(request.url())) forbidden.push(`${request.method()} ${request.url()}`);
		});
		await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: origin }]);
		for (const entry of group) {
			const page = await context.newPage();
			const driver = DRIVERS[entry.screen][entry.state];
			if (!driver) throw new Error(`No driver for ${entry.screen}/${entry.state}.`);
			try {
				const release = await driver({
					page,
					locale,
					root,
					t: (key, params) => messageText(root, locale, key, params)
				});
				// Fonts and the last frame, so that two runs give the same image.
				await page.evaluate(() => document.fonts.ready);
				await page.waitForTimeout(SETTLE_MS);
				const file = path.join(options.outDir, entry.file);
				await mkdir(path.dirname(file), { recursive: true });
				const data = await page.screenshot({ fullPage: true, path: file });
				results.push({ entry, bytes: assertImage(entry.file, data) });
				if (release) release();
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				throw new Error(`${entry.file}: ${reason}`, { cause: error });
			} finally {
				await page.close();
			}
		}
		await context.close();
	}
	return { results, forbidden, requests };
}

/** Entry of `bun run captures`: returns the exit code. */
export async function runCaptures(
	argv: string[],
	env: NodeJS.ProcessEnv = process.env,
	root: string = process.cwd()
): Promise<number> {
	let options: CaptureOptions;
	let entries: CaptureEntry[];
	try {
		options = parseCaptureArgs(argv, env, root);
		entries = planCaptures(options.filters);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 2;
	}
	const childEnv: NodeJS.ProcessEnv = { ...env, PUBLIC_API_URL: MOCKED_API_URL };
	const browsers = env.PLAYWRIGHT_BROWSERS_PATH ?? browsersPath(root);
	if (browsers) childEnv.PLAYWRIGHT_BROWSERS_PATH = browsers;
	if (options.build) {
		const code = await runChild('bun', ['run', 'build'], childEnv);
		if (code !== 0) return code;
	}
	if (!existsSync(path.join(root, 'build'))) {
		console.error('There is no build: run without --skip-build.');
		return 2;
	}
	const stop = new AbortController();
	const preview = runChild(
		path.join(root, 'node_modules', '.bin', 'vite'),
		['preview', '--port', String(options.port), '--strictPort'],
		childEnv,
		stop.signal
	);
	let browser: Browser | undefined;
	try {
		// A server that stopped by itself (the port is taken) wins over the wait.
		void preview.then(() => stop.abort());
		await waitForServer(`http://localhost:${options.port}/`, stop.signal);
		await rm(options.outDir, { recursive: true, force: true });
		await mkdir(options.outDir, { recursive: true });
		process.env.PLAYWRIGHT_BROWSERS_PATH = childEnv.PLAYWRIGHT_BROWSERS_PATH ?? '';
		browser = await chromium.launch();
		const { results, forbidden, requests } = await takeCaptures(browser, options, entries, root);
		await writeFile(path.join(options.outDir, 'index.md'), renderIndex(results, forbidden.length));
		await writeFile(
			path.join(options.outDir, 'index.json'),
			`${JSON.stringify(
				results.map(({ entry, bytes }) => ({ ...entry, bytes })),
				null,
				2
			)}\n`
		);
		await writeFile(path.join(options.outDir, 'requests.log'), `${requests.join('\n')}\n`);
		if (forbidden.length > 0) {
			console.error(`${forbidden.length} request(s) to a forbidden port:\n${forbidden.join('\n')}`);
			return 1;
		}
		console.log(`${results.length} captures in ${options.outDir} (index.md, index.json).`);
		return 0;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 1;
	} finally {
		await browser?.close();
		stop.abort();
		await preview;
	}
}
