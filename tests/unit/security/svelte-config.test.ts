// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

// The wiring of svelte.config.js: the API address of the build ends up in the CSP of the site
// (SEC-R04). svelte.csp.js has its own tests; this file proves that the config calls it with
// PUBLIC_API_URL, and only when it builds.

const argv = [...process.argv];

interface LoadedConfig {
	kit?: { csp?: { mode?: string; directives?: Record<string, string[]> } };
}

// The path is not a literal: the file is loaded, not type-checked here, since SvelteKit's own
// types of `kit.csp` refuse the plain strings that its directives are written with.
const CONFIG = '../../../svelte.config.js';

async function loadConfig(command: 'build' | 'dev'): Promise<LoadedConfig> {
	vi.resetModules();
	process.argv = [...argv, command];
	return ((await import(/* @vite-ignore */ CONFIG)) as { default: LoadedConfig }).default;
}

afterEach(() => {
	process.argv = [...argv];
	vi.unstubAllEnvs();
});

describe('csp of svelte.config.js', () => {
	it('SEC-R04: a build allows the origin of PUBLIC_API_URL to be called, and nothing else outside (happy path)', async () => {
		vi.stubEnv('PUBLIC_API_URL', 'http://localhost:8083/api/');
		const csp = (await loadConfig('build')).kit?.csp;
		expect(csp?.mode).toBe('auto');
		expect(csp?.directives?.['connect-src']).toEqual(['self', 'http://localhost:8083']);
	});

	it('SEC-R04: a build without PUBLIC_API_URL stops instead of guessing an address (exception)', async () => {
		vi.stubEnv('PUBLIC_API_URL', '');
		await expect(loadConfig('build')).rejects.toThrow(/PUBLIC_API_URL/);
	});

	it('SEC-R04: the dev server has no policy and needs no address (boundary)', async () => {
		vi.stubEnv('PUBLIC_API_URL', '');
		expect((await loadConfig('dev')).kit?.csp).toBeUndefined();
	});
});
