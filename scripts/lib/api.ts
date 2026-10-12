import path from 'node:path';
import { USER_PORTS, checkUrl } from './guard.ts';
import { runChild } from './run-child.ts';

export type ApiMode = 'generate' | 'check';

export interface ApiStep {
	command: string;
	args: string[];
}

export interface ApiPlan {
	steps: ApiStep[];
	env: NodeJS.ProcessEnv;
}

/**
 * The commands of `api:generate` and `api:check`. `OPENAPI_URL` is required (`:8081` for develop,
 * a branch backend otherwise) and is never a user port.
 */
export function planApi(mode: ApiMode, env: NodeJS.ProcessEnv): ApiPlan {
	const url = checkUrl('OPENAPI_URL', env.OPENAPI_URL, USER_PORTS).href;
	const types = 'src/lib/api/schema.d.ts';
	const zod = 'src/lib/api/zod/zod.gen.ts';
	const cache = 'node_modules/.cache';
	const steps: ApiStep[] =
		mode === 'generate'
			? [
					{ command: 'openapi-typescript', args: [url, '-o', types] },
					{ command: 'openapi-ts', args: [] }
				]
			: [
					{ command: 'openapi-typescript', args: [url, '-o', `${cache}/schema.check.d.ts`] },
					{ command: 'diff', args: ['-u', types, `${cache}/schema.check.d.ts`] },
					{ command: 'openapi-ts', args: ['-o', `${cache}/zod`] },
					{ command: 'diff', args: ['-u', zod, `${cache}/zod/zod.gen.ts`] }
				];
	return { steps, env: { ...env, OPENAPI_URL: url } };
}

/** Entry of `bun run api:generate` and `api:check`: stops at the first failing step. */
export async function runApi(
	argv: string[],
	env: NodeJS.ProcessEnv = process.env,
	root: string = process.cwd()
): Promise<number> {
	const [mode] = argv;
	if (mode !== 'generate' && mode !== 'check') {
		console.error('usage: run-api.ts generate|check');
		return 2;
	}
	let plan: ApiPlan;
	try {
		plan = planApi(mode, env);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		return 2;
	}
	for (const step of plan.steps) {
		const command =
			step.command === 'diff' ? 'diff' : path.join(root, 'node_modules', '.bin', step.command);
		const code = await runChild(command, step.args, plan.env);
		if (code !== 0) return code;
	}
	return 0;
}
