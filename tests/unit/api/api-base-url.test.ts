import { afterEach, describe, expect, it, vi } from 'vitest';

describe('API client base URL', () => {
	afterEach(() => {
		vi.resetModules();
		vi.doUnmock('$env/static/public');
	});

	it('cannot be loaded when PUBLIC_API_URL is empty: no fallback to a local backend (error)', async () => {
		// GIVEN: PUBLIC_API_URL is empty.
		vi.doMock('$env/static/public', () => ({ PUBLIC_API_URL: '' }));

		// WHEN / THEN: The client refuses to load, and says why.
		await expect(import('$lib/api/client')).rejects.toThrow(/PUBLIC_API_URL is empty/);
	});

	it('calls the backend it is given (happy path)', async () => {
		// GIVEN: PUBLIC_API_URL is set and the backend answers.
		vi.doMock('$env/static/public', () => ({ PUBLIC_API_URL: 'http://api.test' }));
		const { api } = await import('$lib/api/client');
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('{"success":true,"data":[]}', { status: 200 }));

		// WHEN: Users are requested.
		await api.getUsers();

		// THEN: The given backend is called.
		const request = fetchMock.mock.calls[0]?.[0] as Request;
		expect(request.url).toBe('http://api.test/api/v1/users');
		fetchMock.mockRestore();
	});
});
