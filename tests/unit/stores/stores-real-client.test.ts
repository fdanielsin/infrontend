import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { addUser, fetchUsers, users, usersStatus } from '$lib/features/users/store';
import { addTask, tasksStatus, userTasks } from '$lib/features/tasks/store';
import { notifications } from '$lib/stores/notification';

// These tests keep the real API client and only replace fetch: they check what
// the stores do with transport failures the client itself does not absorb.
describe('stores with the real API client', () => {
	const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };

	beforeEach(() => {
		users.set([ada]);
		userTasks.set([]);
		for (const status of [usersStatus, tasksStatus]) {
			status.loading.set(false);
			status.error.set(null);
		}
		notifications.set([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('reports a malformed 200 body and keeps the list (exception)', async () => {
		// GIVEN: The backend answers 200 with a body that is not JSON.
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{not json', { status: 200 }));

		// WHEN: Users are fetched.
		await fetchUsers();

		// THEN: An explicit error is exposed and notified, the list is kept, loading is over.
		expect(get(usersStatus.error)).toBe('Invalid server response');
		expect(get(notifications)).toEqual([
			expect.objectContaining({ message: 'Invalid server response', type: 'error' })
		]);
		expect(get(users)).toEqual([ada]);
		expect(get(usersStatus.loading)).toBe(false);
	});

	it('reports an unreachable backend without adding the task (exception)', async () => {
		// GIVEN: The network is down.
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

		// WHEN: A task is added.
		const result = await addTask('Buy milk', 'Semi-skimmed', ada.id);

		// THEN: Nothing is added and the network error reaches the store.
		expect(result).toBeUndefined();
		expect(get(userTasks)).toEqual([]);
		expect(get(tasksStatus.error)).toBe('Failed to fetch');
		expect(get(tasksStatus.loading)).toBe(false);
	});

	it('shows the backend message of a refused creation (sad path, F-01)', async () => {
		// GIVEN: The backend refuses a taken email with its error envelope.
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					success: false,
					error: 'Email already in use',
					error_code: 'EMAIL_TAKEN'
				}),
				{ status: 409 }
			)
		);

		// WHEN: The user is created.
		await addUser('Ada', 'ada@x.io');

		// THEN: The backend message reaches the store and the notification, not "HTTP 409".
		expect(get(usersStatus.error)).toBe('Email already in use');
		expect(get(notifications)).toEqual([
			expect.objectContaining({ message: 'Email already in use', type: 'error' })
		]);
	});
});
