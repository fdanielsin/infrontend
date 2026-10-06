import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, READY_TIMEOUT_MS, api } from '$lib/api/client';

vi.mock('$env/static/public', () => ({ PUBLIC_API_URL: 'http://api.test' }));

function respond(body: unknown, status: number, headers: Record<string, string> = {}) {
	return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...headers }
	});
}

const READY = { success: true, message: 'Service is ready', data: { status: 'ready' } };
const DOWN = { success: false, error: 'Database unavailable', error_code: 'DATABASE_UNAVAILABLE' };

function mockFetch(response: () => Response) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response()));
}

describe('ready', () => {
	afterEach(() => vi.restoreAllMocks());

	it('asks GET /ready and returns the envelope (happy path)', async () => {
		const spy = mockFetch(() => respond(READY, 200));

		const result = await api.ready();

		const request = spy.mock.calls[0]?.[0] as Request;
		expect(request.method).toBe('GET');
		expect(request.url).toBe('http://api.test/ready');
		expect(result).toEqual(READY);
	});

	it('fails with the status and the code on a 503, and the reference of the answer (sad path)', async () => {
		mockFetch(() => respond(DOWN, 503, { 'X-Request-Id': 'req-503' }));

		expect(await api.ready()).toEqual({
			success: false,
			error: 'Database unavailable',
			status: 503,
			code: 'DATABASE_UNAVAILABLE',
			requestId: 'req-503'
		});
	});

	it('is an invalid response when the body is not the ready envelope (exception)', async () => {
		mockFetch(() => respond({ success: true, data: { status: 'booting' } }, 200));

		expect(await api.ready()).toMatchObject({
			success: false,
			kind: 'invalid_response',
			status: 200
		});
	});

	it('fails without status when the network is down (exception)', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

		expect(await api.ready()).toEqual({ success: false, error: 'Failed to fetch' });
	});

	describe('timeout', () => {
		beforeEach(() => vi.useFakeTimers());
		afterEach(() => vi.useRealTimers());

		function neverAnswer() {
			vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
				const controller = new AbortController();
				setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms);
				return controller.signal;
			});
			vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
				const request = input as Request;
				return new Promise<Response>((_resolve, reject) => {
					request.signal.addEventListener('abort', () => reject(request.signal.reason as Error));
				});
			});
		}

		it('gives up after 5 s by default, not 4.999 (boundary)', async () => {
			neverAnswer();
			let result: unknown;
			void api.ready().then((value) => (result = value));

			await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS - 1);
			expect(result).toBeUndefined();
			await vi.advanceTimersByTimeAsync(1);
			expect(result).toEqual({ success: false, error: 'Request timed out', kind: 'timeout' });
			expect(READY_TIMEOUT_MS).toBe(5_000);
		});

		it('takes the timeout of the call, and leaves the other calls on the client timeout (limit)', async () => {
			neverAnswer();
			const client = new ApiClient({ timeoutMs: 50 });
			let ready: unknown;
			let users: unknown;
			void client.ready({ timeoutMs: 20 }).then((value) => (ready = value));
			void client.getUsers().then((value) => (users = value));

			await vi.advanceTimersByTimeAsync(20);
			expect(ready).toMatchObject({ kind: 'timeout' });
			expect(users).toBeUndefined();
			await vi.advanceTimersByTimeAsync(30);
			expect(users).toMatchObject({ kind: 'timeout' });
		});
	});
});

describe('request reference of a failure', () => {
	afterEach(() => vi.restoreAllMocks());

	const idOf = async (status: number, header: string | null) => {
		mockFetch(() => respond(DOWN, status, header === null ? {} : { 'X-Request-Id': header }));
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
		mockFetch(() => respond('<html>', 200, { 'X-Request-Id': 'ok' }));
		const result = await api.getStats();
		expect(result).toEqual({
			success: false,
			error: 'Invalid server response',
			status: 200,
			kind: 'invalid_response'
		});
	});
});
