import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { api, type ApiResult, type Task, type User } from '$lib/api/client';
import {
	addUser,
	fetchUsers,
	selectUser,
	selectedUser,
	users,
	usersStatus
} from '$lib/features/users/store';
import { tasksStatus, userTasks } from '$lib/features/tasks/store';
import { notifications } from '$lib/stores/notification';

const { error, loading } = usersStatus;

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
		tasksStatus.loading.set(false);
		tasksStatus.error.set(null);
		notifications.set([]);
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

		it('shows no task of the previous user when the tasks cannot be loaded (sad path, QM-04)', async () => {
			// GIVEN: Ada's tasks are listed, Bob is found but his tasks fail.
			userTasks.set([adaTask]);
			vi.mocked(api.getUser).mockResolvedValue({ success: true, data: bob });
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: false, error: 'HTTP 500' });

			// WHEN: Bob is selected.
			await selectUser(bob.id);

			// THEN: Bob is selected with an empty list and the tasks error; users keep no error.
			expect(get(selectedUser)).toEqual(bob);
			expect(get(userTasks)).toEqual([]);
			expect(get(tasksStatus.error)).toBe('HTTP 500');
			expect(get(error)).toBeNull();
		});

		it('clears the previous tasks as soon as another user is selected (limit, QM-04)', async () => {
			// GIVEN: Ada's tasks are listed and Bob's user request is still pending.
			userTasks.set([adaTask]);
			const slowBob = deferred<ApiResult<User>>();
			vi.mocked(api.getUser).mockReturnValue(slowBob.promise);
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });

			// WHEN: Bob is selected.
			const selection = selectUser(bob.id);

			// THEN: Ada's tasks are gone before any answer, so none can be acted on under Bob.
			expect(get(userTasks)).toEqual([]);
			slowBob.resolve({ success: true, data: bob });
			await selection;
		});

		it('selects nobody when the newly chosen user cannot be loaded (sad path, QM-05)', async () => {
			// GIVEN: Ada is selected with her tasks, and Bob cannot be loaded.
			selectedUser.set(ada);
			userTasks.set([adaTask]);
			vi.mocked(api.getUser).mockResolvedValue({
				success: false,
				error: 'User not found',
				status: 404
			});

			// WHEN: Bob is selected.
			await selectUser(bob.id);

			// THEN: No user stays selected with an emptied list; the error is shown.
			expect(get(selectedUser)).toBeNull();
			expect(get(userTasks)).toEqual([]);
			expect(get(error)).toBe('User not found');
			expect(api.getUserTasks).not.toHaveBeenCalled();
		});

		it('deselects the previous user as soon as another one is chosen (limit, QM-05)', async () => {
			// GIVEN: Ada is selected and Bob's request is still pending.
			selectedUser.set(ada);
			const slowBob = deferred<ApiResult<User>>();
			vi.mocked(api.getUser).mockReturnValue(slowBob.promise);
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });

			// WHEN: Bob is selected.
			const selection = selectUser(bob.id);

			// THEN: Ada is no longer selected while Bob loads, then Bob is.
			expect(get(selectedUser)).toBeNull();
			slowBob.resolve({ success: true, data: bob });
			await selection;
			expect(get(selectedUser)).toEqual(bob);
		});

		it('keeps only the last selection when requests overlap (limit)', async () => {
			// GIVEN: The first selection answers after the second one.
			const slowAda = deferred<ApiResult<User>>();
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

	describe('error feedback', () => {
		it('exposes the backend message as is (sad path, F-01)', async () => {
			// GIVEN: The backend refuses a taken email.
			vi.mocked(api.createUser).mockResolvedValue({
				success: false,
				error: 'Email already in use',
				status: 409,
				code: 'EMAIL_TAKEN'
			});

			// WHEN: The user is created.
			await addUser('Ada', 'ada@x.io');

			// THEN: The exact backend message is exposed.
			expect(get(error)).toBe('Email already in use');
		});

		it('uses the fallback message when the failure has none (limit)', async () => {
			// GIVEN: A failure with an empty message.
			vi.mocked(api.getUsers).mockResolvedValue({ success: false, error: '' });

			// WHEN: Users are fetched.
			await fetchUsers();

			// THEN: The fallback of the action is shown.
			expect(get(error)).toBe('Failed to fetch users');
		});

		it('publishes the failure as a 6 s error notification (sad path, QM-02)', async () => {
			// GIVEN: The backend refuses the user.
			vi.useFakeTimers();
			vi.mocked(api.createUser).mockResolvedValue({
				success: false,
				error: 'Email already in use'
			});

			// WHEN: The user is created.
			await addUser('Ada', 'ada@x.io');

			// THEN: One error notification with the same message, removed after exactly 6000 ms.
			expect(get(notifications)).toEqual([
				expect.objectContaining({ message: 'Email already in use', type: 'error', duration: 6000 })
			]);
			vi.advanceTimersByTime(5999);
			expect(get(notifications)).toHaveLength(1);
			vi.advanceTimersByTime(1);
			expect(get(notifications)).toEqual([]);
			vi.useRealTimers();
		});

		it('publishes no notification on success (happy path, QM-02)', async () => {
			// GIVEN / WHEN: Users are fetched successfully.
			vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [ada] });
			await fetchUsers();

			// THEN: Nothing is notified.
			expect(get(notifications)).toEqual([]);
		});

		it('publishes no notification for a superseded selection (limit, QM-02)', async () => {
			// GIVEN: Ada's selection fails after Bob's selection succeeded.
			const slowAda = deferred<ApiResult<User>>();
			vi.mocked(api.getUser).mockImplementation((id) =>
				id === ada.id ? slowAda.promise : Promise.resolve({ success: true, data: bob })
			);
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });

			// WHEN: Ada then Bob are selected, and Ada's failure arrives last.
			const first = selectUser(ada.id);
			await selectUser(bob.id);
			slowAda.resolve({ success: false, error: 'HTTP 500' });
			await first;

			// THEN: The stale failure is neither shown nor notified.
			expect(get(error)).toBeNull();
			expect(get(notifications)).toEqual([]);
		});

		it('clears the previous error when an action starts and keeps it cleared on success (happy path, QM-03)', async () => {
			// GIVEN: A previous failure and a request that has not answered yet.
			error.set('previous failure');
			const pending = deferred<ApiResult<User[]>>();
			vi.mocked(api.getUsers).mockReturnValue(pending.promise);

			// WHEN: Users are fetched.
			const fetching = fetchUsers();

			// THEN: The error is cleared at once, and stays cleared after the success.
			expect(get(error)).toBeNull();
			pending.resolve({ success: true, data: [ada] });
			await fetching;
			expect(get(error)).toBeNull();
		});

		it('keeps users and tasks errors and loading apart (sad path, F-02)', async () => {
			// GIVEN: A user creation that fails and is slow.
			const pending = deferred<ApiResult<User>>();
			vi.mocked(api.createUser).mockReturnValue(pending.promise);

			// WHEN: The user is created.
			const creating = addUser('Ada', 'ada@x.io');

			// THEN: Only the users status is loading, then only it holds the error.
			expect(get(loading)).toBe(true);
			expect(get(tasksStatus.loading)).toBe(false);
			pending.resolve({ success: false, error: 'Email already in use' });
			await creating;
			expect(get(error)).toBe('Email already in use');
			expect(get(tasksStatus.error)).toBeNull();
		});
	});
});
