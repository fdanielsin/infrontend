// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import Icons from 'unplugin-icons/vite';
import { describe, expect, it } from 'vitest';

// A real Vite build (in memory) of what imports icons, to prove that only the icons imported end
// up in the code that is shipped, never the whole Iconoir set (about 1 700 icons, 700 kB of JSON).

const require = createRequire(import.meta.url);
const COLLECTION = require('@iconify-json/iconoir/icons.json') as {
	icons: Record<string, { body: string }>;
};

function pathsOf(body: string): string[] {
	return [...body.matchAll(/ d="([^"]+)"/g)].map((match) => match[1]!);
}

// The icons listed in Icon.svelte, read from its imports so the list is written once.
const LISTED = [
	...readFileSync('src/lib/ui/icons.ts', 'utf8').matchAll(/~icons\/iconoir\/([a-z-]+)'/g)
].map((match) => match[1]!);
const LISTED_PATHS = LISTED.flatMap((name) => pathsOf(COLLECTION.icons[name]!.body));
const TRASH_PATHS = pathsOf(COLLECTION.icons['trash']!.body);

// A path counts only as a whole attribute value: some drawings are made of pieces of others.
const drawnIn = (code: string, path: string) => code.includes(` d="${path}"`);

// The icons of the set whose drawing is in `code`, apart from the paths that were expected there.
// A path too short to be told from other code is not a proof.
function unexpectedIcons(shipped: string, expected: string[]): string[] {
	// The JSON of the set is shipped as an escaped string: drop the escapes to read the attributes.
	const code = shipped.replaceAll('\\', '');
	return Object.entries(COLLECTION.icons)
		.filter(([, icon]) =>
			pathsOf(icon.body).some(
				(path) => path.length > 30 && !expected.includes(path) && drawnIn(code, path)
			)
		)
		.map(([name]) => name);
}

async function bundle(source: string): Promise<string> {
	const entry: Plugin = {
		name: 'test-entry',
		resolveId: (id) => (id === 'virtual:entry' ? '\0virtual:entry' : null),
		load: (id) => (id === '\0virtual:entry' ? source : null)
	};
	const output = await build({
		configFile: false,
		logLevel: 'silent',
		root: process.cwd(),
		plugins: [
			entry,
			svelte({ configFile: false, compilerOptions: { runes: true } }),
			Icons({ compiler: 'svelte' })
		],
		build: {
			write: false,
			minify: false,
			rolldownOptions: {
				input: 'virtual:entry',
				preserveEntrySignatures: 'strict',
				external: [/^svelte/]
			}
		}
	});
	const result = Array.isArray(output) ? output[0]! : output;
	if (!('output' in result)) throw new Error('Unexpected watcher result');
	return result.output.map((chunk) => ('code' in chunk ? chunk.code : '')).join('\n');
}

const ICON_COMPONENT = resolve('src/lib/ui/Icon.svelte');
const TIMEOUT = 60_000;

describe('icons in the bundle', () => {
	it(
		'holds the icons that Icon imports and no other icon of the set (happy path)',
		async () => {
			const code = await bundle(`export { default } from '${ICON_COMPONENT}';`);

			expect(LISTED.length).toBeGreaterThan(10);
			for (const path of LISTED_PATHS) expect(code).toContain(path);
			expect(unexpectedIcons(code, LISTED_PATHS)).toEqual([]);
			expect(code).not.toContain('@iconify');
			expect(code).not.toContain('unplugin');
			// The set is 700 kB: this only catches a bundle that holds more than the listed icons (22 390 bytes measured).
			expect(code.length).toBeLessThan(23_000);
		},
		TIMEOUT
	);

	it(
		'adds an icon when it is imported, so the check above can see one (boundary)',
		async () => {
			const code = await bundle(
				`export { default } from '${ICON_COMPONENT}';
				 export { default as Trash } from '~icons/iconoir/trash';`
			);

			for (const path of TRASH_PATHS) expect(code).toContain(path);
			expect(unexpectedIcons(code, [...LISTED_PATHS, ...TRASH_PATHS])).toEqual([]);
		},
		TIMEOUT
	);

	it(
		'would see the whole set if it were imported (limit)',
		async () => {
			const code = await bundle(
				`export { default } from '${ICON_COMPONENT}';
				 export { icons } from '@iconify-json/iconoir';`
			);

			expect(unexpectedIcons(code, LISTED_PATHS).length).toBeGreaterThan(1000);
			expect(code.length).toBeGreaterThan(500_000);
		},
		TIMEOUT
	);

	it(
		'fails the build for an icon that does not exist, instead of shipping an empty one (sad path)',
		async () => {
			await expect(
				bundle(`export { default as Missing } from '~icons/iconoir/not-an-icon';`)
			).rejects.toThrow();
		},
		TIMEOUT
	);
});
