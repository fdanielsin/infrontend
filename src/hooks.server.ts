import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';

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
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});
