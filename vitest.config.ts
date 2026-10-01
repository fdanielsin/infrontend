import { defineConfig } from 'vitest/config';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['cookie', 'preferredLanguage', 'baseLocale']
		})
	],
	// Required for component tests to mount under jsdom instead of Svelte's
	// server build: https://svelte.dev/docs/svelte/testing#Component-testing.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: [],
		include: ['tests/unit/**/*.test.ts'],
		sequence: { shuffle: true },
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/**/*.{ts,svelte}'],
			exclude: ['src/**/*.d.ts'],
			thresholds: { lines: 85, branches: 75 }
		}
	}
});
