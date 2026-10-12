import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_TIMEOUT_MS, ApiClient, READY_TIMEOUT_MS, api, type ApiResult } from '$lib/api/client';
import { failureMessage } from '$lib/i18n/errors';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { LOCALES, translation } from '../support/messages';
import { neverAnswer, settled, timeoutOnFakeTimers } from '../support/fetch';

// A request that gets no answer ends as a `timeout` failure after `timeoutMs`.

const TIMED_OUT = { success: false, error: 'Request timed out', kind: 'timeout' };

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

	it('ends an unanswered request with a timeout failure, exactly after timeoutMs (happy path, boundary)', async () => {
		// GIVEN: A client with a 50 ms timeout and a backend that never answers.
		neverAnswer();
		const result = settled(new ApiClient({ timeoutMs: 50 }).getStats());

		// WHEN: 49 ms pass.
		await vi.advanceTimersByTimeAsync(49);

		// THEN: Still waiting; one more millisecond ends it with a timeout failure, no exception.
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

	it('gives the readiness probe 5 s by default, not 4.999 (boundary)', async () => {
		neverAnswer();
		const result = settled(api.ready());

		await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS - 1);
		expect(result()).toBeUndefined();
		await vi.advanceTimersByTimeAsync(1);
		expect(result()).toEqual(TIMED_OUT);
		expect(READY_TIMEOUT_MS).toBe(5_000);
	});

	it('takes the timeout of the probe call, and leaves the other calls on the client timeout (limit)', async () => {
		neverAnswer();
		const client = new ApiClient({ timeoutMs: 50 });
		const ready = settled(client.ready({ timeoutMs: 20 }));
		const users = settled(client.getUsers());

		await vi.advanceTimersByTimeAsync(20);
		expect(ready()).toMatchObject({ kind: 'timeout' });
		expect(users()).toBeUndefined();
		await vi.advanceTimersByTimeAsync(30);
		expect(users()).toMatchObject({ kind: 'timeout' });
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

	it.each(LOCALES)('words a timeout in %s, neutrally (happy path)', (locale) => {
		// GIVEN: The interface language.
		overwriteGetLocale(() => locale);

		// WHEN: A timeout failure is worded.
		const message = failureMessage(TIMED_OUT as ApiResult<never> & { success: false }, () => 'x');

		// THEN: Its own translated message, which does not push the user to send again.
		expect(message).toBe(translation(locale, 'error_timeout'));
		expect(message.trim()).not.toBe('');
		expect(message).not.toMatch(/retry|try again|réessay|erneut|wiederhol|reintent|vuelv/i);
	});

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
