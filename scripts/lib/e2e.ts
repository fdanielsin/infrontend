import { existsSync } from 'node:fs';
import path from 'node:path';
import { REFERENCE_PORTS, USER_PORTS, checkPort, checkUrl } from './guard.ts';
import { runChild } from './run-child.ts';

export type E2eSuite = 'mocked' | 'backend';

export interface E2ePlan {
	args: string[];
	env: NodeJS.ProcessEnv;
	// A second run, one worker, for the tests tagged `@alone` (real suite only).
	alone?: E2ePlan;
}

// A test that only passes without other browsers running beside it carries this tag: the real
// suite runs it apart, alone (see `planE2e`).
const ALONE_TAG = '@alone';
const TITLE_FILTERS = ['-g', '--grep', '--grep-invert'];
const outputOf = (argv: string[]) =>
	argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);

// Unreachable on purpose, and not port 9, which Firefox and WebKit refuse before `page.route`
// can intercept the request.
const MOCKED_API_URL = 'http://localhost:59999';

/** The browsers installed once for every worktree, in `infrontend/.worktrees/.playwright-browsers`. */
function sharedBrowsers(root: string, exists: (path: string) => boolean): string | undefined {
	const candidates = [
		path.resolve(root, '..', '.playwright-browsers'),
		path.resolve(root, '.worktrees', '.playwright-browsers')
	];
	return candidates.find((candidate) => exists(candidate));
}

/**
 * The settings of one E2E suite, so that nobody retypes them (or types the wrong port):
 * - mocked: the API is unreachable on purpose, whatever `PUBLIC_API_URL` says;
 * - backend: `PUBLIC_API_URL` is required (no default), never a user port nor the read-only reference.
 * Both need `E2E_PORT`, one per worktree, and write their results to `test-results/e2e`.
 */
export function planE2e(
	suite: E2eSuite,
	env: NodeJS.ProcessEnv,
	argv: string[],
	root: string,
	exists: (path: string) => boolean = existsSync
): E2ePlan {
	const port = checkPort('E2E_PORT', env.E2E_PORT, USER_PORTS);
	const planned: NodeJS.ProcessEnv = { ...env, E2E_PORT: String(port) };
	const args = ['test'];
	// A filter of titles given on the command line is what was asked for: no second run then.
	const withAlone =
		suite === 'backend' &&
		!argv.some((arg) => TITLE_FILTERS.some((flag) => arg === flag || arg.startsWith(`${flag}=`)));
	if (suite === 'mocked') {
		planned.PUBLIC_API_URL = MOCKED_API_URL;
		planned.E2E_MOCKED_ONLY = '1';
	} else {
		planned.PUBLIC_API_URL = checkUrl('PUBLIC_API_URL', env.PUBLIC_API_URL, [
			...USER_PORTS,
			...REFERENCE_PORTS
		]).href.replace(/\/$/, '');
		delete planned.E2E_MOCKED_ONLY;
		args.push('tests/e2e/backend');
	}
	args.push(...argv);
	if (withAlone) args.push(`--grep-invert=${ALONE_TAG}`);
	if (!argv.some((arg) => arg === '--output' || arg.startsWith('--output='))) {
		args.push('--output=test-results/e2e');
	}
	if (!planned.PLAYWRIGHT_BROWSERS_PATH) {
		const browsers = sharedBrowsers(root, exists);
		if (browsers) planned.PLAYWRIGHT_BROWSERS_PATH = browsers;
	}
	const plan: E2ePlan = { args, env: planned };
	if (withAlone) {
		// Playwright empties the output folder of a run: the second one writes beside the first.
		const output = outputOf(args) ?? 'test-results/e2e';
		plan.alone = {
			args: [
				'test',
				'tests/e2e/backend',
				...argv.filter((arg) => !arg.startsWith('--output=')),
				`--grep=${ALONE_TAG}`,
				'--workers=1',
				'--pass-with-no-tests',
				`--output=${output}-alone`
			],
			env: planned
		};
	}
	return plan;
}

/** Is the backend answering? A 4-minute build is not worth starting against nothing. */
async function backendAnswers(url: string, fetcher: typeof fetch): Promise<boolean> {
	try {
		const response = await fetcher(`${url}/ready`, { signal: AbortSignal.timeout(3000) });
		return response.ok;
	} catch {
		return false;
	}
}

/** Entry of `bun run test:e2e:mocked` and `test:e2e:backend`: returns the exit code. */
export async function runE2e(
	argv: string[],
	env: NodeJS.ProcessEnv = process.env,
	root: string = process.cwd(),
	fetcher: typeof fetch = fetch
): Promise<number> {
	const [suite, ...rest] = argv;
	if (suite !== 'mocked' && suite !== 'backend') {
		console.error('usage: run-e2e.ts mocked|backend [playwright arguments]');
		return 2;
	}
	let plan: E2ePlan;
	try {
		plan = planE2e(suite, env, rest, root);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 2;
	}
	if (suite === 'backend' && !(await backendAnswers(plan.env.PUBLIC_API_URL ?? '', fetcher))) {
		console.error(
			`The backend does not answer on ${plan.env.PUBLIC_API_URL}/ready: start it first.`
		);
		return 2;
	}
	const playwright = path.join(root, 'node_modules', '.bin', 'playwright');
	const code = await runChild(playwright, plan.args, plan.env);
	if (!plan.alone) return code;
	// The tests that must run alone, once the others are done, whatever their result.
	const aloneCode = await runChild(playwright, plan.alone.args, plan.alone.env);
	return code || aloneCode;
}
