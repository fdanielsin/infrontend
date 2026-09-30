import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';

vi.mock('$env/static/public', () => ({ PUBLIC_API_URL: 'http://api.test' }));

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function mockFetch(response: Response | (() => Promise<Response>)) {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(
			typeof response === 'function' ? response : () => Promise.resolve(response)
		);
}

describe('API client', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('requests (happy path)', () => {
		const task = { title: 'Buy milk', description: 'Semi-skimmed', user_id: 1, completed: false };
		const cases: {
			name: string;
			call: () => Promise<unknown>;
			url: string;
			init: RequestInit;
		}[] = [
			{ name: 'health', call: () => api.health(), url: '/health', init: {} },
			{ name: 'getUsers', call: () => api.getUsers(), url: '/api/v1/users', init: {} },
			{ name: 'getUser', call: () => api.getUser(7), url: '/api/v1/users/7', init: {} },
			{
				name: 'createUser',
				call: () => api.createUser({ name: 'Ada', email: 'ada@example.com' }),
				url: '/api/v1/users',
				init: { method: 'POST', body: '{"name":"Ada","email":"ada@example.com"}' }
			},
			{
				name: 'getUserTasks',
				call: () => api.getUserTasks(7),
				url: '/api/v1/users/7/tasks',
				init: {}
			},
			{
				name: 'createTask',
				call: () => api.createTask(task),
				url: '/api/v1/tasks',
				init: { method: 'POST', body: JSON.stringify(task) }
			},
			{
				name: 'updateTask',
				call: () => api.updateTask(10, { completed: false }),
				url: '/api/v1/tasks/10',
				init: { method: 'PUT', body: '{"completed":false}' }
			},
			{
				name: 'deleteTask',
				call: () => api.deleteTask(10),
				url: '/api/v1/tasks/10',
				init: { method: 'DELETE' }
			},
			{ name: 'getStats', call: () => api.getStats(), url: '/api/v1/stats', init: {} }
		];

		for (const { name, call, url, init } of cases) {
			it(`${name} calls ${init.method ?? 'GET'} ${url} with JSON headers`, async () => {
				// GIVEN: A backend answering 200.
				const fetchMock = mockFetch(jsonResponse({ success: true }));

				// WHEN: The method is called.
				await call();

				// THEN: Exactly one request with the base URL, method, body and headers.
				expect(fetchMock).toHaveBeenCalledTimes(1);
				expect(fetchMock).toHaveBeenCalledWith(`http://api.test${url}`, {
					...init,
					headers: JSON_HEADERS
				});
			});
		}
	});

	it('returns the 200 envelope as sent by the backend (happy path)', async () => {
		// GIVEN: The backend returns statistics.
		mockFetch(jsonResponse({ success: true, data: { users: 2, tasks: 3 } }));

		// WHEN / THEN: The envelope is returned unchanged.
		await expect(api.getStats()).resolves.toEqual({ success: true, data: { users: 2, tasks: 3 } });
	});

	it('returns the DELETE 200 envelope of the contract (happy path)', async () => {
		// GIVEN: The backend answers DELETE with 200 and a message (openapi.yaml, no 204).
		mockFetch(jsonResponse({ success: true, message: 'Task deleted' }));

		// WHEN / THEN: The message reaches the caller.
		await expect(api.deleteTask(42)).resolves.toEqual({ success: true, message: 'Task deleted' });
	});

	it('answers a 204 without parsing a body (happy path, convention; no endpoint of the contract returns 204)', async () => {
		// GIVEN: A response without content.
		mockFetch(new Response(null, { status: 204 }));

		// WHEN / THEN: The client reports success instead of a JSON parse error.
		await expect(api.health()).resolves.toEqual({ success: true });
	});

	it.each([404, 500])('turns HTTP %i into an explicit failure (sad path)', async (status) => {
		// GIVEN: The backend answers with an error status.
		mockFetch(jsonResponse({ success: false, error: 'Task not found' }, status));

		// WHEN / THEN: The client reports the status code.
		await expect(api.getUsers()).resolves.toEqual({ success: false, error: `HTTP ${status}` });
	});

	it.each([
		[299, true],
		[300, false],
		[399, false],
		[400, false]
	])('treats HTTP %i as success=%s (boundary of response.ok)', async (status, ok) => {
		// GIVEN: A backend answering with a status at a boundary of the 2xx range.
		mockFetch(jsonResponse({ success: true, data: [] }, status));

		// WHEN: Users are requested.
		const response = await api.getUsers();

		// THEN: Only 2xx statuses are parsed as a success.
		expect(response).toEqual(
			ok ? { success: true, data: [] } : { success: false, error: `HTTP ${status}` }
		);
	});

	it('does not parse the body of an error response (sad path, HTML error page)', async () => {
		// GIVEN: A proxy returns an HTML error page.
		mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }));

		// WHEN / THEN: The client fails with the status instead of a JSON parse error.
		await expect(api.getStats()).resolves.toEqual({ success: false, error: 'HTTP 502' });
	});

	it('returns a failure when the network is down (exception)', async () => {
		// GIVEN: fetch rejects as browsers do when the backend is unreachable.
		mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));

		// WHEN / THEN: The caller receives a failure instead of an exception.
		await expect(api.getUsers()).resolves.toEqual({ success: false, error: 'Failed to fetch' });
	});

	it('returns a generic failure when fetch rejects with a non-Error value (exception)', async () => {
		// GIVEN: fetch rejects with a plain value.
		mockFetch(() => Promise.reject('offline'));

		// WHEN / THEN: The message falls back to "Unknown error".
		await expect(api.getUsers()).resolves.toEqual({ success: false, error: 'Unknown error' });
	});
});
