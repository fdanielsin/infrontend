import { afterEach, describe, expect, it, vi } from 'vitest';

describe('tests/e2e/support/api-url', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('exports the backend URL of the real E2E tests, without a trailing slash (happy path)', async () => {
		vi.stubEnv('PUBLIC_API_URL', 'http://localhost:8085/');

		const { API } = await import('../../e2e/support/api-url.ts');

		expect(API).toBe('http://localhost:8085');
	});

	it('cannot be imported without a variable or with a forbidden port: no fallback to :8080 (error)', async () => {
		vi.stubEnv('PUBLIC_API_URL', '');
		await expect(import('../../e2e/support/api-url.ts')).rejects.toThrow(
			/PUBLIC_API_URL is required/
		);

		vi.resetModules();
		vi.stubEnv('PUBLIC_API_URL', 'http://localhost:8080');
		await expect(import('../../e2e/support/api-url.ts')).rejects.toThrow(/user/);
	});
});
