import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { api, type ApiResponse, type Task, type User } from '$lib/api/client';
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

const ada: User = { id: 1, name: 'Ada', email: 'ada@example.com' };
const bob: User = { id: 2, name: 'Bob', email: 'bob@example.com' };
const adaTask: Task = {
	id: 10,
	title: 'Review',
	description: 'Review code',
	user_id: 1,
	completed: false
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('users store', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		users.set([]);
		userTasks.set([]);
		selectedUser.set(null);
		loading.set(false);
		error.set(null);
	});

	describe('fetchUsers', () => {
		it('loads users and clears the loading state (happy path)', async () => {
			// GIVEN: The API returns a user collection.
			vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [ada] });

			// WHEN: Users are fetched.
			await fetchUsers();

			// THEN: The collection is stored without an error.
			expect(get(users)).toEqual([ada]);
			expect(get(error)).toBeNull();
			expect(get(loading)).toBe(false);
		});

		it('exposes the client error and keeps the list (sad path)', async () => {
			// GIVEN: A loaded list and an API failure.
			users.set([ada]);
			vi.mocked(api.getUsers).mockResolvedValue({ success: false, error: 'HTTP 500' });

			// WHEN: Users are fetched again.
			await fetchUsers();

			// THEN: The error is exposed, the list is unchanged and loading is over.
			expect(get(error)).toBe('HTTP 500');
			expect(get(users)).toEqual([ada]);
			expect(get(loading)).toBe(false);
		});

		it('uses a generic message when success comes without data (limit)', async () => {
			// GIVEN: A success envelope without data.
			vi.mocked(api.getUsers).mockResolvedValue({ success: true });

			// WHEN: Users are fetched.
			await fetchUsers();

			// THEN: The store reports a failure instead of storing undefined.
			expect(get(error)).toBe('Failed to fetch users');
			expect(get(users)).toEqual([]);
		});

		it('exposes the message when the API call throws (exception)', async () => {
			// GIVEN: The API call rejects.
			vi.mocked(api.getUsers).mockRejectedValue(new Error('Network down'));

			// WHEN: Users are fetched.
			await fetchUsers();

			// THEN: The error is exposed and loading is over.
			expect(get(error)).toBe('Network down');
			expect(get(loading)).toBe(false);
		});
	});

	describe('addUser', () => {
		it('appends and returns the created user (happy path)', async () => {
			// GIVEN: One user already listed and an API that accepts the new one.
			users.set([ada]);
			vi.mocked(api.createUser).mockResolvedValue({ success: true, data: bob });

			// WHEN: A user is created.
			const result = await addUser('Bob', 'bob@example.com');

			// THEN: The user is returned, appended after the existing one, without error.
			expect(result).toEqual(bob);
			expect(api.createUser).toHaveBeenCalledWith({ name: 'Bob', email: 'bob@example.com' });
			expect(get(users)).toEqual([ada, bob]);
			expect(get(error)).toBeNull();
			expect(get(loading)).toBe(false);
		});

		it('exposes the client error and adds nothing (sad path)', async () => {
			// GIVEN: The client reports a failure, in the form the real client produces.
			vi.mocked(api.createUser).mockResolvedValue({ success: false, error: 'HTTP 500' });

			// WHEN: A user is created.
			const result = await addUser('Ada', 'ada@example.com');

			// THEN: The error is exposed and no user is added.
			expect(result).toBeUndefined();
			expect(get(users)).toEqual([]);
			expect(get(error)).toBe('HTTP 500');
		});

		it('exposes the message and adds nothing when the API call throws (exception)', async () => {
			// GIVEN: The API call rejects.
			vi.mocked(api.createUser).mockRejectedValue(new Error('Network down'));

			// WHEN: A user is created.
			const result = await addUser('Ada', 'ada@example.com');

			// THEN: Nothing is added and the error is exposed.
			expect(result).toBeUndefined();
			expect(get(users)).toEqual([]);
			expect(get(error)).toBe('Network down');
			expect(get(loading)).toBe(false);
		});
	});

	describe('selectUser', () => {
		it('selects a user and loads its tasks (happy path)', async () => {
			// GIVEN: The API returns a user and its tasks.
			vi.mocked(api.getUser).mockResolvedValue({ success: true, data: ada });
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [adaTask] });

			// WHEN: The user is selected.
			await selectUser(ada.id);

			// THEN: The selection and tasks are available.
			expect(get(selectedUser)).toEqual(ada);
			expect(get(userTasks)).toEqual([adaTask]);
			expect(get(loading)).toBe(false);
		});

		it('exposes the error and loads no tasks when the user is not found (sad path)', async () => {
			// GIVEN: The API cannot find the user.
			vi.mocked(api.getUser).mockResolvedValue({ success: false, error: 'HTTP 404' });

			// WHEN: The user is selected.
			await selectUser(99);

			// THEN: Nothing is selected, the tasks are not requested.
			expect(get(error)).toBe('HTTP 404');
			expect(get(selectedUser)).toBeNull();
			expect(api.getUserTasks).not.toHaveBeenCalled();
			expect(get(loading)).toBe(false);
		});

		it('exposes the error when the tasks cannot be loaded (sad path)', async () => {
			// GIVEN: The user is found but its tasks fail.
			userTasks.set([adaTask]);
			vi.mocked(api.getUser).mockResolvedValue({ success: true, data: bob });
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: false, error: 'HTTP 500' });

			// WHEN: The user is selected.
			await selectUser(bob.id);

			// THEN: The error is exposed and the previous task list is not replaced.
			expect(get(error)).toBe('HTTP 500');
			expect(get(selectedUser)).toEqual(bob);
			expect(get(userTasks)).toEqual([adaTask]);
		});

		it('keeps only the last selection when requests overlap (limit)', async () => {
			// GIVEN: The first selection answers after the second one.
			const slowAda = deferred<ApiResponse<User>>();
			vi.mocked(api.getUser).mockImplementation((id) =>
				id === ada.id ? slowAda.promise : Promise.resolve({ success: true, data: bob })
			);
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });

			// WHEN: Ada then Bob are selected, and Ada's answer arrives last.
			const first = selectUser(ada.id);
			await selectUser(bob.id);
			slowAda.resolve({ success: true, data: ada });
			await first;

			// THEN: Bob stays selected and Ada's tasks are never requested.
			expect(get(selectedUser)).toEqual(bob);
			expect(api.getUserTasks).toHaveBeenCalledTimes(1);
			expect(api.getUserTasks).toHaveBeenCalledWith(bob.id);
			expect(get(loading)).toBe(false);
		});

		it('exposes the message when the API call throws (exception)', async () => {
			// GIVEN: The API call rejects.
			vi.mocked(api.getUser).mockRejectedValue(new Error('Network down'));

			// WHEN: The user is selected.
			await selectUser(ada.id);

			// THEN: The error is exposed and loading is over.
			expect(get(error)).toBe('Network down');
			expect(get(selectedUser)).toBeNull();
			expect(get(loading)).toBe(false);
		});
	});
});
