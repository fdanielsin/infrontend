import type { RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { handle } from '../../../src/hooks.server';

// The server writes the theme into <html> from the cookie (THEME-R05, THEME-R06): one of two fixed
// literals, never the received value.
const MARKER = 'xss-marker-7f3a';
const SHELL =
	'<!doctype html>\n<html lang="%paraglide.lang%" %theme.attr%><head></head><body></body></html>';

async function render(cookie: string | null, html = SHELL) {
	const headers = new Headers();
	if (cookie !== null) headers.set('cookie', cookie);
	const event = {
		request: new Request('http://localhost/', { headers }),
		url: new URL('http://localhost/'),
		locals: {} as App.Locals,
		setHeaders: () => {}
	} as unknown as RequestEvent;
	let chunk = '';
	await handle({
		event,
		resolve: async (_event, options) => {
			chunk = options?.transformPageChunk
				? ((await options.transformPageChunk({ html, done: true })) as string)
				: html;
			return new Response(chunk);
		}
	});
	return { chunk, locals: event.locals };
}

describe('hooks.server theme', () => {
	it.each([
		['theme=dark', ' data-theme="dark"', 'dark'],
		['theme=light', ' data-theme="light"', 'light'],
		['a=1; theme=dark', ' data-theme="dark"', 'dark']
	])(
		'writes the explicit choice of %s into <html> (happy path)',
		async (cookie, attribute, theme) => {
			const { chunk, locals } = await render(cookie);
			expect(chunk).toContain(`lang="en"${attribute}>`);
			expect(locals.theme).toBe(theme);
		}
	);

	it.each([
		null,
		'',
		'a=1',
		'theme=Dark',
		'theme=dark; theme=light',
		`theme="><script>${MARKER}</script>`
	])('writes no attribute for %j and never the received value (limit)', async (cookie) => {
		const { chunk, locals } = await render(cookie);
		expect(chunk).toContain('<html lang="en">');
		expect(chunk).not.toContain('data-theme');
		expect(chunk).not.toContain(MARKER);
		expect(locals.theme).toBeNull();
	});

	it('replaces the placeholder in <html> only, and not text that looks like it (boundary)', async () => {
		const page = `${SHELL}<p>%theme.attr% $& $1</p>`;
		const { chunk } = await render('theme=dark', page);
		expect(chunk).toContain('<html lang="en" data-theme="dark">');
		expect(chunk).toContain('<p>%theme.attr% $& $1</p>');
	});
});
