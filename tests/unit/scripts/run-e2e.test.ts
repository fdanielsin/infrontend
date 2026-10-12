import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runE2e } from '../../../scripts/lib/e2e.ts';
import { FakeRoot } from './fake-root.ts';

const ENV = { E2E_PORT: '4103', PUBLIC_API_URL: 'http://localhost:8089' };
const answering = vi.fn(() => Promise.resolve(new Response('ok', { status: 200 })));

describe('runE2e', () => {
	let root: FakeRoot;

	beforeEach(() => {
		root = new FakeRoot();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		root.remove();
		vi.restoreAllMocks();
	});

	it('runs Playwright and returns its exit code once the backend answers (happy path)', async () => {
		root.tool('playwright', 5);

		const code = await runE2e(['backend'], ENV, root.dir, answering);

		expect(code).toBe(5);
		expect(root.ran('playwright')).toBe(true);
	});

	it('refuses with 2 and runs nothing when the backend answers an error (error)', async () => {
		root.tool('playwright', 0);
		const failing = vi.fn(() => Promise.resolve(new Response('', { status: 503 })));

		const code = await runE2e(['backend'], ENV, root.dir, failing);

		expect(code).toBe(2);
		expect(root.ran('playwright')).toBe(false);
	});

	it('refuses with 2 and runs nothing when the backend is unreachable (exception)', async () => {
		root.tool('playwright', 0);
		const unreachable = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));

		const code = await runE2e(['backend'], ENV, root.dir, unreachable);

		expect(code).toBe(2);
		expect(root.ran('playwright')).toBe(false);
	});

	it('does not probe any backend for the mocked suite (limit)', async () => {
		root.tool('playwright', 0);
		const never = vi.fn(() => Promise.reject(new Error('must not be called')));

		const code = await runE2e(['mocked'], ENV, root.dir, never);

		expect(code).toBe(0);
		expect(never).not.toHaveBeenCalled();
	});

	it('returns 2 for an unknown suite or a forbidden URL, without running (error)', async () => {
		root.tool('playwright', 0);

		expect(await runE2e(['other'], ENV, root.dir)).toBe(2);
		expect(
			await runE2e(['backend'], { ...ENV, PUBLIC_API_URL: 'http://localhost:8080' }, root.dir)
		).toBe(2);
		expect(root.ran('playwright')).toBe(false);
	});
});
