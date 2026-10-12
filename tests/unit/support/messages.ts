import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locale } from '$lib/paraglide/runtime';

export const LOCALES: readonly Locale[] = ['en', 'fr', 'de', 'es'];

// The translations of a language, as written in messages/<language>.json.
export function messagesOf(locale: string): Record<string, string> {
	return JSON.parse(
		readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
	) as Record<string, string>;
}

// The expected text is read from the file, never copied: a missing key is an error of the test.
export function translation(locale: Locale, key: string): string {
	const text = messagesOf(locale)[key];
	if (text === undefined) throw new Error(`messages/${locale}.json has no key ${key}`);
	return text;
}
