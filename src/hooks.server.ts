import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { parseThemeCookie, themeAttribute } from '$lib/theme/theme';

// With the Content-Security-Policy of `svelte.config.js` (`kit.csp`), what the browser may do with
// the page (docs/security.md, SEC-R04). Static files do not go through `handle`.
const SECURITY_HEADERS = {
	'referrer-policy': 'no-referrer',
	'x-content-type-options': 'nosniff'
};

export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		event.setHeaders(SECURITY_HEADERS);
		// The choice is read from the cookie and written as a fixed literal, never as received.
		const theme = parseThemeCookie(request.headers.get('cookie'));
		event.locals.theme = theme;
		const attribute = themeAttribute(theme);
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					// Only in the <html> tag; a function, so `$&` and the like stay inert.
					.replace(/(<html\b[^>]*?)\s*%theme\.attr%/, (_match, start: string) => start + attribute)
		});
	});
