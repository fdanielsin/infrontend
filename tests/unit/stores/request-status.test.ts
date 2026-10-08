import { beforeEach, describe, expect, it } from 'vitest';
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
		expect(status.error).toBeNull();
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
		expect(result).toEqual({ success: false, error: 'Unknown error', kind: 'unknown' });
		expect(status.error).toBe('Unknown error');
		expect(notifications.items).toEqual([expect.objectContaining({ message: 'Unknown error' })]);
	});
});

describe('createRequestStatus with a handled failure', () => {
	beforeEach(() => {
		notifications = new NotificationState();
	});

	it('reports nothing for a failure the caller handles, and still ends the loading (limit)', async () => {
		// GIVEN: A status with a previous error and a failure the caller declares handled.
		const status = new RequestStatus(notifications);
		status.error = 'previous';
		const failure = { success: false as const, error: 'Task not found', code: 'TASK_NOT_FOUND' };

		// WHEN: The action fails that way.
		const result = await status.run(() => Promise.resolve(failure), {
			fallbackMessage: () => 'fallback',
			isHandled: (f) => f.code === 'TASK_NOT_FOUND'
		});

		// THEN: The failure is returned to the caller; no error, no notification, loading over.
		expect(result).toEqual(failure);
		expect(status.error).toBeNull();
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
		expect(status.error).toBe('Something went wrong on our side. Please try again in a moment.');
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
