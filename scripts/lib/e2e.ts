import { existsSync } from 'node:fs';
import path from 'node:path';
import { REFERENCE_PORTS, USER_PORTS, checkPort, checkUrl } from './guard.ts';
import { runChild } from './run-child.ts';

export type E2eSuite = 'mocked' | 'backend';

export interface E2ePlan {
	args: string[];
	env: NodeJS.ProcessEnv;
}

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
	if (!argv.some((arg) => arg === '--output' || arg.startsWith('--output='))) {
		args.push('--output=test-results/e2e');
	}
	if (!planned.PLAYWRIGHT_BROWSERS_PATH) {
		const browsers = sharedBrowsers(root, exists);
		if (browsers) planned.PLAYWRIGHT_BROWSERS_PATH = browsers;
	}
	return { args, env: planned };
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
	return runChild(path.join(root, 'node_modules', '.bin', 'playwright'), plan.args, plan.env);
}
