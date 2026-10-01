import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['en', 'fr', 'de', 'es'] as const;
const ROOT = process.cwd();

type Messages = Record<string, unknown>;

function messagesOf(locale: string): Messages {
	return JSON.parse(readFileSync(resolve(ROOT, 'messages', `${locale}.json`), 'utf8')) as Messages;
}

function translationKeys(messages: Messages) {
	return Object.keys(messages)
		.filter((key) => !key.startsWith('$'))
		.sort();
}

function parametersOf(value: unknown) {
	const text = typeof value === 'string' ? value : JSON.stringify(value);
	return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

function sourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		if (name === 'paraglide') return [];
		return statSync(path).isDirectory() ? sourceFiles(path) : [path];
	});
}

// The error codes of the contract, read from the generated client types.
function contractErrorCodes() {
	const schema = readFileSync(resolve(ROOT, 'src/lib/api/schema.d.ts'), 'utf8');
	const union = /ErrorCode:\s*([^;]+);/.exec(schema)?.[1] ?? '';
	return [...union.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1] ?? '');
}

const reference = messagesOf('en');

describe('translation files', () => {
	it.each(LOCALES.filter((locale) => locale !== 'en'))(
		'%s has exactly the keys of English (happy path)',
		(locale) => {
			// GIVEN / WHEN: The English and the other file.
			// THEN: No key is missing and none is extra.
			expect(translationKeys(messagesOf(locale))).toEqual(translationKeys(reference));
		}
	);

	it.each(LOCALES)('%s has no empty translation (limit)', (locale) => {
		// GIVEN / WHEN: Every translation of the language.
		const empty = translationKeys(messagesOf(locale)).filter((key) => {
			const value = messagesOf(locale)[key];
			return typeof value !== 'string' || value.trim() === '';
		});

		// THEN: None is empty or blank.
		expect(empty).toEqual([]);
	});

	it.each(LOCALES.filter((locale) => locale !== 'en'))(
		'%s uses the same parameters as English in every message (limit)',
		(locale) => {
			// GIVEN: The other file.
			const messages = messagesOf(locale);

			// WHEN: The parameters of each message are compared.
			const mismatches = translationKeys(reference).filter(
				(key) =>
					JSON.stringify(parametersOf(messages[key])) !==
					JSON.stringify(parametersOf(reference[key]))
			);

			// THEN: Each message takes the same {parameters}.
			expect(mismatches).toEqual([]);
		}
	);

	it('keeps typographic characters of each language as written (limit)', () => {
		// GIVEN / WHEN: Messages with apostrophes and accents.
		// THEN: They are stored as written, not escaped or stripped.
		expect(messagesOf('fr').stats_back_home).toBe("← Retour à l'accueil");
		expect(messagesOf('es').stats_page_title).toBe('Estadísticas - inBackend');
		expect(messagesOf('de').stats_no_data).toBe('Keine Daten verfügbar');
	});

	it('uses every English key somewhere in the source code (boundary)', () => {
		// GIVEN: All source files except the generated messages.
		const source = sourceFiles(resolve(ROOT, 'src'))
			.map((path) => readFileSync(path, 'utf8'))
			.join('\n');

		// WHEN: Each key is looked up as `m.<key>`.
		const unused = translationKeys(reference).filter((key) => !source.includes(`m.${key}`));

		// THEN: No translation is orphaned.
		expect(unused).toEqual([]);
	});
});

describe('error code translations', () => {
	const codes = contractErrorCodes();

	it('reads the 11 error codes of the contract (boundary)', () => {
		// GIVEN / WHEN: The generated client types.
		// THEN: All codes of the lot D contract are there.
		expect(codes).toHaveLength(11);
	});

	it.each(LOCALES)('%s translates every error code of the contract (happy path)', (locale) => {
		// GIVEN: The translations of the language.
		const messages = messagesOf(locale);

		// WHEN: Each code is looked up as error_<code>.
		const missing = codes.filter((code) => {
			const value = messages[`error_${code.toLowerCase()}`];
			return typeof value !== 'string' || value.trim() === '';
		});

		// THEN: None is missing.
		expect(missing).toEqual([]);
	});
});
