import type { RequestEvent, ResolveOptions } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { extractLocaleFromRequest } from '$lib/paraglide/runtime';
import { handle } from '../../../src/hooks.server';

function requestWith(headers: Record<string, string>) {
	return new Request('http://localhost/', { headers });
}

function localeOf(headers: Record<string, string>) {
	return extractLocaleFromRequest(requestWith(headers));
}

// Runs the server hook as SvelteKit would, with a page that carries the lang placeholder.
async function renderedHtml(headers: Record<string, string>) {
	const event = { request: requestWith(headers), url: new URL('http://localhost/') };
	const resolve = vi.fn(async (_event: RequestEvent, options?: ResolveOptions) => {
		const html = await options?.transformPageChunk?.({
			html: '<html lang="%paraglide.lang%"><body></body></html>',
			done: true
		});
		return new Response(html, { headers: { 'content-type': 'text/html' } });
	});
	const response = await handle({ event: event as unknown as RequestEvent, resolve });
	return response.text();
}

describe('language of a request (cookie, then Accept-Language, then English)', () => {
	it('takes the language cookie first (happy path)', () => {
		// GIVEN / WHEN: A cookie for French and a browser asking for German.
		// THEN: The explicit choice wins.
		expect(localeOf({ cookie: 'PARAGLIDE_LOCALE=fr', 'accept-language': 'de' })).toBe('fr');
	});

	it('takes the browser language without cookie (happy path)', () => {
		// GIVEN / WHEN / THEN: A German browser.
		expect(localeOf({ 'accept-language': 'de-DE,de;q=0.9' })).toBe('de');
	});

	it('falls back to English without cookie nor header (happy path)', () => {
		// GIVEN / WHEN / THEN: A bare request.
		expect(localeOf({})).toBe('en');
	});

	it.each([
		['an unsupported language', 'PARAGLIDE_LOCALE=it'],
		['an empty value', 'PARAGLIDE_LOCALE='],
		['a path', 'PARAGLIDE_LOCALE=../../etc/passwd'],
		['a very long value', `PARAGLIDE_LOCALE=${'x'.repeat(10_000)}`]
	])('ignores a cookie with %s and uses the browser language (sad path)', (_case, cookie) => {
		// GIVEN / WHEN: An invalid cookie and a Spanish browser.
		// THEN: The cookie is ignored.
		expect(localeOf({ cookie, 'accept-language': 'es' })).toBe('es');
	});

	it.each([
		['the highest weight', 'es;q=0.5, de;q=0.9', 'de'],
		['the base of a regional variant', 'fr-CA', 'fr'],
		['the first supported one', 'it, pt-BR;q=0.9, fr;q=0.1', 'fr'],
		['English for a wildcard', '*', 'en'],
		['English for unsupported languages only', 'it, pt-BR', 'en']
	])('chooses %s (limit)', (_case, acceptLanguage, expected) => {
		// GIVEN / WHEN / THEN: The browser preferences.
		expect(localeOf({ 'accept-language': acceptLanguage })).toBe(expected);
	});

	it('keeps the order of appearance for equal weights (boundary)', () => {
		// GIVEN / WHEN / THEN: German and French with the same weight.
		expect(localeOf({ 'accept-language': 'de;q=0.8, fr;q=0.8' })).toBe('de');
	});

	it.each([';;q=abc', 'q=;,,', ','])(
		'falls back to English on the malformed header %j without failing (exception)',
		(acceptLanguage) => {
			// GIVEN / WHEN / THEN: A broken header.
			expect(localeOf({ 'accept-language': acceptLanguage })).toBe('en');
		}
	);
});

describe('server hook', () => {
	it.each([
		[{ 'accept-language': 'de' }, 'de'],
		[{ cookie: 'PARAGLIDE_LOCALE=es', 'accept-language': 'fr' }, 'es'],
		[{}, 'en']
	])(
		'renders the page in the request language %#: <html lang> (happy path)',
		async (headers, lang) => {
			// GIVEN / WHEN: A page rendered for the request.
			const html = await renderedHtml(headers);

			// THEN: The lang placeholder is replaced, server side.
			expect(html).toContain(`<html lang="${lang}">`);
			expect(html).not.toContain('%paraglide.lang%');
		}
	);
});
