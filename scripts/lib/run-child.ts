import { spawn } from 'node:child_process';

/**
 * Runs a command with its own process group and resolves with its exit code (128 + signal when a
 * signal ended it, 127 when it cannot start). Aborting the signal stops the whole group: a
 * grandchild such as a preview server never outlives its run.
 */
export function runChild(
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
	signal?: AbortSignal
): Promise<number> {
	return new Promise((resolve) => {
		const child = spawn(command, args, { env, stdio: 'inherit', detached: true });
		const stopGroup = (name: NodeJS.Signals) => {
			if (child.pid === undefined) return;
			try {
				process.kill(-child.pid, name);
			} catch {
				// The group is already gone.
			}
		};
		const onAbort = () => stopGroup('SIGTERM');
		signal?.addEventListener('abort', onAbort, { once: true });
		const forward = (name: NodeJS.Signals) => () => stopGroup(name);
		const forwards = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map((name) => {
			const handler = forward(name);
			process.on(name, handler);
			return [name, handler] as const;
		});
		const finish = (code: number) => {
			signal?.removeEventListener('abort', onAbort);
			for (const [name, handler] of forwards) process.off(name, handler);
			resolve(code);
		};
		child.on('error', () => finish(127));
		child.on('close', (code, name) => {
			finish(code ?? 128 + (name ? signalNumber(name) : 1));
		});
	});
}

function signalNumber(name: NodeJS.Signals): number {
	const numbers: Partial<Record<NodeJS.Signals, number>> = {
		SIGHUP: 1,
		SIGINT: 2,
		SIGKILL: 9,
		SIGTERM: 15
	};
	return numbers[name] ?? 1;
}
