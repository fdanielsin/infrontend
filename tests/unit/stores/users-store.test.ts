import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { api } from '$lib/api/client';
import { addUser, fetchUsers, selectUser, selectedUser, users } from '$lib/features/users/store';
import { userTasks } from '$lib/features/tasks/store';
import { error, loading } from '$lib/stores/request-status';

vi.mock('$lib/api/client', () => ({
	api: {
		getUsers: vi.fn(),
		createUser: vi.fn(),
		getUser: vi.fn(),
		getUserTasks: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		deleteTask: vi.fn()
	}
}));

describe('users store', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		users.set([]);
		userTasks.set([]);
		selectedUser.set(null);
		loading.set(false);
		error.set(null);
	});

	it('loads users and clears the loading state (happy path)', async () => {
		// GIVEN: The API returns a user collection.
		const user = { id: 1, name: 'Ada', email: 'ada@example.com' };
		vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [user] });

		// WHEN: Users are fetched.
		await fetchUsers();

		// THEN: The collection is stored without an error.
		expect(get(users)).toEqual([user]);
		expect(get(error)).toBeNull();
		expect(get(loading)).toBe(false);
	});

	it('stores the API error when creating a user fails (sad path)', async () => {
		// GIVEN: The API rejects the new user.
		vi.mocked(api.createUser).mockResolvedValue({
			success: false,
			error: 'Email already exists'
		});

		// WHEN: A user is created.
		const result = await addUser('Ada', 'ada@example.com');

		// THEN: The error is exposed and no user is added.
		expect(result).toBeUndefined();
		expect(get(users)).toEqual([]);
		expect(get(error)).toBe('Email already exists');
	});

	it('selects a user and loads its tasks (happy path)', async () => {
		// GIVEN: The API returns a user and its tasks.
		const user = { id: 1, name: 'Ada', email: 'ada@example.com' };
		const task = {
			id: 10,
			title: 'Review',
			description: 'Review code',
			user_id: 1,
			completed: false
		};
		vi.mocked(api.getUser).mockResolvedValue({ success: true, data: user });
		vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [task] });

		// WHEN: The user is selected.
		await selectUser(user.id);

		// THEN: The selection and tasks are available.
		expect(get(selectedUser)).toEqual(user);
		expect(get(userTasks)).toEqual([task]);
		expect(get(loading)).toBe(false);
	});
});
