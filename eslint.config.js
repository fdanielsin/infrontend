import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	{ ignores: ['src/lib/api/schema.d.ts'] },
	...ts.configs.recommendedTypeChecked.map((config) => ({
		...config,
		files: ['src/**/*.{ts,svelte}', 'tests/**/*.ts']
	})),
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: [
			'src/**/*.{ts,svelte}',
			'tests/**/*.ts',
			'**/*.svelte',
			'**/*.svelte.ts',
			'**/*.svelte.js'
		],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Svelte props are declared with `let` so they stay bindable.
		files: ['**/*.svelte'],
		rules: { 'prefer-const': 'off', 'svelte/prefer-const': 'error' }
	},
	{
		// `vi.mocked(api.method)` reads a method without calling it.
		files: ['tests/**/*.ts'],
		rules: { '@typescript-eslint/unbound-method': 'off' }
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {}
	}
);
