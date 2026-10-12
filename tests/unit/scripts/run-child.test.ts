import { describe, expect, it } from 'vitest';
import { runChild } from '../../../scripts/lib/run-child.ts';

describe('runChild', () => {
	it('resolves with the exit code of the command (happy path)', async () => {
		const code = await runChild(process.execPath, ['-e', 'process.exit(7)'], process.env);

		expect(code).toBe(7);
	});

	it('resolves 0 for a command that succeeds (boundary values)', async () => {
		expect(await runChild(process.execPath, ['-e', ''], process.env)).toBe(0);
	});

	it('resolves 127 for a command that does not exist, never throws (error)', async () => {
		expect(await runChild('/no/such/command-zz', [], process.env)).toBe(127);
	});

	it('passes the environment it is given, not the one of the caller (limit)', async () => {
		const code = await runChild(
			process.execPath,
			['-e', 'process.exit(process.env.ZZ_ONLY_HERE === "1" ? 0 : 9)'],
			{ ZZ_ONLY_HERE: '1' }
		);

		expect(code).toBe(0);
	});

	it('stops the whole process group when aborted, grandchildren included (exception)', async () => {
		const controller = new AbortController();
		const started = Date.now();
		const run = runChild(
			'sh',
			['-c', 'sleep 30 & sleep 30 & wait'],
			process.env,
			controller.signal
		);
		setTimeout(() => controller.abort(), 300);

		const code = await run;

		expect(Date.now() - started).toBeLessThan(10_000);
		expect(code).toBe(128 + 15);
	});
});
