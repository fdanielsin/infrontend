import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['en', 'fr', 'de', 'es'] as const;
const NO_BREAK_SPACE = '\u00a0';

function messages(locale: string): [string, string][] {
	const all = JSON.parse(
		readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
	) as Record<string, string>;
	return Object.entries(all).filter(([key]) => key !== '$schema');
}

describe('message typography', () => {
	it.each(LOCALES)(
		'uses the ellipsis character, never three dots, in %s (happy path)',
		(locale) => {
			// GIVEN / WHEN: Every message of the language.
			const withThreeDots = messages(locale).filter(([, text]) => text.includes('...'));

			// THEN: None writes an ellipsis as three dots.
			expect(withThreeDots).toEqual([]);
		}
	);

	it('puts a no-break space before the high punctuation in fr (happy path)', () => {
		// GIVEN / WHEN: The messages where ":", ";", "?" or "!" is not preceded by a no-break space.
		const wrong = messages('fr').filter(([, text]) => /(?<!\u00a0)[:;?!]/.test(text));

		// THEN: There is none; French puts a no-break space before them.
		expect(wrong).toEqual([]);
	});

	it('does not leave a plain space before the high punctuation in fr (sad path)', () => {
		const wrong = messages('fr').filter(([, text]) => /[ \t][:;?!]/.test(text));
		expect(wrong).toEqual([]);
	});

	it.each(['en', 'de', 'es'] as const)(
		'has no space before ":" and no no-break space in %s (limit)',
		(locale) => {
			const wrong = messages(locale).filter(
				([, text]) => /\s:/.test(text) || text.includes(NO_BREAK_SPACE)
			);
			expect(wrong).toEqual([]);
		}
	);

	it('has the no-break space rule applied to at least one fr message (boundary)', () => {
		// GIVEN / WHEN: The French messages that use it.
		const using = messages('fr').filter(([, text]) => text.includes(`${NO_BREAK_SPACE}:`));

		// THEN: The rule is not vacuous: the file does contain such messages.
		expect(using.length).toBeGreaterThan(0);
	});
});
