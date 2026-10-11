// The Content-Security-Policy of the site (docs/security.md, SEC-R04). Kept out of svelte.config.js
// so that a test can import it. Plain JavaScript: svelte.config.js is loaded by Node, not by Vite.

export const ANNOUNCER_STYLE_HASH = "'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='";

/**
 * The origin of the API that the page may call, from PUBLIC_API_URL. There is no default address:
 * a missing or wrong one stops the build instead of opening the policy to a guess.
 * @param {string | undefined} apiUrl
 */
export function apiOrigin(apiUrl) {
	const message = `PUBLIC_API_URL must be an absolute http(s) URL such as https://api.example.com: its origin is the only external address the Content-Security-Policy allows (got ${JSON.stringify(apiUrl)})`;
	/** @type {URL} */
	let url;
	try {
		url = new URL((apiUrl ?? '').trim());
	} catch {
		throw new Error(message);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(message);
	return url.origin;
}

/**
 * Directives for `kit.csp`: SvelteKit adds the nonce of its start script to `script-src` and quotes
 * the keywords (`self`, `none`). Everything not listed is denied by `default-src 'none'`.
 * @param {string | undefined} apiUrl
 */
export function cspDirectives(apiUrl) {
	return {
		'default-src': ['none'],
		'script-src': ['self'],
		'style-src': ['self'],
		// The one inline style SvelteKit writes on the client: the route announcer. Allowed by its
		// hash only (`unsafe-hashes` is what lets a hash match a style attribute). The hash is the
		// one of the attribute in SvelteKit's `write_root.js`; a test compares them.
		'style-src-attr': ['unsafe-hashes', ANNOUNCER_STYLE_HASH],
		// `data:`: Vite inlines the small favicon in the page.
		'img-src': ['self', 'data:'],
		'connect-src': ['self', apiOrigin(apiUrl)],
		'base-uri': ['self'],
		'form-action': ['self'],
		'frame-ancestors': ['none'],
		'object-src': ['none']
	};
}
