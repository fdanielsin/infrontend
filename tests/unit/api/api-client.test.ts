import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';
import { jsonResponse, requestOf, stubFetch } from '../support/fetch';

vi.mock('$env/static/public', () => ({ PUBLIC_API_URL: 'http://api.test' }));

const DOWN = { success: false, error: 'Database unavailable', error_code: 'DATABASE_UNAVAILABLE' };

describe('API client', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('requests (happy path)', () => {
		const task = { title: 'Buy milk', description: 'Semi-skimmed', user_id: 1, completed: false };
		const cases: {
			name: string;
			call: () => Promise<unknown>;
			method: string;
			url: string;
			body: string | null;
		}[] = [
			{ name: 'health', call: () => api.health(), method: 'GET', url: '/health', body: null },
			{
				name: 'getUsers',
				call: () => api.getUsers(),
				method: 'GET',
				url: '/api/v1/users',
				body: null
			},
			{
				name: 'getUser',
				call: () => api.getUser(7),
				method: 'GET',
				url: '/api/v1/users/7',
				body: null
			},
			{
				name: 'createUser',
				call: () => api.createUser({ name: 'Ada', email: 'ada@example.com' }),
				method: 'POST',
				url: '/api/v1/users',
				body: '{"name":"Ada","email":"ada@example.com"}'
			},
			{
				name: 'getUserTasks',
				call: () => api.getUserTasks(7),
				method: 'GET',
				url: '/api/v1/users/7/tasks',
				body: null
			},
			{
				name: 'createTask',
				call: () => api.createTask(task),
				method: 'POST',
				url: '/api/v1/tasks',
				body: JSON.stringify(task)
			},
			{
				name: 'updateTask',
				call: () => api.updateTask(10, { completed: false }),
				method: 'PUT',
				url: '/api/v1/tasks/10',
				body: '{"completed":false}'
			},
			{
				name: 'updateTask (text only: no property the contract refuses, no null)',
				call: () => api.updateTask(10, { title: 'T', description: '' }),
				method: 'PUT',
				url: '/api/v1/tasks/10',
				body: '{"title":"T","description":""}'
			},
			{
				name: 'deleteTask',
				call: () => api.deleteTask(10),
				method: 'DELETE',
				url: '/api/v1/tasks/10',
				body: null
			},
			{
				name: 'updateUser (the name alone: never an email, an id or a null)',
				call: () => api.updateUser(3, { name: 'Grace' }),
				method: 'PUT',
				url: '/api/v1/users/3',
				body: '{"name":"Grace"}'
			},
			{
				name: 'deleteUser',
				call: () => api.deleteUser(3),
				method: 'DELETE',
				url: '/api/v1/users/3',
				body: null
			},
			{
				name: 'getStats',
				call: () => api.getStats(),
				method: 'GET',
				url: '/api/v1/stats',
				body: null
			},
			{ name: 'ready', call: () => api.ready(), method: 'GET', url: '/ready', body: null }
		];

		for (const { name, call, method, url, body } of cases) {
			it(`${name} sends ${method} ${url}, with a JSON body only when it has one`, async () => {
				// GIVEN: A backend answering 200.
				const fetchMock = stubFetch(jsonResponse({ success: true }));

				// WHEN: The method is called.
				await call();

				// THEN: Exactly one request to the base URL, with the method and, for a body, JSON.
				expect(fetchMock).toHaveBeenCalledTimes(1);
				const sent = requestOf(fetchMock);
				expect(sent).toBeInstanceOf(Request);
				expect(sent.url).toBe(`http://api.test${url}`);
				expect(sent.method).toBe(method);
				if (body === null) {
					expect(await sent.text()).toBe('');
					expect(sent.headers.get('content-type')).toBeNull();
				} else {
					expect(await sent.text()).toBe(body);
					expect(sent.headers.get('content-type')).toBe('application/json');
				}
			});
		}
	});

	describe('Accept-Language', () => {
		afterEach(() => {
			document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
			overwriteGetLocale(() => 'en');
		});

		it('sends the interface language with each request, the new one right after a switch (happy path)', async () => {
			// GIVEN: An English interface that already sent a request.
			const fetchMock = stubFetch(jsonResponse({ success: true, data: [] }));
			const app = new AppState();
			await api.getUsers();

			// WHEN: The language changes, then the next request is sent.
			app.changeLocale('es');
			await api.getUsers();

			// THEN: The first request was in English, the next one in Spanish.
			expect(
				fetchMock.mock.calls.map(([request]) => (request as Request).headers.get('Accept-Language'))
			).toEqual(['en', 'es']);
		});
	});

	it.each([
		['by default', undefined, false],
		['when asked to outlive the page', { keepalive: true }, true]
	] as const)(
		'sends the DELETE %s (keepalive: %s) and no extra header (happy path)',
		async (_name, options, expected) => {
			// GIVEN: A backend that accepts the deletion.
			const fetchMock = stubFetch(jsonResponse({ success: true, message: 'Task deleted' }));

			// WHEN: The task is deleted.
			await api.deleteTask(42, options);

			// THEN: The request keeps or not alive, and adds no header that would need a CORS preflight allowance.
			const request = requestOf(fetchMock);
			expect(request.method).toBe('DELETE');
			expect(request.keepalive).toBe(expected);
			expect([...request.headers.keys()].sort()).toEqual(['accept-language']);
		}
	);

	it.each([
		['by default', undefined, false],
		['when asked to outlive the page', { keepalive: true }, true]
	] as const)(
		'sends the user DELETE %s (keepalive: %s) and no extra header (happy path)',
		async (_name, options, expected) => {
			const fetchMock = stubFetch(jsonResponse({ success: true, message: 'User deleted' }));

			await expect(api.deleteUser(42, options)).resolves.toEqual({
				success: true,
				message: 'User deleted'
			});

			const request = requestOf(fetchMock);
			expect(request.method).toBe('DELETE');
			expect(request.keepalive).toBe(expected);
			expect([...request.headers.keys()].sort()).toEqual(['accept-language']);
		}
	);

	it('reads the renamed user from the answer of updateUser (happy path)', async () => {
		stubFetch(
			jsonResponse({
				success: true,
				data: { id: 3, name: 'Grace', email: 'grace@example.com' },
				message: 'User updated'
			})
		);

		await expect(api.updateUser(3, { name: 'Grace' })).resolves.toMatchObject({
			success: true,
			data: { id: 3, name: 'Grace', email: 'grace@example.com' }
		});
	});

	it('answers a DELETE 204 as a success without parsing a body (happy path, convention)', async () => {
		// GIVEN: A deletion answered without content (no endpoint of the contract does it today).
		stubFetch(new Response(null, { status: 204 }));

		// WHEN / THEN: The deletion is reported as a success.
		await expect(api.deleteTask(42)).resolves.toEqual({ success: true });
	});

	it('refuses a 204 on an endpoint that must return data (limit)', async () => {
		// GIVEN: A list endpoint answered without content.
		stubFetch(new Response(null, { status: 204 }));

		// WHEN / THEN: No success without data reaches the stores.
		await expect(api.getUsers()).resolves.toEqual({
			success: false,
			error: 'Invalid server response',
			status: 204,
			kind: 'invalid_response'
		});
	});

	it.each([
		[400, 'VALIDATION_FAILED', 'User email is invalid'],
		[404, 'TASK_NOT_FOUND', 'Task not found'],
		[409, 'EMAIL_TAKEN', 'Email already in use'],
		[500, 'INTERNAL_ERROR', 'Internal server error']
	])(
		'keeps the backend message, status and error_code of an HTTP %i (sad path, F-01)',
		async (status, code, message) => {
			// GIVEN: The backend answers with its error envelope.
			stubFetch(jsonResponse({ success: false, error: message, error_code: code }, status));

			// WHEN / THEN: The failure carries what the backend said.
			await expect(api.createUser({ name: 'Ada', email: 'ada@x.io' })).resolves.toEqual({
				success: false,
				error: message,
				status,
				code
			});
		}
	);

	it.each([
		['no error_code', { success: false, error: 'Task not found' }],
		['a non-string error_code', { success: false, error: 'Task not found', error_code: 42 }]
	])('omits code when the error body has %s (limit)', async (_case, body) => {
		// GIVEN: An error envelope without a usable code.
		stubFetch(jsonResponse(body, 404));

		// WHEN / THEN: The message and status are kept, no code key is invented.
		await expect(api.deleteTask(1)).resolves.toStrictEqual({
			success: false,
			error: 'Task not found',
			status: 404
		});
	});

	it.each([
		['an empty error', jsonResponse({ success: false, error: '' }, 409)],
		['a non-string error', jsonResponse({ success: false, error: { detail: 'x' } }, 409)],
		['no error field', jsonResponse({ success: false }, 409)],
		['an HTML error page from a proxy', new Response('<html>Bad gateway</html>', { status: 502 })]
	])('falls back to "HTTP <status>" for %s (limit)', async (_case, response) => {
		// GIVEN: An error answer without a displayable message.
		stubFetch(response);

		// WHEN / THEN: The status stands in for the message, and the body is not parsed as JSON.
		await expect(api.getUsers()).resolves.toEqual({
			success: false,
			error: `HTTP ${response.status}`,
			status: response.status
		});
	});

	it.each([
		[299, true],
		[300, false],
		[399, false],
		[400, false]
	])('treats HTTP %i as success=%s (boundary of response.ok)', async (status, ok) => {
		// GIVEN: A backend answering with a status at a boundary of the 2xx range.
		stubFetch(jsonResponse({ success: true, data: [] }, status));

		// WHEN: Users are requested.
		const response = await api.getUsers();

		// THEN: Only 2xx statuses are parsed as a success.
		expect(response).toEqual(
			ok ? { success: true, data: [] } : { success: false, error: `HTTP ${status}`, status }
		);
	});

	it.each([
		['a malformed JSON body', new Response('{not json', { status: 200 })],
		['a body without success: true', jsonResponse({ data: { users: 1, tasks: 2 } })],
		['success without data', jsonResponse({ success: true })],
		['a JSON null body', new Response('null', { status: 200 })]
	])(
		'resolves %s on 200 to a failure instead of rejecting (exception, QM-01)',
		async (_case, response) => {
			// GIVEN: A 2xx response the client cannot trust.
			stubFetch(response);

			// WHEN / THEN: The promise resolves to an explicit failure.
			await expect(api.getStats()).resolves.toEqual({
				success: false,
				error: 'Invalid server response',
				status: 200,
				kind: 'invalid_response'
			});
		}
	);

	it('fails with the status when the error body is JSON but not an object (exception)', async () => {
		// GIVEN: An error answer whose body is the JSON value null.
		stubFetch(jsonResponse('null', 500));

		// WHEN / THEN: No message and no code to read: the failure falls back to the status.
		await expect(api.getUsers()).resolves.toEqual({
			success: false,
			error: 'HTTP 500',
			status: 500
		});
	});

	it('returns a failure without status when the network is down (exception)', async () => {
		// GIVEN: fetch rejects as browsers do when the backend is unreachable.
		stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

		// WHEN / THEN: The caller receives a failure instead of an exception.
		await expect(api.getUsers()).resolves.toStrictEqual({
			success: false,
			error: 'Failed to fetch'
		});
	});

	it('returns a generic failure when fetch rejects with a non-Error value (exception)', async () => {
		// GIVEN: fetch rejects with a plain value.
		// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- rejecting with a non-Error value is the case under test
		stubFetch(() => Promise.reject('offline'));

		// WHEN / THEN: The message falls back to "Unknown error".
		await expect(api.getUsers()).resolves.toEqual({
			success: false,
			error: 'Unknown error',
			kind: 'unknown'
		});
	});

	it('turns an aborted request into an ordinary failure, not a timeout (exception)', async () => {
		// GIVEN: fetch rejecting with an AbortError, as a cancelled request does. Browsers raise a
		// DOMException, which is an Error there; jsdom's is not, hence an Error named AbortError.
		stubFetch(() =>
			Promise.reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
		);

		// WHEN / THEN: A failure with the message, no kind, no exception.
		await expect(api.getUsers()).resolves.toStrictEqual({
			success: false,
			error: 'The operation was aborted.'
		});
	});
});

describe('readiness probe', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const READY = { success: true, message: 'Service is ready', data: { status: 'ready' } };

	it('returns the envelope of the probe (happy path)', async () => {
		stubFetch(jsonResponse(READY));

		await expect(api.ready()).resolves.toEqual(READY);
	});

	it('fails with the status and the code on a 503, and the reference of the answer (sad path)', async () => {
		stubFetch(jsonResponse(DOWN, 503, { 'X-Request-Id': 'req-503' }));

		expect(await api.ready()).toEqual({
			success: false,
			error: 'Database unavailable',
			status: 503,
			code: 'DATABASE_UNAVAILABLE',
			requestId: 'req-503'
		});
	});

	it('is an invalid response when the body is not the ready envelope (exception)', async () => {
		stubFetch(jsonResponse({ success: true, data: { status: 'booting' } }));

		expect(await api.ready()).toMatchObject({
			success: false,
			kind: 'invalid_response',
			status: 200
		});
	});
});

describe('request reference of a failure', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	const idOf = async (status: number, header: string | null) => {
		stubFetch(() => jsonResponse(DOWN, status, header === null ? {} : { 'X-Request-Id': header }));
		const result = await api.getStats();
		return result.success ? undefined : result.requestId;
	};

	it('is read from X-Request-Id on a 5xx (happy path)', async () => {
		expect(await idOf(500, 'a3622cb2-4f3c-47f6-a67f-ec5a359e45fb')).toBe(
			'a3622cb2-4f3c-47f6-a67f-ec5a359e45fb'
		);
	});

	it('is read from 500 to 599 only (boundary)', async () => {
		expect(await idOf(599, 'ok')).toBe('ok');
		expect(await idOf(499, 'ok')).toBeUndefined();
		expect(await idOf(404, 'ok')).toBeUndefined();
	});

	it('accepts 1 to 64 characters, no more (boundary)', async () => {
		expect(await idOf(500, 'a')).toBe('a');
		expect(await idOf(500, 'a'.repeat(64))).toBe('a'.repeat(64));
		expect(await idOf(500, 'a'.repeat(65))).toBeUndefined();
	});

	it('accepts letters, digits, dot, underscore and hyphen only (limit)', async () => {
		expect(await idOf(500, 'Az09._-')).toBe('Az09._-');
		for (const bad of ['a b', 'a/b', 'a<b>', 'é', 'a;b', 'a:b', 'a,b']) {
			expect(await idOf(500, bad)).toBeUndefined();
		}
	});

	it('is absent when the header is missing or empty (limit)', async () => {
		expect(await idOf(500, null)).toBeUndefined();
		expect(await idOf(500, '')).toBeUndefined();
	});

	it('is not set on a malformed 2xx answer (exception)', async () => {
		stubFetch(jsonResponse('<html>', 200, { 'X-Request-Id': 'ok' }));

		expect(await api.getStats()).toEqual({
			success: false,
			error: 'Invalid server response',
			status: 200,
			kind: 'invalid_response'
		});
	});
});
