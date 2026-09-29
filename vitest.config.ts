import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Component tests render Svelte components under jsdom; without this,
	// Vite resolves Svelte's server-side build even in a Vitest/Node process,
	// and `mount()` throws "not available on the server" for any component
	// test. Documented at https://svelte.dev/docs/svelte/testing.
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
