import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { m } from '$lib/paraglide/messages';
import { getLocale, overwriteGetLocale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';

function clearLanguageCookie() {
	document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
}

// Simulates a browser that refuses cookies: writing document.cookie throws.
function blockCookies() {
	Object.defineProperty(document, 'cookie', {
		configurable: true,
		get: () => '',
		set: () => {
			throw new DOMException('Cookies are disabled', 'SecurityError');
		}
	});
}

function unblockCookies() {
	// Removes the instance property: the Document.prototype accessor applies again.
	Reflect.deleteProperty(document, 'cookie');
}

describe('interface language', () => {
	beforeEach(() => {
		clearLanguageCookie();
		document.documentElement.lang = 'en';
	});

	afterEach(() => {
		unblockCookies();
		clearLanguageCookie();
		overwriteGetLocale(() => 'en');
	});

	it('starts in English for an English browser without cookie (happy path)', () => {
		// GIVEN / WHEN: A fresh application state (jsdom browser in en-US).
		const app = new AppState();

		// THEN: English is active and the four languages are offered.
		expect(app.locale.current).toBe('en');
		expect(app.locale.available).toEqual(['en', 'fr', 'de', 'es']);
	});

	it('switches every message, the document language and the cookie, without reloading (happy path)', () => {
		// GIVEN: An English interface.
		const app = new AppState();
		expect(m.tasks_empty()).toBe('No tasks yet');

		// WHEN: French is chosen.
		app.locale.set('fr');

		// THEN: Messages, <html lang> and the cookie follow; the page stays the same document.
		expect(app.locale.current).toBe('fr');
		expect(getLocale()).toBe('fr');
		expect(m.tasks_empty()).not.toBe('No tasks yet');
		expect(document.documentElement.lang).toBe('fr');
		expect(document.cookie).toContain('PARAGLIDE_LOCALE=fr');
	});

	it('clears the errors shown by both features and keeps the toasts (happy path)', () => {
		// GIVEN: An error in each feature and a toast.
		const app = new AppState();
		app.users.status.error = 'Email already in use';
		app.tasks.status.error = 'Task not found';
		app.tasks.status.loading = true;
		app.notifications.add('Saved', 'success', { duration: 0 });

		// WHEN: The language changes.
		app.changeLocale('de');

		// THEN: Errors are gone, the toast and the loading state are untouched.
		expect(app.users.status.error).toBeNull();
		expect(app.tasks.status.error).toBeNull();
		expect(app.tasks.status.loading).toBe(true);
		expect(app.notifications.items.map((toast) => toast.message)).toEqual(['Saved']);
	});

	it('still switches the page when cookies are refused, without any error (sad path)', async () => {
		// GIVEN: A browser that refuses cookies, and a watch on unhandled rejections.
		const app = new AppState();
		blockCookies();
		const unhandled = vi.fn();
		process.on('unhandledRejection', unhandled);
		window.addEventListener('unhandledrejection', unhandled);

		// WHEN: Spanish is chosen.
		expect(() => app.changeLocale('es')).not.toThrow();
		await new Promise((resolve) => setTimeout(resolve, 0));

		// THEN: The page is in Spanish; nothing is left unhandled.
		expect(app.locale.current).toBe('es');
		expect(document.documentElement.lang).toBe('es');
		expect(getLocale()).toBe('es');
		expect(unhandled).not.toHaveBeenCalled();
		process.off('unhandledRejection', unhandled);
		window.removeEventListener('unhandledrejection', unhandled);
	});

	it('can choose the active language again without change (boundary)', () => {
		// GIVEN: French active.
		const app = new AppState();
		app.locale.set('fr');

		// WHEN: French is chosen again.
		app.locale.set('fr');

		// THEN: Still French, one cookie value.
		expect(app.locale.current).toBe('fr');
		expect(document.cookie.match(/PARAGLIDE_LOCALE=/g)).toHaveLength(1);
	});

	it('gives the messages to the latest application state (limit)', () => {
		// GIVEN: A first state switched to German.
		const first = new AppState();
		first.locale.set('de');

		// WHEN: A second state is created and switched to Spanish.
		const second = new AppState();
		second.locale.set('es');

		// THEN: Messages follow the state that renders the page.
		expect(getLocale()).toBe('es');
		expect(first.locale.current).toBe('de');
	});
});
