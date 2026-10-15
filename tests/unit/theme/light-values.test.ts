import { describe, expect, it } from 'vitest';
import { readColorTokens } from '../support/layout-tokens';

// THEME-R08: "passing to the token set changes no pixel of the light theme". The light value of every
// color token is pinned here, as it was before the dark palette: a change of a light value, on purpose
// or by a slip in the first argument of `light-dark()`, makes this test red and must be written down
// here with its reason. (The dark values are not pinned: they are the designer's to adjust, and the
// contrast pairs of tests/e2e/support/contrast-pairs.ts are what keeps them readable.)
const LIGHT: Record<string, string> = {
	'--color-surface': 'var(--color-white)',
	'--color-surface-muted': 'var(--color-gray-100)',
	'--color-surface-hover': 'var(--color-gray-200)',
	'--color-surface-selected': 'var(--color-blue-100)',
	'--color-line': 'var(--color-gray-300)',
	'--color-field-border': 'var(--color-gray-500)',
	'--color-disabled': 'var(--color-gray-400)',
	'--color-control-edge': 'transparent',
	'--color-heading': 'var(--color-gray-900)',
	'--color-label': 'var(--color-gray-700)',
	'--color-muted': 'var(--color-gray-600)',
	'--color-subtle': 'var(--color-gray-500)',
	'--color-primary': 'var(--color-blue-600)',
	'--color-primary-hover': 'var(--color-blue-700)',
	'--color-action-strong': 'var(--color-blue-700)',
	'--color-action-strong-hover': 'var(--color-blue-900)',
	'--color-success': 'var(--color-green-700)',
	'--color-success-solid': 'var(--color-green-700)',
	'--color-danger': 'var(--color-red-700)',
	'--color-danger-solid': 'var(--color-red-700)',
	'--color-danger-hover': 'var(--color-red-900)',
	'--color-danger-soft': 'var(--color-red-100)',
	'--color-warning': 'var(--color-amber-700)',
	'--color-info': 'var(--color-gray-800)',
	'--color-success-edge': 'var(--color-green-900)',
	'--color-danger-edge': 'var(--color-red-950)',
	'--color-warning-edge': 'var(--color-amber-900)',
	'--color-info-edge': 'var(--color-gray-950)',
	'--color-accent': 'var(--color-blue-600)',
	'--color-focus': 'var(--color-blue-700)',
	'--color-focus-inverse': 'var(--color-white)',
	'--color-on-primary': 'var(--color-white)',
	'--color-on-toast': 'var(--color-white)',
	'--color-on-toast-hover': 'color-mix(in oklab, var(--color-white) 20%, transparent)',
	'--color-page-from': 'var(--color-blue-50)',
	'--color-page-to': 'var(--color-indigo-100)'
};

const tokens = readColorTokens();

describe('light values of the color tokens', () => {
	it('THEME-R08: pins every color token, no more and no less (boundary)', () => {
		expect(tokens.map(({ name }) => name).sort()).toEqual(Object.keys(LIGHT).sort());
	});

	it.each(Object.entries(LIGHT))(
		'THEME-R08: %s keeps its light value (happy path)',
		(name, expected) => {
			expect(tokens.find((token) => token.name === name)!.light).toBe(expected);
		}
	);
});
