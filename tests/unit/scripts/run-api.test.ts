import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runApi } from '../../../scripts/lib/api.ts';
import { FakeRoot } from './fake-root.ts';

const ENV = { OPENAPI_URL: 'http://localhost:8081/openapi.yaml' };

describe('runApi', () => {
	let root: FakeRoot;

	beforeEach(() => {
		root = new FakeRoot();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		root.remove();
		vi.restoreAllMocks();
	});

	it('runs every step and returns 0 when they all succeed (happy path)', async () => {
		root.tool('openapi-typescript', 0);
		root.tool('openapi-ts', 0);

		const code = await runApi(['generate'], ENV, root.dir);

		expect(code).toBe(0);
		expect(root.ran('openapi-typescript')).toBe(true);
		expect(root.ran('openapi-ts')).toBe(true);
	});

	it('returns the exit code of the failing step and runs no later step (error)', async () => {
		root.tool('openapi-typescript', 3);
		root.tool('openapi-ts', 0);

		const code = await runApi(['generate'], ENV, root.dir);

		expect(code).toBe(3);
		expect(root.ran('openapi-ts')).toBe(false);
	});

	it('returns 2 without running anything for a forbidden or missing URL (error)', async () => {
		root.tool('openapi-typescript', 0);

		expect(await runApi(['check'], {}, root.dir)).toBe(2);
		expect(
			await runApi(['check'], { OPENAPI_URL: 'http://localhost:8080/openapi.yaml' }, root.dir)
		).toBe(2);
		expect(root.ran('openapi-typescript')).toBe(false);
	});

	it('returns 2 for an unknown mode (error)', async () => {
		expect(await runApi(['other'], ENV, root.dir)).toBe(2);
		expect(await runApi([], ENV, root.dir)).toBe(2);
	});
});
