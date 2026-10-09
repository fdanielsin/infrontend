import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The first language detection happens when the application state is built, during
// hydration. Each test loads fresh modules, as a page load would.
async function freshAppState() {
	vi.resetModules();
	const { AppState } = await import('$lib/state/app-state.svelte');
	return new AppState();
}

describe('first language detection', () => {
	// The first import transforms the whole module graph, which can exceed the default
	// timeout under load; later imports hit the cache. Warm it once, outside any test.
	beforeAll(async () => {
		await import('$lib/state/app-state.svelte');
	}, 60_000);

	beforeEach(() => {
		document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
	});

	afterEach(() => {
		vi.restoreAllMocks();
		Reflect.deleteProperty(document, 'cookie');
		document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
	});

	it('stores no language cookie without an explicit choice (limit)', async () => {
		// GIVEN / WHEN: A first visit, the state built from the browser language.
		const app = await freshAppState();

		// THEN: English is active and nothing is remembered yet.
		expect(app.locale.current).toBe('en');
		expect(document.cookie).not.toContain('PARAGLIDE_LOCALE');
	});

	it('keeps the language already chosen over the browser language (happy path)', async () => {
		// GIVEN: A returning visitor who chose French, in a browser set to English.
		vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
		document.cookie = 'PARAGLIDE_LOCALE=fr; path=/';

		// WHEN: The application state is built during hydration.
		const app = await freshAppState();

		// THEN: The remembered choice wins.
		expect(app.locale.current).toBe('fr');
	});

	it('ignores a remembered language that is not offered (boundary)', async () => {
		// GIVEN: A cookie holding a language the interface does not have, in a French browser.
		vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR']);
		document.cookie = 'PARAGLIDE_LOCALE=xx; path=/';

		// WHEN / THEN: The browser language is used.
		const app = await freshAppState();
		expect(app.locale.current).toBe('fr');
	});

	it('builds the state when the browser refuses cookies (sad path)', async () => {
		// GIVEN: A browser where writing document.cookie throws.
		Object.defineProperty(document, 'cookie', {
			configurable: true,
			get: () => '',
			set: () => {
				throw new DOMException('Cookies are disabled', 'SecurityError');
			}
		});

		// WHEN / THEN: The application state, built during hydration, does not fail.
		const app = await freshAppState();
		expect(app.locale.current).toBe('en');
	});
	// Reading document.cookie throws in a sandboxed iframe or with third-party storage blocked.
	function refuseCookieReads() {
		Object.defineProperty(document, 'cookie', {
			configurable: true,
			get: () => {
				throw new DOMException('Cookies are disabled', 'SecurityError');
			},
			set: () => {}
		});
	}

	it('falls back to the browser language when the cookie cannot be read (exception)', async () => {
		// GIVEN: A browser in French that refuses to let the page read its cookies.
		vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR']);
		refuseCookieReads();

		// WHEN: The application state is built during hydration.
		const app = await freshAppState();

		// THEN: The interface follows the browser language, without failing.
		expect(app.locale.current).toBe('fr');
	});

	it('falls back to English when the cookie cannot be read and the browser language is not offered (boundary)', async () => {
		// GIVEN: A browser in Japanese that refuses cookie reads.
		vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP']);
		refuseCookieReads();

		// WHEN / THEN: The base language is used.
		const app = await freshAppState();
		expect(app.locale.current).toBe('en');
	});
});
