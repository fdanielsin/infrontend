import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// THEME-R08: each color token is written once, for both themes, with `light-dark()`. Only the
// colors that are the same in both themes (white on a colored fill) are written without it.
const css = readFileSync('src/routes/layout.css', 'utf8');
const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)![1]!;

const tokens = [...theme.matchAll(/(--color-[a-z-]+):\s*([\s\S]*?);/g)].map(
	(match) => [match[1]!, match[2]!.replace(/\/\*[\s\S]*?\*\//g, '').trim()] as const
);
const SAME_IN_BOTH = [
	'--color-focus-inverse',
	'--color-on-primary',
	'--color-on-toast',
	'--color-on-toast-hover'
];

describe('color tokens of layout.css', () => {
	it('THEME-R08: finds the tokens (boundary)', () => {
		expect(tokens.length).toBeGreaterThan(25);
	});

	it.each(tokens.filter(([name]) => !SAME_IN_BOTH.includes(name)))(
		'THEME-R08: %s is written with light-dark() (happy path)',
		(_name, value) => {
			expect(value).toMatch(/^light-dark\(/);
		}
	);

	it.each(SAME_IN_BOTH)(
		'THEME-R08: %s is white in both themes, so written once (boundary)',
		(name) => {
			const value = tokens.find(([token]) => token === name)![1];
			expect(value).not.toMatch(/light-dark\(/);
		}
	);

	it('THEME-R09: declares color-scheme for System, Light and Dark (happy path)', () => {
		expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light dark/);
		expect(css).toMatch(/:root\[data-theme='light'\]\s*\{[^}]*color-scheme:\s*light/);
		expect(css).toMatch(/:root\[data-theme='dark'\]\s*\{[^}]*color-scheme:\s*dark/);
	});
});
