import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { fetchUsers, users } from '$lib/features/users/store';
import { addTask, userTasks } from '$lib/features/tasks/store';
import { error, loading } from '$lib/stores/request-status';

// These tests keep the real API client and only replace fetch: they check what
// the stores do with transport failures the client itself does not absorb.
describe('stores with the real API client', () => {
	const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };

	beforeEach(() => {
		users.set([ada]);
		userTasks.set([]);
		loading.set(false);
		error.set(null);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('reports a malformed 200 body and keeps the list (exception)', async () => {
		// GIVEN: The backend answers 200 with a body that is not JSON.
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{not json', { status: 200 }));

		// WHEN: Users are fetched.
		await fetchUsers();

		// THEN: An error is exposed, the previous list is kept and loading is over.
		expect(get(error)).toEqual(expect.any(String));
		expect(get(users)).toEqual([ada]);
		expect(get(loading)).toBe(false);
	});

	it('reports an unreachable backend without adding the task (exception)', async () => {
		// GIVEN: The network is down.
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

		// WHEN: A task is added.
		const result = await addTask('Buy milk', 'Semi-skimmed', ada.id);

		// THEN: Nothing is added and the network error reaches the store.
		expect(result).toBeUndefined();
		expect(get(userTasks)).toEqual([]);
		expect(get(error)).toBe('Failed to fetch');
		expect(get(loading)).toBe(false);
	});
});
