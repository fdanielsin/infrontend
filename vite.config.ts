import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// The cookie only exists after an explicit choice; the browser language decides before.
			strategy: ['cookie', 'preferredLanguage', 'baseLocale']
		})
	]
});
