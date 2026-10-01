import { afterEach, describe, expect, it } from 'vitest';
import { formatNumber } from '$lib/i18n/format';
import { overwriteGetLocale, type Locale } from '$lib/paraglide/runtime';

const TWO_DECIMALS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
// French groups with a narrow no-break space (U+202F); Spanish groups from 5 digits only.
const NNBSP = ' ';

describe('formatNumber', () => {
	afterEach(() => {
		overwriteGetLocale(() => 'en');
	});

	it.each([
		['en', '1,234.5'],
		['fr', `1${NNBSP}234,5`],
		['de', '1.234,5'],
		['es', '1234,5']
	] as const)('writes 1234.5 the %s way (happy path)', (locale: Locale, expected) => {
		// GIVEN: The interface language.
		overwriteGetLocale(() => locale);

		// WHEN / THEN: The number follows its CLDR conventions.
		expect(formatNumber(1234.5)).toBe(expected);
	});

	it.each([
		['en', '0.33'],
		['fr', '0,33'],
		['de', '0,33'],
		['es', '0,33']
	] as const)('rounds an average to 2 decimals in %s (limit)', (locale: Locale, expected) => {
		// GIVEN: The interface language.
		overwriteGetLocale(() => locale);

		// WHEN / THEN: 1/3 gets the decimal separator of the language.
		expect(formatNumber(1 / 3, TWO_DECIMALS)).toBe(expected);
	});

	it.each([
		['en', '1,000', '12,345'],
		['fr', `1${NNBSP}000`, `12${NNBSP}345`],
		['de', '1.000', '12.345'],
		['es', '1000', '12.345']
	] as const)(
		'groups thousands in %s from the CLDR threshold (boundary)',
		(locale: Locale, thousand, tenThousands) => {
			// GIVEN: The interface language.
			overwriteGetLocale(() => locale);

			// WHEN / THEN: 4 and 5 digits follow the grouping rules of the language.
			expect(formatNumber(1000)).toBe(thousand);
			expect(formatNumber(12345)).toBe(tenThousands);
		}
	);

	it.each(['en', 'fr', 'de', 'es'] as const)(
		'writes 0 and 1 plainly in %s (boundary)',
		(locale) => {
			// GIVEN: The interface language.
			overwriteGetLocale(() => locale);

			// WHEN / THEN: Small integers have no separator.
			expect(formatNumber(0)).toBe('0');
			expect(formatNumber(1)).toBe('1');
		}
	);
});
