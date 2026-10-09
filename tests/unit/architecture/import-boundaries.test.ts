import { ESLint } from 'eslint';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { importBoundaries } from '../../../eslint.boundaries.js';

// The direction of the imports (docs/architecture.md). Each case is a file that would be written
// in the zone `file`, with the one import it holds: nothing is written on disk.
const eslint = new ESLint({
	overrideConfigFile: true,
	overrideConfig: [
		{ files: ['**/*.ts'], languageOptions: { parser: ts.parser } },
		...svelte.configs.recommended,
		{ files: ['**/*.svelte'], languageOptions: { parserOptions: { parser: ts.parser } } },
		...importBoundaries
	]
});

const rules = async (file: string, code: string) => {
	const source = file.endsWith('.svelte') ? `<script lang="ts">\n${code}</script>\n` : code;
	const [result] = await eslint.lintText(source, { filePath: file });
	return result!.messages.map((message) => `${message.ruleId}: ${message.message}`);
};

const imports = (specifier: string) => `import { x } from '${specifier}';\nvoid x;\n`;

describe('import boundaries', () => {
	it.each([
		// ui/ knows neither the features nor the routes.
		[
			'ui -> features (alias)',
			'src/lib/ui/Fake.svelte',
			'$lib/features/tasks/sort-tasks',
			'features/'
		],
		[
			'ui -> features (relative)',
			'src/lib/ui/Fake.ts',
			'../features/tasks/sort-tasks',
			'features/'
		],
		[
			'ui -> features (nested relative)',
			'src/lib/ui/deep/Fake.ts',
			'../../features/users/UserList.svelte',
			'features/'
		],
		['ui -> routes', 'src/lib/ui/Fake.svelte', '../../routes/stats/+page.svelte', 'routes'],
		// features/ do not know the routes.
		[
			'features -> routes',
			'src/lib/features/tasks/Fake.svelte',
			'../../../routes/+page.svelte',
			'routes'
		],
		// state/ does not know the features (the shared state is below them).
		[
			'state -> features (alias)',
			'src/lib/state/fake.svelte.ts',
			'$lib/features/tasks/sort-tasks',
			'features/'
		],
		[
			'state -> features (relative)',
			'src/lib/state/fake.ts',
			'../features/tasks/sort-tasks',
			'features/'
		],
		// No shared module knows a route.
		['api -> routes', 'src/lib/api/fake.ts', '../../routes/+page.svelte', 'routes'],
		['i18n -> routes', 'src/lib/i18n/fake.ts', '../../routes/+page.svelte', 'routes'],
		['validation -> routes', 'src/lib/validation/fake.ts', '../../routes/+page.svelte', 'routes'],
		// api/ knows no feature, no ui, no state.
		['api -> features', 'src/lib/api/fake.ts', '$lib/features/tasks/sort-tasks', 'features/'],
		['api -> ui', 'src/lib/api/fake.ts', '$lib/ui/Button.svelte', 'ui/'],
		['api -> state', 'src/lib/api/fake.ts', '../state/tasks.svelte', 'state/'],
		// The contract types and the HTTP client stay in lib/api.
		['features -> contract types', 'src/lib/features/tasks/Fake.ts', '$lib/api/schema', 'lib/api'],
		['state -> zod schemas', 'src/lib/state/fake.ts', '$lib/api/zod/zod.gen', 'lib/api'],
		['routes -> contract types', 'src/routes/fake.ts', '$lib/api/schema', 'lib/api'],
		['ui -> relative contract types', 'src/lib/ui/fake.ts', '../api/schema', 'lib/api'],
		['routes -> openapi-fetch', 'src/routes/fake.ts', 'openapi-fetch', 'client.ts'],
		['features -> openapi-fetch', 'src/lib/features/fake.ts', 'openapi-fetch', 'client.ts'],
		// The environment is read in routes/ and in the API client only.
		['ui -> $env', 'src/lib/ui/Fake.ts', '$env/static/public', 'environment'],
		['state -> $env', 'src/lib/state/fake.ts', '$env/dynamic/private', 'environment'],
		['api (not the client) -> $env', 'src/lib/api/fake.ts', '$env/static/public', 'environment']
	])('refuses %s', async (_name, file, specifier, fragment) => {
		const found = await rules(file, imports(specifier));
		expect(found).toHaveLength(1);
		expect(found[0]).toContain('no-restricted-imports');
		expect(found[0]).toContain(fragment);
	});

	it.each([
		['ui -> ui (relative)', 'src/lib/ui/Fake.svelte', './Button.svelte'],
		['ui -> state', 'src/lib/ui/Fake.ts', '$lib/state/notification.svelte'],
		['ui -> api client', 'src/lib/ui/Fake.ts', '$lib/api/client'],
		['features -> ui', 'src/lib/features/tasks/Fake.svelte', '$lib/ui/Button.svelte'],
		['features -> state', 'src/lib/features/tasks/Fake.ts', '$lib/state/task-order'],
		['features -> features', 'src/lib/features/users/Fake.svelte', '../tasks/TaskForm.svelte'],
		['state -> api client', 'src/lib/state/fake.ts', '$lib/api/client'],
		['state -> state', 'src/lib/state/fake.ts', './tasks.svelte'],
		['i18n -> api client', 'src/lib/i18n/fake.ts', '$lib/api/client'],
		['api (the client) -> $env', 'src/lib/api/client.ts', '$env/static/public'],
		['api -> its own contract', 'src/lib/api/fake.ts', './schema'],
		['api (the client) -> openapi-fetch', 'src/lib/api/client.ts', 'openapi-fetch'],
		['routes -> features', 'src/routes/fake.svelte', '$lib/features/users/UserForm.svelte'],
		['routes -> $env', 'src/routes/fake.ts', '$env/static/public'],
		['routes -> routes', 'src/routes/stats/fake.svelte', '../+layout.svelte'],
		['routes -> api client', 'src/routes/fake.svelte', '$lib/api/client'],
		['a test -> anything', 'tests/unit/fake.ts', '../../src/routes/+page.svelte']
	])('allows %s', async (_name, file, specifier) => {
		expect(await rules(file, imports(specifier))).toEqual([]);
	});

	it('refuses an import type and a re-export like any import (limit)', async () => {
		const typeImport = `import type { X } from '$lib/features/tasks/sort-tasks';\nexport type Y = X;\n`;
		const reExport = `export { x } from '$lib/features/tasks/sort-tasks';\n`;
		expect(await rules('src/lib/ui/Fake.ts', typeImport)).toHaveLength(1);
		expect(await rules('src/lib/ui/Fake.ts', reExport)).toHaveLength(1);
	});
});
