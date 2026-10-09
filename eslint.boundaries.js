// The direction of the imports (docs/architecture.md, "Direction des dépendances"). Each zone lists
// everything it must not import: a flat config block replaces the options of an earlier one, so a
// file matched by several zones gets one complete list.

// An import path is either an alias (`$lib/<zone>`) or relative (`../<zone>`, `../../a/<zone>`).
/** @param {string} zone */
const into = (zone) => `^(\\$lib/|(\\.\\.?/)+(.*/)?)${zone}(/|$)`;

const FORBIDDEN = {
	features: {
		regex: into('features'),
		message:
			'Not from here: features/ is above this folder (docs/architecture.md, Direction des dépendances).'
	},
	ui: {
		regex: into('ui'),
		message:
			'Not from here: ui/ is above this folder (docs/architecture.md, Direction des dépendances).'
	},
	state: {
		regex: into('state'),
		message:
			'Not from here: state/ is above this folder (docs/architecture.md, Direction des dépendances).'
	},
	routes: {
		regex: '^(\\.\\.?/)+(.*/)?routes(/|$)',
		message: 'Nothing under lib/ imports a route: routes compose lib/, never the other way round.'
	},
	apiContract: {
		regex: '^(\\$lib/|(\\.\\.?/)+(.*/)?)api/(schema|zod)(/|\\.|$)',
		message: 'The contract types and the zod schemas stay in lib/api: import from $lib/api/client.'
	},
	env: {
		group: ['$env/**'],
		message:
			'SvelteKit environment variables are read in routes/ and lib/api/client.ts only; inject the value.'
	}
};

const OPENAPI_FETCH = {
	name: 'openapi-fetch',
	message: 'HTTP calls go through lib/api/client.ts.'
};

/**
 * @param {string[]} files
 * @param {(keyof typeof FORBIDDEN)[]} forbidden
 * @param {{ ignores?: string[]; paths?: { name: string; message: string }[] }} [options]
 * @returns {import('eslint').Linter.Config}
 */
const zone = (files, forbidden, { ignores = [], paths = [OPENAPI_FETCH] } = {}) => ({
	files,
	ignores,
	rules: {
		'no-restricted-imports': [
			'error',
			{ paths, patterns: forbidden.map((name) => FORBIDDEN[name]) }
		]
	}
});

const SOURCE = '{ts,svelte,svelte.ts,js}';

/** @type {import('eslint').Linter.Config[]} */
export const importBoundaries = [
	zone([`src/lib/ui/**/*.${SOURCE}`], ['features', 'routes', 'apiContract', 'env']),
	zone([`src/lib/features/**/*.${SOURCE}`], ['routes', 'apiContract', 'env']),
	zone([`src/lib/state/**/*.${SOURCE}`], ['features', 'routes', 'apiContract', 'env']),
	// Everything else shared (i18n, validation, config...).
	zone([`src/lib/*/**/*.${SOURCE}`], ['routes', 'apiContract', 'env'], {
		ignores: [`src/lib/{ui,features,state,api,paraglide}/**`]
	}),
	// The API client is the one place that reads the backend URL and builds the HTTP client.
	zone([`src/lib/api/**/*.${SOURCE}`], ['features', 'ui', 'state', 'routes', 'env'], {
		ignores: ['src/lib/api/client.ts'],
		paths: []
	}),
	zone(['src/lib/api/client.ts'], ['features', 'ui', 'state', 'routes'], { paths: [] }),
	zone([`src/routes/**/*.${SOURCE}`], ['apiContract'])
];
