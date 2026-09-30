import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { ApiResult } from '$lib/api/client';
import { createRequestStatus } from '$lib/stores/request-status';
import { notifications } from '$lib/stores/notification';

describe('createRequestStatus', () => {
	beforeEach(() => {
		notifications.set([]);
	});

	it('starts idle, without error (boundary)', () => {
		// GIVEN / WHEN: A new status.
		const status = createRequestStatus();

		// THEN: Nothing is loading, so the forms start enabled.
		expect(get(status.loading)).toBe(false);
		expect(get(status.error)).toBeNull();
	});

	it('leaves the loading of a tracked request alone when a background action ends (limit)', async () => {
		// GIVEN: A tracked request still pending.
		const status = createRequestStatus();
		let answer!: (value: ApiResult<number>) => void;
		const tracked = status.run(
			() => new Promise<ApiResult<number>>((resolve) => (answer = resolve)),
			{
				fallbackMessage: 'tracked'
			}
		);

		// WHEN: A background action (tracksLoading false) completes meanwhile.
		await status.run(() => Promise.resolve({ success: true, data: 1 }), {
			fallbackMessage: 'background',
			tracksLoading: false
		});

		// THEN: The form stays disabled until the tracked request answers.
		expect(get(status.loading)).toBe(true);
		answer({ success: true, data: 2 });
		await tracked;
		expect(get(status.loading)).toBe(false);
	});

	it('turns a rejection with a non-Error value into "Unknown error" (exception)', async () => {
		// GIVEN: An action that rejects with a plain value.
		const status = createRequestStatus();

		// WHEN: It runs.
		const result = await status.run(
			// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- rejecting with a non-Error value is the case under test
			(): Promise<ApiResult<number>> => Promise.reject('offline'),
			{ fallbackMessage: 'fallback' }
		);

		// THEN: A failure is returned, shown and notified with the generic message.
		expect(result).toEqual({ success: false, error: 'Unknown error' });
		expect(get(status.error)).toBe('Unknown error');
		expect(get(notifications)).toEqual([expect.objectContaining({ message: 'Unknown error' })]);
	});
});

describe('initial application state', () => {
	it('starts with no user, no selection, no task and no notification (boundary)', async () => {
		// GIVEN: Freshly loaded modules.
		vi.resetModules();

		// WHEN: The stores are read before any action.
		const { users, selectedUser, usersStatus } = await import('$lib/features/users/store');
		const { userTasks, tasksStatus } = await import('$lib/features/tasks/store');
		const { notifications: freshNotifications } = await import('$lib/stores/notification');

		// THEN: Everything is empty and idle.
		expect(get(users)).toEqual([]);
		expect(get(selectedUser)).toBeNull();
		expect(get(userTasks)).toEqual([]);
		expect(get(freshNotifications)).toEqual([]);
		expect(get(usersStatus.loading)).toBe(false);
		expect(get(tasksStatus.loading)).toBe(false);
	});
});
