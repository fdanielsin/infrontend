import { describe, expect, it } from 'vitest';
import { EXCEPTIONS, PAIRS } from '../../e2e/support/contrast-pairs';
import { readColorTokens } from '../support/layout-tokens';

// THEME-R08, criterion 16 (guard): every color token of layout.css is on a contrast pair or is an
// exception with its reason, so that a token added without a measure cannot slip in.
const names = readColorTokens().map(({ name }) => name);
const used = new Set(PAIRS.flatMap(({ foreground, backgrounds }) => [foreground, ...backgrounds]));

describe('contrast pairs', () => {
	it.each(names)('THEME-R08: %s is on a pair or an exception (happy path)', (name) => {
		const known = used.has(name as never) || name in EXCEPTIONS;
		expect(known, `${name} is on no contrast pair and not an exception`).toBe(true);
	});

	it('THEME-R08: names only tokens that exist (sad path)', () => {
		const wrong = [...used, ...Object.keys(EXCEPTIONS)].filter(
			(name) => name !== 'page' && !names.includes(name)
		);
		expect(wrong).toEqual([]);
	});

	it('THEME-R08: an exception is a reason, and a token is not both measured as a foreground and excepted (boundary)', () => {
		for (const [name, reason] of Object.entries(EXCEPTIONS)) {
			expect(reason.length, name).toBeGreaterThan(10);
		}
		const foregrounds = new Set(PAIRS.map(({ foreground }) => foreground));
		expect(Object.keys(EXCEPTIONS).filter((name) => foregrounds.has(name as never))).toEqual([]);
	});
});
