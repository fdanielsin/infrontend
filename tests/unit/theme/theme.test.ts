import { describe, expect, it } from 'vitest';
import { parseThemeCookie, themeAttribute, writeThemeCookie } from '$lib/theme/theme';

// THEME-R04 and THEME-R06: the cookie is read strictly and only two fixed literals ever reach the
// HTML. Every hostile value below must come out as "System" (null), never as an error.
const MARKER = 'xss-marker-7f3a';

describe('parseThemeCookie', () => {
	it.each([
		['theme=light', 'light'],
		['theme=dark', 'dark'],
		['a=1; theme=dark', 'dark'],
		['theme=light; PARAGLIDE_LOCALE=fr', 'light'],
		['a=1; theme=dark; b=2', 'dark']
	])('accepts %s (happy path)', (header, expected) => {
		expect(parseThemeCookie(header)).toBe(expected);
	});

	it.each([
		['no header', null],
		['an empty header', ''],
		['no theme cookie', 'a=1; b=2'],
		['a capital', 'theme=Dark'],
		['all capitals', 'theme=DARK'],
		['a trailing space inside the pair', 'theme=dark ; a=1'],
		['a leading space in the value', 'theme= dark'],
		['an empty value', 'theme='],
		['a name with another case', 'Theme=dark'],
		['a name that only ends with theme', 'subtheme=dark'],
		['a long value', `theme=${'a'.repeat(4096)}`],
		['a broken percent encoding', 'theme=%E0%A4%A'],
		['an encoded dark', 'theme=%64ark'],
		['__proto__', 'theme=__proto__'],
		['constructor', 'theme=constructor'],
		['toString', 'theme=toString'],
		['two theme cookies', 'theme=dark; theme=light'],
		['the same value twice', 'theme=dark; theme=dark'],
		['unicode', 'theme=dárk‮'],
		['a null byte', 'theme=dark\u0000'],
		['a script', `theme="><script>${MARKER}</script>`],
		['a value with a quote', 'theme="dark"'],
		['another value', 'theme=system'],
		['the other cookie only', 'other=theme=dark']
	])('answers System for %s (limit)', (_name, header) => {
		expect(parseThemeCookie(header)).toBeNull();
	});
});

describe('themeAttribute', () => {
	it.each([
		['light', ' data-theme="light"'],
		['dark', ' data-theme="dark"'],
		[null, '']
	] as const)('writes the fixed literal for %s (happy path)', (theme, expected) => {
		expect(themeAttribute(theme)).toBe(expected);
	});

	it('never writes what it was given (boundary)', () => {
		const hostile = `dark"><script>${MARKER}</script>` as unknown as 'dark';
		expect(themeAttribute(hostile)).toBe('');
	});
});

describe('writeThemeCookie', () => {
	it.each([
		['light', 'theme=light; Path=/; SameSite=Lax; Max-Age=31536000'],
		['dark', 'theme=dark; Path=/; SameSite=Lax; Max-Age=31536000'],
		['system', 'theme=; Path=/; SameSite=Lax; Max-Age=0']
	] as const)(
		'writes the cookie of %s with its attributes only (happy path)',
		(choice, written) => {
			const writes: string[] = [];
			writeThemeCookie(choice, {
				set cookie(value: string) {
					writes.push(value);
				}
			} as unknown as Document);
			expect(writes).toEqual([written]);
			expect(written).not.toMatch(/Domain|HttpOnly/i);
		}
	);

	it('does nothing visible when the setter does nothing (limit)', () => {
		expect(() => writeThemeCookie('dark', {} as unknown as Document)).not.toThrow();
	});

	it('does not throw when the setter throws (limit)', () => {
		const refusing = {
			set cookie(_value: string) {
				throw new DOMException('denied', 'SecurityError');
			}
		} as unknown as Document;
		expect(() => writeThemeCookie('dark', refusing)).not.toThrow();
	});
});
