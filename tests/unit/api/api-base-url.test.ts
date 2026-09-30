import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';

vi.mock('$env/static/public', () => ({ PUBLIC_API_URL: '' }));

describe('API client base URL', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('falls back to http://localhost:8080 when PUBLIC_API_URL is empty (limit)', async () => {
		// GIVEN: PUBLIC_API_URL is empty and the backend answers.
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('{"success":true,"data":[]}', { status: 200 }));

		// WHEN: Users are requested.
		await api.getUsers();

		// THEN: The default local backend is called.
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/api/v1/users', expect.anything());
	});
});
