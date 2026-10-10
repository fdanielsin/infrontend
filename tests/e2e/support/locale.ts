import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type BrowserContext, type Page } from '@playwright/test';

export const LOCALES = ['en', 'fr', 'de', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

const catalogs = new Map<Locale, Record<string, string>>();

// The text of a message in a language, read from messages/<language>.json (`{name}` is replaced by
// the parameter of that name). A test that reads its expected text from the file it checks proves
// the wiring of the message, never its translation: a text only an E2E test guards is also written
// out in full in that test.
export function text(locale: Locale, key: string, params: Record<string, string> = {}): string {
	let catalog = catalogs.get(locale);
	if (!catalog) {
		catalog = JSON.parse(
			readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
		) as Record<string, string>;
		catalogs.set(locale, catalog);
	}
	return Object.entries(params).reduce(
		(message, [name, value]) => message.replace(`{${name}}`, value),
		catalog[key] ?? ''
	);
}

// The language of the interface before the page is opened: the cookie that the language selector writes.
export async function setLocaleCookie(context: BrowserContext, locale: Locale): Promise<void> {
	await context.addCookies([
		{ name: 'PARAGLIDE_LOCALE', value: locale, url: 'http://localhost:4173' }
	]);
}

// Chooses a language in the selector of the page, as a user does: the page changes without a reload.
export async function switchLanguage(page: Page, locale: Locale): Promise<void> {
	await page.locator('#language').selectOption(locale);
	await expect(page.locator('html')).toHaveAttribute('lang', locale);
}
