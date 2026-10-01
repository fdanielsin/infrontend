import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';

// Records the requests the real client sends, answering an empty user list.
function recordRequests() {
	const requests: Request[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
		requests.push(input as Request);
		return Promise.resolve(
			new Response(JSON.stringify({ success: true, data: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
	});
	return requests;
}

describe('Accept-Language sent to the API', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
		overwriteGetLocale(() => 'en');
	});

	it('sends the interface language with each request (happy path)', async () => {
		// GIVEN: An interface in German.
		const requests = recordRequests();
		new AppState().locale.set('de');

		// WHEN: Users are listed.
		await api.getUsers();

		// THEN: The request asks for German.
		expect(requests).toHaveLength(1);
		expect(requests[0]?.headers.get('Accept-Language')).toBe('de');
	});

	it('sends the new language right after a switch (boundary)', async () => {
		// GIVEN: An English interface that already sent a request.
		const requests = recordRequests();
		const app = new AppState();
		await api.getUsers();

		// WHEN: The language changes, then the next request is sent.
		app.changeLocale('es');
		await api.getUsers();

		// THEN: The first request was in English, the next one in Spanish.
		expect(requests.map((request) => request.headers.get('Accept-Language'))).toEqual(['en', 'es']);
	});

	it('replaces the Accept-Language of the browser instead of adding to it (limit)', async () => {
		// GIVEN: A French interface.
		const requests = recordRequests();
		new AppState().locale.set('fr');

		// WHEN: A request is sent.
		await api.getStats();

		// THEN: The header holds a single language.
		expect(requests[0]?.headers.get('Accept-Language')).toBe('fr');
	});
});
