import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_TIMEOUT_MS, ApiClient, api, type ApiResult } from '$lib/api/client';
import { failureMessage } from '$lib/i18n/errors';
import { overwriteGetLocale, type Locale } from '$lib/paraglide/runtime';

// A request that gets no answer ends as a `timeout` failure after `timeoutMs`.

const TIMED_OUT = { success: false, error: 'Request timed out', kind: 'timeout' };

// A backend that never answers: the request only ends when its signal aborts it.
function neverAnswer() {
	const requests: Request[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
		const request = input as Request;
		requests.push(request);
		return new Promise<Response>((_resolve, reject) => {
			// The platform rejects with the signal's reason (a TimeoutError DOMException).
			request.signal.addEventListener('abort', () => reject(request.signal.reason as Error));
		});
	});
	return requests;
}

function translation(locale: Locale, key: string) {
	const messages = JSON.parse(
		readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
	) as Record<string, string>;
	return messages[key] ?? '';
}

// Lets the promise of a result settle without blocking the test when it does not.
function settled<T>(promise: Promise<T>) {
	let value: T | undefined;
	void promise.then((result) => (value = result));
	return () => value;
}

// AbortSignal.timeout runs on a native timer that fake timers do not drive: this double has the
// same behaviour (abort with a TimeoutError after `ms`) on the faked setTimeout.
function timeoutOnFakeTimers() {
	return vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(new DOMException('signal timed out', 'TimeoutError')), ms);
		return controller.signal;
	});
}

describe('request timeout', () => {
	let timeoutSpy: ReturnType<typeof timeoutOnFakeTimers>;

	beforeEach(() => {
		vi.useFakeTimers();
		timeoutSpy = timeoutOnFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		overwriteGetLocale(() => 'en');
	});

	it('ends an unanswered request with a timeout failure (happy path)', async () => {
		// GIVEN: A client with a 50 ms timeout and a backend that never answers.
		neverAnswer();
		const client = new ApiClient({ timeoutMs: 50 });

		// WHEN: Users are requested and the delay passes.
		const result = settled(client.getUsers());
		await vi.advanceTimersByTimeAsync(50);

		// THEN: A timeout failure, no exception.
		expect(result()).toEqual(TIMED_OUT);
	});

	it('waits exactly timeoutMs: nothing at timeoutMs - 1 (boundary)', async () => {
		// GIVEN: A 50 ms timeout.
		neverAnswer();
		const result = settled(new ApiClient({ timeoutMs: 50 }).getStats());

		// WHEN: 49 ms pass.
		await vi.advanceTimersByTimeAsync(49);

		// THEN: Still waiting; one more millisecond ends it.
		expect(result()).toBeUndefined();
		await vi.advanceTimersByTimeAsync(1);
		expect(result()).toEqual(TIMED_OUT);
	});

	it('uses 10 s by default, also for the shared client (boundary)', async () => {
		// GIVEN: The shared client and a backend that never answers.
		expect(API_TIMEOUT_MS).toBe(10_000);
		neverAnswer();
		const result = settled(api.getUsers());

		// WHEN / THEN: The platform timeout is asked for 10 000 ms; nothing before, a timeout at 10 s.
		await vi.advanceTimersByTimeAsync(0);
		expect(timeoutSpy).toHaveBeenLastCalledWith(10_000);
		await vi.advanceTimersByTimeAsync(9_999);
		expect(result()).toBeUndefined();
		await vi.advanceTimersByTimeAsync(1);
		expect(result()).toEqual(TIMED_OUT);
	});

	it('is not triggered by an answer that arrives in time (limit)', async () => {
		// GIVEN: A backend answering after 40 ms, under a 50 ms timeout.
		vi.spyOn(globalThis, 'fetch').mockImplementation(
			() =>
				new Promise<Response>((resolveResponse) =>
					setTimeout(
						() =>
							resolveResponse(
								new Response(JSON.stringify({ success: true, data: [] }), { status: 200 })
							),
						40
					)
				)
		);
		const result = settled(new ApiClient({ timeoutMs: 50 }).getUsers());

		// WHEN: Time passes well beyond the timeout.
		await vi.advanceTimersByTimeAsync(200);

		// THEN: The answer is kept.
		expect(result()).toEqual({ success: true, data: [] });
	});

	it('keeps method, URL, headers and body in the request sent with the timeout (limit)', async () => {
		// GIVEN: A backend that records the request and answers at once.
		vi.useRealTimers();
		let sent: Request | undefined;
		vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
			sent = input as Request;
			return Promise.resolve(
				new Response(
					JSON.stringify({ success: true, data: { id: 1, name: 'Ada', email: 'ada@example.com' } }),
					{ status: 201 }
				)
			);
		});

		// WHEN: A user is created.
		await new ApiClient({ timeoutMs: 50 }).createUser({ name: 'Ada', email: 'ada@example.com' });

		// THEN: The copy carries everything, plus a signal.
		expect(sent?.method).toBe('POST');
		expect(sent?.url).toMatch(/\/api\/v1\/users$/);
		expect(sent?.headers.get('Content-Type')).toContain('application/json');
		expect(sent?.headers.get('Accept-Language')).toBe('en');
		expect(await sent?.json()).toEqual({ name: 'Ada', email: 'ada@example.com' });
		expect(sent?.signal).toBeDefined();
	});

	it.each(['en', 'fr', 'de', 'es'] as const)(
		'words a timeout in %s, neutrally (happy path)',
		(locale) => {
			// GIVEN: The interface language.
			overwriteGetLocale(() => locale);

			// WHEN: A timeout failure is worded.
			const message = failureMessage(TIMED_OUT as ApiResult<never> & { success: false }, () => 'x');

			// THEN: Its own translated message, which does not push the user to send again.
			expect(message).toBe(translation(locale, 'error_timeout'));
			expect(message.trim()).not.toBe('');
			expect(message).not.toMatch(/retry|try again|réessay|erneut|wiederhol|reintent|vuelv/i);
		}
	);

	it('times out with the real platform timer (exception)', async () => {
		// GIVEN: Real timers and the real AbortSignal.timeout, a 30 ms timeout.
		vi.useRealTimers();
		timeoutSpy.mockRestore();
		neverAnswer();

		// WHEN / THEN: The unanswered request ends as a timeout.
		await expect(new ApiClient({ timeoutMs: 30 }).getUsers()).resolves.toEqual(TIMED_OUT);
	});

	it('turns a TimeoutError thrown by fetch itself into a timeout (exception)', async () => {
		// GIVEN: fetch rejecting with a TimeoutError (a plain object, as some engines do).
		vi.useRealTimers();
		vi.spyOn(globalThis, 'fetch').mockRejectedValue({ name: 'TimeoutError', message: 'x' });

		// WHEN / THEN: A timeout failure.
		await expect(new ApiClient({ timeoutMs: 50 }).getUsers()).resolves.toEqual(TIMED_OUT);
	});
});
