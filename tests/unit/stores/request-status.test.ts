import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import { NotificationState } from '$lib/state/notification.svelte';
import { RequestStatus } from '$lib/state/request-status.svelte';

let notifications: NotificationState;

describe('createRequestStatus', () => {
	beforeEach(() => {
		notifications = new NotificationState();
	});

	it('starts idle, without error (boundary)', () => {
		// GIVEN / WHEN: A new status.
		const status = new RequestStatus(notifications);

		// THEN: Nothing is loading, so the forms start enabled.
		expect(status.loading).toBe(false);
	});

	it('leaves the loading of a tracked request alone when a background action ends (limit)', async () => {
		// GIVEN: A tracked request still pending.
		const status = new RequestStatus(notifications);
		let answer!: (value: ApiResult<number>) => void;
		const tracked = status.run(
			() => new Promise<ApiResult<number>>((resolve) => (answer = resolve)),
			{
				fallbackMessage: () => 'tracked'
			}
		);

		// WHEN: A background action (tracksLoading false) completes meanwhile.
		await status.run(() => Promise.resolve({ success: true, data: 1 }), {
			fallbackMessage: () => 'background',
			tracksLoading: false
		});

		// THEN: The form stays disabled until the tracked request answers.
		expect(status.loading).toBe(true);
		answer({ success: true, data: 2 });
		await tracked;
		expect(status.loading).toBe(false);
	});

	it('turns a rejection with a non-Error value into "Unknown error" (exception)', async () => {
		// GIVEN: An action that rejects with a plain value.
		const status = new RequestStatus(notifications);

		// WHEN: It runs.
		const result = await status.run(
			// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- rejecting with a non-Error value is the case under test
			(): Promise<ApiResult<number>> => Promise.reject('offline'),
			{ fallbackMessage: () => 'fallback' }
		);

		// THEN: A failure is returned, shown and notified with the generic message.
		expect(result).toEqual({
			success: false,
			error: 'Something unexpected happened. Please try again.',
			kind: 'unknown'
		});
		expect(notifications.items).toEqual([
			expect.objectContaining({ message: 'Something unexpected happened. Please try again.' })
		]);
	});

	describe('how long the error toast stays', () => {
		const run = (status: RequestStatus, result: ApiResult<number>) =>
			status.run(() => Promise.resolve(result), { fallbackMessage: () => 'fallback' });

		it.each([
			['a 500 with a reference', { status: 500, requestId: 'req-1' }],
			['a 503', { status: 503, code: 'DATABASE_UNAVAILABLE' }],
			['a network error', {}],
			['a timeout', { kind: 'timeout' as const }],
			['a malformed answer', { status: 200, kind: 'invalid_response' as const }]
		])('keeps the toast of %s until it is closed (happy path)', async (_name, fields) => {
			// GIVEN / WHEN: The failure goes through a request.
			vi.useFakeTimers();
			const status = new RequestStatus(notifications);
			await run(status, { success: false, error: 'Server said no', ...fields });

			// THEN: One error toast with no end of its own.
			expect(notifications.items).toEqual([
				expect.objectContaining({ type: 'error', duration: 0 })
			]);
			vi.advanceTimersByTime(60 * 60 * 1000);
			expect(notifications.items).toHaveLength(1);
			vi.useRealTimers();
		});

		it.each([
			['a 400', { status: 400 }],
			['a 404', { status: 404 }],
			['a 409', { status: 409 }],
			['a 499', { status: 499 }]
		])('lets the toast of %s leave after 6 s (limit)', async (_name, fields) => {
			// GIVEN / WHEN: A client error goes through a request.
			vi.useFakeTimers();
			await run(new RequestStatus(notifications), {
				success: false,
				error: 'Refused',
				...fields
			});

			// THEN: 6000 ms, like before.
			expect(notifications.items).toEqual([
				expect.objectContaining({ type: 'error', duration: 6000 })
			]);
			vi.advanceTimersByTime(6000);
			expect(notifications.items).toEqual([]);
			vi.useRealTimers();
		});

		it('keeps the reference of a persistent toast (happy path)', async () => {
			// GIVEN / WHEN: A 500 with a reference.
			await run(new RequestStatus(notifications), {
				success: false,
				error: 'Boom',
				status: 500,
				requestId: 'req-9'
			});

			// THEN: The toast carries it, to copy for support.
			expect(notifications.items).toEqual([
				expect.objectContaining({ duration: 0, reference: 'req-9' })
			]);
		});

		it('shows one toast when the same network failure repeats (boundary)', async () => {
			// GIVEN / WHEN: Two requests fail the same way, on the same status.
			const status = new RequestStatus(notifications);
			await run(status, { success: false, error: 'Failed to fetch' });
			await run(status, { success: false, error: 'Failed to fetch' });

			// THEN: One toast.
			expect(notifications.items).toHaveLength(1);
		});

		it('keeps the toast of an exception thrown by the action, which is no answer (exception)', async () => {
			// GIVEN / WHEN: The action throws.
			await new RequestStatus(notifications).run(
				(): Promise<ApiResult<number>> => Promise.reject(new TypeError('Failed to fetch')),
				{ fallbackMessage: () => 'fallback' }
			);

			// THEN: Persistent, as a network error.
			expect(notifications.items).toEqual([
				expect.objectContaining({ message: 'Failed to fetch', duration: 0 })
			]);
		});
	});
});

describe('createRequestStatus with a handled failure', () => {
	beforeEach(() => {
		notifications = new NotificationState();
	});

	it('reports nothing for a failure the caller handles, and still ends the loading (limit)', async () => {
		// GIVEN: A status and a failure the caller declares handled.
		const status = new RequestStatus(notifications);
		const failure = { success: false as const, error: 'Task not found', code: 'TASK_NOT_FOUND' };

		// WHEN: The action fails that way.
		const result = await status.run(() => Promise.resolve(failure), {
			fallbackMessage: () => 'fallback',
			isHandled: (f) => f.code === 'TASK_NOT_FOUND'
		});

		// THEN: The failure is returned to the caller; no error, no notification, loading over.
		expect(result).toEqual(failure);
		expect(notifications.items).toEqual([]);
		expect(status.loading).toBe(false);
	});

	it('still reports a failure that the caller does not handle (sad path)', async () => {
		// GIVEN: A handler that only accepts TASK_NOT_FOUND.
		const status = new RequestStatus(notifications);

		// WHEN: Another failure happens.
		await status.run(
			() => Promise.resolve({ success: false as const, error: 'Boom', code: 'INTERNAL_ERROR' }),
			{
				fallbackMessage: () => 'fallback',
				isHandled: (f) => f.code === 'TASK_NOT_FOUND'
			}
		);

		// THEN: It is shown and notified as an error.
		expect(notifications.items).toEqual([
			expect.objectContaining({
				message: 'Something went wrong on our side. Please try again in a moment.',
				type: 'error'
			})
		]);
	});
});

describe('initial application state', () => {
	it('starts with no user, no selection, no task and no notification (boundary)', () => {
		// GIVEN / WHEN: A fresh application state, read before any action.
		const app = new AppState();

		// THEN: Everything is empty and idle.
		expect(app.users.users).toEqual([]);
		expect(app.users.selected).toBeNull();
		expect(app.tasks.tasks).toEqual([]);
		expect(app.notifications.items).toEqual([]);
		expect(app.users.status.loading).toBe(false);
		expect(app.tasks.status.loading).toBe(false);
	});
});
