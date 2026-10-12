import { afterEach, describe, expect, it, vi } from 'vitest';

describe('openapi-ts.config', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('reads the contract at OPENAPI_URL (happy path)', async () => {
		vi.stubEnv('OPENAPI_URL', 'http://localhost:8084/openapi.yaml');

		const { default: config } = await import('../../../openapi-ts.config.ts');

		expect(JSON.stringify(await config)).toContain('"input":"http://localhost:8084/openapi.yaml"');
	});

	it('cannot be loaded with OPENAPI_URL unset: no fallback to a default (error)', async () => {
		vi.stubEnv('OPENAPI_URL', undefined);
		delete process.env.OPENAPI_URL;

		await expect(import('../../../openapi-ts.config.ts')).rejects.toThrow(
			/OPENAPI_URL is required/
		);
	});

	it.each(['', '   ', 'http://localhost:8080/openapi.yaml', 'http://localhost:5173/openapi.yaml'])(
		'cannot be loaded with OPENAPI_URL="%s": no fallback to a user service (error)',
		async (url) => {
			vi.stubEnv('OPENAPI_URL', url);

			await expect(import('../../../openapi-ts.config.ts')).rejects.toThrow(/OPENAPI_URL/);
		}
	);
});
