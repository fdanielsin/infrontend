import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiFailure } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import { AvailabilityState } from '$lib/state/availability.svelte';
import { NotificationState } from '$lib/state/notification.svelte';

vi.mock('$lib/api/client', () => ({ api: { ready: vi.fn() } }));

type ReadyResult = Awaited<ReturnType<typeof api.ready>>;

const READY: ReadyResult = { success: true, data: { status: 'ready' } };
const failure = (extra: Partial<ApiFailure> = {}): ApiFailure => ({
	success: false,
	error: 'x',
	...extra
});
const OUTAGE = failure({ status: 503, code: 'DATABASE_UNAVAILABLE' });

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

function setHidden(hidden: boolean) {
	Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
	document.dispatchEvent(new Event('visibilitychange'));
}

describe('availability state', () => {
	let notifications: NotificationState;
	let availability: AvailabilityState;
	const ready = () => vi.mocked(api.ready);

	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetAllMocks();
		notifications = new NotificationState();
		// A jitter of 1 makes the steps exact: 5, 10, 20, 40, 60 s.
		availability = new AvailabilityState(notifications, { jitter: () => 1 });
	});

	afterEach(() => {
		availability.destroy();
		setHidden(false);
		vi.useRealTimers();
	});

	describe('first check', () => {
		it('is available when the service is ready, without banner or toast (happy path)', async () => {
			ready().mockResolvedValue(READY);

			expect(await availability.ensure()).toBe('available');

			expect(availability.status).toBe('available');
			expect(notifications.items).toEqual([]);
			expect(vi.getTimerCount()).toBe(0);
		});

		it('is unknown, and not checking, before anyone asks (boundary)', () => {
			expect(availability.status).toBe('unknown');
			expect(availability.checking).toBe(false);
			expect(ready()).not.toHaveBeenCalled();
		});

		it('is checking while the request is pending, and stays unknown (limit)', async () => {
			const pending = deferred<ReadyResult>();
			ready().mockReturnValue(pending.promise);

			const result = availability.ensure();

			expect(availability.checking).toBe(true);
			expect(availability.status).toBe('unknown');
			pending.resolve(READY);
			await result;
			expect(availability.checking).toBe(false);
		});

		it('asks once for any number of callers, and never again once known (happy path)', async () => {
			const pending = deferred<ReadyResult>();
			ready().mockReturnValue(pending.promise);

			const calls = [availability.ensure(), availability.ensure(), availability.check()];
			pending.resolve(READY);
			await Promise.all(calls);
			await availability.ensure();

			expect(ready()).toHaveBeenCalledTimes(1);
		});

		it.each([
			['a 503', failure({ status: 503 })],
			['a 500', failure({ status: 500 })],
			['a 599', failure({ status: 599 })],
			['a timeout', failure({ kind: 'timeout' })],
			['a network error', failure({ error: 'Failed to fetch' })]
		])('is unavailable on %s (sad path)', async (_name, result) => {
			ready().mockResolvedValue(result);

			expect(await availability.ensure()).toBe('unavailable');
			expect(availability.status).toBe('unavailable');
		});

		it.each([
			['a 404', failure({ status: 404 })],
			['a 499', failure({ status: 499 })],
			['a 600', failure({ status: 600 })],
			['a malformed body', failure({ status: 200, kind: 'invalid_response' })]
		])('is not an outage on %s: no banner, the screens load (boundary)', async (_name, result) => {
			ready().mockResolvedValue(result);

			expect(await availability.ensure()).toBe('available');
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe('backoff', () => {
		async function failUntil(attempts: number) {
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			for (let attempt = 2; attempt <= attempts; attempt++) {
				await vi.runOnlyPendingTimersAsync();
			}
		}

		it('checks again after 5, 10, 20, 40 and 60 s, then every 60 s (happy path)', async () => {
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			const steps = [5, 10, 20, 40, 60, 60];

			for (const [index, seconds] of steps.entries()) {
				expect(ready()).toHaveBeenCalledTimes(index + 1);
				await vi.advanceTimersByTimeAsync(seconds * 1000 - 1);
				expect(ready()).toHaveBeenCalledTimes(index + 1);
				await vi.advanceTimersByTimeAsync(1);
				expect(ready()).toHaveBeenCalledTimes(index + 2);
			}
		});

		it('uses the injected jitter for the delay (limit)', async () => {
			availability.destroy();
			availability = new AvailabilityState(notifications, { jitter: () => 1.2 });
			ready().mockResolvedValue(OUTAGE);
			await availability.check();

			await vi.advanceTimersByTimeAsync(5_999);
			expect(ready()).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			expect(ready()).toHaveBeenCalledTimes(2);
		});

		it('keeps a single timer pending (limit)', async () => {
			await failUntil(4);

			expect(vi.getTimerCount()).toBe(1);
		});

		it('announces the recovery once: toast, subscribers, banner gone, no more timer (happy path)', async () => {
			const listener = vi.fn();
			availability.onRecovered(listener);
			await failUntil(2);
			ready().mockResolvedValue(READY);

			await vi.runOnlyPendingTimersAsync();

			expect(availability.status).toBe('available');
			expect(listener).toHaveBeenCalledTimes(1);
			expect(notifications.items).toEqual([
				expect.objectContaining({ message: 'Service restored', type: 'success' })
			]);
			// Only the toast's own dismiss timer is left, not a retry.
			expect(vi.getTimerCount()).toBe(1);
			await vi.advanceTimersByTimeAsync(3_000);
			expect(vi.getTimerCount()).toBe(0);
			await availability.check();
			expect(listener).toHaveBeenCalledTimes(1);
			expect(notifications.items).toHaveLength(0);
		});

		it('restarts at 5 s after a recovery and a new outage (boundary)', async () => {
			await failUntil(4);
			ready().mockResolvedValue(READY);
			await vi.runOnlyPendingTimersAsync();
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			ready().mockClear();

			await vi.advanceTimersByTimeAsync(5_000);

			expect(ready()).toHaveBeenCalledTimes(1);
		});

		it('does not notify a recovery for a first check that succeeds (boundary)', async () => {
			const listener = vi.fn();
			availability.onRecovered(listener);
			ready().mockResolvedValue(READY);

			await availability.ensure();

			expect(listener).not.toHaveBeenCalled();
		});

		it('treats a 4xx answer after an outage as the service being back (limit)', async () => {
			const listener = vi.fn();
			availability.onRecovered(listener);
			await failUntil(1);
			ready().mockResolvedValue(failure({ status: 404 }));

			await vi.runOnlyPendingTimersAsync();

			expect(availability.status).toBe('available');
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it('stops calling a subscriber that unsubscribed (limit)', async () => {
			const listener = vi.fn();
			const unsubscribe = availability.onRecovered(listener);
			await failUntil(1);
			unsubscribe();
			ready().mockResolvedValue(READY);

			await vi.runOnlyPendingTimersAsync();

			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe('retry button', () => {
		it('checks at once and restarts the backoff at 5 s on a failure (happy path)', async () => {
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			await vi.runOnlyPendingTimersAsync();
			await vi.runOnlyPendingTimersAsync();
			expect(ready()).toHaveBeenCalledTimes(3);

			expect(await availability.retry()).toBe('unavailable');

			expect(ready()).toHaveBeenCalledTimes(4);
			await vi.advanceTimersByTimeAsync(4_999);
			expect(ready()).toHaveBeenCalledTimes(4);
			await vi.advanceTimersByTimeAsync(1);
			expect(ready()).toHaveBeenCalledTimes(5);
		});

		it('counts its failures, to announce the alert again (happy path)', async () => {
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			expect(availability.retryFailures).toBe(0);

			await availability.retry();
			await availability.retry();

			expect(availability.retryFailures).toBe(2);
		});

		it('recovers the service, announced once, without counting a failure (happy path)', async () => {
			const listener = vi.fn();
			availability.onRecovered(listener);
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			ready().mockResolvedValue(READY);

			expect(await availability.retry()).toBe('available');

			expect(availability.retryFailures).toBe(0);
			expect(listener).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(3_000);
			expect(vi.getTimerCount()).toBe(0);
		});

		it('joins a check already running instead of doubling it (limit)', async () => {
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			ready().mockClear();
			const pending = deferred<ReadyResult>();
			ready().mockReturnValue(pending.promise);

			const clicks = [availability.retry(), availability.retry(), availability.check()];
			pending.resolve(READY);
			await Promise.all(clicks);

			expect(ready()).toHaveBeenCalledTimes(1);
		});

		it('replaces the pending timer: no second check at the old time (limit)', async () => {
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			await vi.advanceTimersByTimeAsync(4_000);

			await availability.retry();
			ready().mockClear();
			await vi.advanceTimersByTimeAsync(1_000);

			expect(ready()).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(1);
		});
	});

	describe('hidden tab', () => {
		it('pauses while hidden, checks at once when shown, then takes the next step (happy path)', async () => {
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			await vi.advanceTimersByTimeAsync(5_000);
			expect(ready()).toHaveBeenCalledTimes(2);

			setHidden(true);
			expect(vi.getTimerCount()).toBe(0);
			await vi.advanceTimersByTimeAsync(10 * 60_000);
			expect(ready()).toHaveBeenCalledTimes(2);

			setHidden(false);
			await vi.advanceTimersByTimeAsync(0);
			expect(ready()).toHaveBeenCalledTimes(3);
			ready().mockClear();
			await vi.advanceTimersByTimeAsync(19_999);
			expect(ready()).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(ready()).toHaveBeenCalledTimes(1);
		});

		it('does not schedule when a check fails in a hidden tab (limit)', async () => {
			ready().mockResolvedValue(OUTAGE);
			setHidden(true);

			await availability.check();

			expect(availability.status).toBe('unavailable');
			expect(vi.getTimerCount()).toBe(0);
		});

		it('ignores visibility changes while the service is not down (boundary)', async () => {
			ready().mockResolvedValue(READY);
			await availability.check();
			ready().mockClear();

			setHidden(true);
			setHidden(false);
			await vi.advanceTimersByTimeAsync(0);

			expect(ready()).not.toHaveBeenCalled();
		});

		it('stops listening once the service is back (limit)', async () => {
			const remove = vi.spyOn(document, 'removeEventListener');
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			ready().mockResolvedValue(READY);
			await availability.check();

			expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
		});
	});

	describe('reference of the failed check', () => {
		it('keeps the X-Request-Id of the last failed check (happy path)', async () => {
			ready().mockResolvedValue({ ...OUTAGE, requestId: 'req-1' });
			await availability.check();
			expect(availability.reference).toBe('req-1');

			ready().mockResolvedValue({ ...OUTAGE, requestId: 'req-2' });
			await vi.runOnlyPendingTimersAsync();

			expect(availability.reference).toBe('req-2');
		});

		it('has none when the failure carries none, nor before any check (boundary)', async () => {
			expect(availability.reference).toBeNull();
			ready().mockResolvedValue({ ...OUTAGE, requestId: 'req-1' });
			await availability.check();

			ready().mockResolvedValue(OUTAGE);
			await vi.runOnlyPendingTimersAsync();

			expect(availability.reference).toBeNull();
		});

		it('forgets it once the service is back (limit)', async () => {
			ready().mockResolvedValue({ ...OUTAGE, requestId: 'req-1' });
			await availability.check();
			ready().mockResolvedValue(READY);

			await vi.runOnlyPendingTimersAsync();

			expect(availability.reference).toBeNull();
		});

		it('forgets it on a 4xx answer, which is no outage (limit)', async () => {
			ready().mockResolvedValue({ ...OUTAGE, requestId: 'req-1' });
			await availability.check();
			ready().mockResolvedValue(failure({ status: 404 }));

			await vi.runOnlyPendingTimersAsync();

			expect(availability.reference).toBeNull();
		});
	});

	describe('destroy', () => {
		it('schedules nothing when the pending check fails after destroy (exception)', async () => {
			// GIVEN: A check in flight.
			const pending = deferred<ReadyResult>();
			ready().mockReturnValueOnce(pending.promise);
			const listener = vi.fn();
			availability.onRecovered(listener);
			const add = vi.spyOn(document, 'addEventListener');
			const check = availability.check();

			// WHEN: The layout is destroyed, then the check answers an outage.
			availability.destroy();
			pending.resolve({ ...OUTAGE, requestId: 'late' });
			await check;

			// THEN: No state, no timer, no listener, no later request.
			expect(availability.status).toBe('unknown');
			expect(availability.reference).toBeNull();
			expect(vi.getTimerCount()).toBe(0);
			expect(add).not.toHaveBeenCalledWith('visibilitychange', expect.any(Function));
			ready().mockResolvedValue(OUTAGE);
			await vi.advanceTimersByTimeAsync(600_000);
			expect(ready()).toHaveBeenCalledTimes(1);
		});

		it('announces nothing when the pending check recovers after destroy (exception)', async () => {
			// GIVEN: An outage, then a check in flight.
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			const pending = deferred<ReadyResult>();
			ready().mockReturnValueOnce(pending.promise);
			const check = availability.check();

			// WHEN: Destroyed, then the check answers ready.
			availability.destroy();
			pending.resolve(READY);
			await check;

			// THEN: No toast and no state change.
			expect(notifications.items).toEqual([]);
			expect(availability.status).toBe('unavailable');
		});

		it('leaves no timer, no listener and no subscriber (exception)', async () => {
			const listener = vi.fn();
			const remove = vi.spyOn(document, 'removeEventListener');
			availability.onRecovered(listener);
			ready().mockResolvedValue(OUTAGE);
			await availability.check();
			expect(vi.getTimerCount()).toBe(1);

			availability.destroy();

			expect(vi.getTimerCount()).toBe(0);
			expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
			ready().mockResolvedValue(READY);
			await availability.check();
			expect(listener).not.toHaveBeenCalled();
		});

		it('can be called before any check (boundary)', () => {
			expect(() => availability.destroy()).not.toThrow();
		});
	});

	describe('runWhenAvailable', () => {
		it('loads once the service answers ready (happy path)', async () => {
			ready().mockResolvedValue(READY);
			const load = vi.fn();

			availability.runWhenAvailable(load);
			await vi.advanceTimersByTimeAsync(0);

			expect(load).toHaveBeenCalledTimes(1);
		});

		it('loads on a 4xx or a malformed answer, as before (sad path)', async () => {
			ready().mockResolvedValue(failure({ status: 400 }));
			const load = vi.fn();

			availability.runWhenAvailable(load);
			await vi.advanceTimersByTimeAsync(0);

			expect(load).toHaveBeenCalledTimes(1);
		});

		it('loads nothing while the service is down, then once when it is back (sad path)', async () => {
			ready().mockResolvedValue(OUTAGE);
			const load = vi.fn();

			availability.runWhenAvailable(load);
			await vi.advanceTimersByTimeAsync(30_000);
			expect(load).not.toHaveBeenCalled();
			ready().mockResolvedValue(READY);
			await vi.advanceTimersByTimeAsync(60_000);

			expect(load).toHaveBeenCalledTimes(1);
		});

		it('loads without a new check when the state is already known (limit)', async () => {
			ready().mockResolvedValue(READY);
			await availability.ensure();
			const load = vi.fn();

			availability.runWhenAvailable(load);
			await vi.advanceTimersByTimeAsync(0);

			expect(load).toHaveBeenCalledTimes(1);
			expect(ready()).toHaveBeenCalledTimes(1);
		});

		it('loads nothing for a screen that is gone, nor on a later recovery (exception)', async () => {
			const pending = deferred<ReadyResult>();
			ready().mockReturnValue(pending.promise);
			const load = vi.fn();
			const stop = availability.runWhenAvailable(load);

			stop();
			pending.resolve(READY);
			await vi.advanceTimersByTimeAsync(0);

			expect(load).not.toHaveBeenCalled();
		});

		it('does not call a screen that left on recovery (exception)', async () => {
			ready().mockResolvedValue(OUTAGE);
			const load = vi.fn();
			const stop = availability.runWhenAvailable(load);
			await vi.advanceTimersByTimeAsync(0);
			stop();
			ready().mockResolvedValue(READY);

			await vi.advanceTimersByTimeAsync(5_000);

			expect(load).not.toHaveBeenCalled();
		});
	});

	it('is part of the application state, sharing its notifications (happy path)', () => {
		const app = new AppState();

		expect(app.availability).toBeInstanceOf(AvailabilityState);
		expect(app.availability.status).toBe('unknown');
	});
});
