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
				name: 'deleteTask',
				call: () => api.deleteTask(10),
				method: 'DELETE',
				url: '/api/v1/tasks/10',
				body: null
			},
			{
				name: 'getStats',
				call: () => api.getStats(),
				method: 'GET',
				url: '/api/v1/stats',
				body: null
			}
		];

		for (const { name, call, method, url, body } of cases) {
			it(`${name} sends ${method} ${url}, with a JSON body only when it has one`, async () => {
				// GIVEN: A backend answering 200.
				const fetchMock = mockFetch(jsonResponse({ success: true }));

				// WHEN: The method is called.
				await call();

				// THEN: Exactly one request to the base URL, with the method and, for a body, JSON.
				expect(fetchMock).toHaveBeenCalledTimes(1);
				const request = fetchMock.mock.calls[0]?.[0];
				expect(request).toBeInstanceOf(Request);
				const sent = request as Request;
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

	it.each([
		['getUsers', () => api.getUsers(), [{ id: 1, name: 'Ada', email: 'ada@x.io' }]],
		['getUser', () => api.getUser(1), { id: 1, name: 'Ada', email: 'ada@x.io' }],
		[
			'createUser',
			() => api.createUser({ name: 'Ada', email: 'ada@x.io' }),
			{ id: 1, name: 'Ada', email: 'ada@x.io' }
		],
		[
			'getUserTasks',
			() => api.getUserTasks(1),
			[{ id: 10, title: 'T', description: '', user_id: 1, completed: false }]
		],
		[
			'createTask',
			() => api.createTask({ title: 'T', user_id: 1, completed: false }),
			{ id: 10, title: 'T', description: '', user_id: 1, completed: false }
		],
		[
			'updateTask',
			() => api.updateTask(10, { completed: true }),
			{ id: 10, title: 'T', description: '', completed: true }
		]
	] as const)(
		'%s returns the data of the success envelope (happy path)',
		async (_name, call, data) => {
			// GIVEN: The backend answers with a success envelope.
			mockFetch(jsonResponse({ success: true, data }));

			// WHEN / THEN: The envelope reaches the caller unchanged.
			await expect(call()).resolves.toEqual({ success: true, data });
		}
	);

	it('health returns the data of the success envelope (happy path)', async () => {
		// GIVEN: The backend answers the health check with its full envelope.
		const envelope = {
			success: true,
			message: 'Service is healthy',
			data: { status: 'ok', version: '1.0.0', id: '3f2c1e6a-8b4d-4c2a-9e1f-5a6b7c8d9e0f' }
		};
		mockFetch(jsonResponse(envelope));

		// WHEN / THEN: The envelope reaches the caller unchanged.
		await expect(api.health()).resolves.toEqual(envelope);
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

	it('answers a DELETE 204 as a success without parsing a body (happy path, convention)', async () => {
		// GIVEN: A deletion answered without content (no endpoint of the contract does it today).
		mockFetch(new Response(null, { status: 204 }));

		// WHEN / THEN: The deletion is reported as a success.
		await expect(api.deleteTask(42)).resolves.toEqual({ success: true });
	});

	it('refuses a 204 on an endpoint that must return data (limit)', async () => {
		// GIVEN: A list endpoint answered without content.
		mockFetch(new Response(null, { status: 204 }));

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
			mockFetch(jsonResponse({ success: false, error: message, error_code: code }, status));

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
		mockFetch(jsonResponse(body, 404));

		// WHEN / THEN: The message and status are kept, no code key is invented.
		await expect(api.deleteTask(1)).resolves.toStrictEqual({
			success: false,
			error: 'Task not found',
			status: 404
		});
	});

	it.each([
		['an empty error', { success: false, error: '' }],
		['a non-string error', { success: false, error: { detail: 'x' } }],
		['no error field', { success: false }]
	])('falls back to "HTTP <status>" for %s (limit)', async (_case, body) => {
		// GIVEN: An error envelope without a displayable message.
		mockFetch(jsonResponse(body, 409));

		// WHEN / THEN: The status stands in for the message.
		await expect(api.getUsers()).resolves.toEqual({
			success: false,
			error: 'HTTP 409',
			status: 409
		});
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
			ok ? { success: true, data: [] } : { success: false, error: `HTTP ${status}`, status }
		);
	});

	it('does not parse the body of an error response (sad path, HTML error page)', async () => {
		// GIVEN: A proxy returns an HTML error page.
		mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }));

		// WHEN / THEN: The client fails with the status instead of a JSON parse error.
		await expect(api.getStats()).resolves.toEqual({
			success: false,
			error: 'HTTP 502',
			status: 502
		});
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
			mockFetch(response);

			// WHEN / THEN: The promise resolves to an explicit failure.
			await expect(api.getStats()).resolves.toEqual({
				success: false,
				error: 'Invalid server response',
				status: 200,
				kind: 'invalid_response'
			});
		}
	);

	it('accepts a DELETE 200 envelope without data (boundary of the data check)', async () => {
		// GIVEN: The deletion envelope of the contract carries a message only.
		mockFetch(jsonResponse({ success: true, message: 'Task deleted' }));

		// WHEN / THEN: It is a success although data is absent.
		await expect(api.deleteTask(1)).resolves.toEqual({ success: true, message: 'Task deleted' });
	});

	it('returns a failure without status when the network is down (exception)', async () => {
		// GIVEN: fetch rejects as browsers do when the backend is unreachable.
		mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));

		// WHEN / THEN: The caller receives a failure instead of an exception.
		await expect(api.getUsers()).resolves.toStrictEqual({
			success: false,
			error: 'Failed to fetch'
		});
	});

	it('returns a generic failure when fetch rejects with a non-Error value (exception)', async () => {
		// GIVEN: fetch rejects with a plain value.
		// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- rejecting with a non-Error value is the case under test
		mockFetch(() => Promise.reject('offline'));

		// WHEN / THEN: The message falls back to "Unknown error".
		await expect(api.getUsers()).resolves.toEqual({
			success: false,
			error: 'Unknown error',
			kind: 'unknown'
		});
	});
});

describe('request bodies and the strict contract', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// The contract refuses unknown properties and null (INVALID_BODY): each call sends exactly
	// the properties it declares, none of them null.
	const calls: [string, () => Promise<unknown>, string[]][] = [
		['createUser', () => api.createUser({ name: 'Ada', email: 'a@b.co' }), ['name', 'email']],
		[
			'createTask',
			() => api.createTask({ title: 'T', description: '', user_id: 1, completed: false }),
			['title', 'description', 'user_id', 'completed']
		],
		['updateTask completed', () => api.updateTask(1, { completed: true }), ['completed']],
		[
			'updateTask text',
			() => api.updateTask(1, { title: 'T', description: '' }),
			['title', 'description']
		]
	];

	it.each(calls)(
		'%s sends only declared properties, none null (happy path)',
		async (_name, call, keys) => {
			// GIVEN: A server that answers anything.
			const fetchMock = mockFetch(jsonResponse({ success: true }));

			// WHEN: The call is made.
			await call();

			// THEN: The body has exactly the expected keys and no null.
			const request = fetchMock.mock.calls[0]![0] as Request;
			const body = JSON.parse(await request.text()) as Record<string, unknown>;
			expect(Object.keys(body).sort()).toEqual([...keys].sort());
			expect(Object.values(body)).not.toContain(null);
		}
	);
});
