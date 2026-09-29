import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Required for component tests to mount under jsdom instead of Svelte's
	// server build: https://svelte.dev/docs/svelte/testing#Component-testing.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		globals: true,
		environment: 'jsdom',
		setupFiles: [],
		include: ['tests/unit/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['node_modules/', '.svelte-kit/']
		}
	}
});
