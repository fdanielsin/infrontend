import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		// After sveltekit(): the virtual `~icons/iconoir/<name>` modules become Svelte components.
		Icons({ compiler: 'svelte' }),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// The cookie only exists after an explicit choice; the browser language decides before.
			strategy: ['cookie', 'preferredLanguage', 'baseLocale']
		})
	]
});
