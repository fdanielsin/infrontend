import adapter from '@sveltejs/adapter-node';
import { loadEnv } from 'vite';
import { cspDirectives } from './svelte.csp.js';

// The policy is written into the build, so only `vite build` computes it (and needs PUBLIC_API_URL);
// `vite preview` serves what was built. `vite dev` has none: Vite injects inline styles and a
// websocket for hot reload, which the policy would block (the build is what the tests check).
const building = process.argv.includes('build');
const apiUrl = loadEnv('production', process.cwd(), 'PUBLIC_').PUBLIC_API_URL;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		...(building && { csp: { mode: 'auto', directives: cspDirectives(apiUrl) } })
	}
};

export default config;
