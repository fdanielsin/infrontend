import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { api } from '$lib/api/client';
import {
	addTask,
	editTask,
	removeTask,
	selectUser,
	toggleTask,
	userTasks,
	users
} from '$lib/stores/user';
import {
	addUser,
	error,
	fetchUserTasks,
	fetchUsers,
	loading,
	selectedUser
} from '$lib/features/users/store';

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

describe('user and task stores', () => {
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

	it('stores a task API failure without replacing existing tasks (sad path)', async () => {
		// GIVEN: Existing tasks are present and task creation fails.
		const existingTask = {
			id: 10,
			title: 'Review',
			description: 'Review code',
			user_id: 1,
			completed: false
		};
		userTasks.set([existingTask]);
		vi.mocked(api.createTask).mockResolvedValue({ success: false, error: 'Task rejected' });

		// WHEN: A task is added.
		const result = await addTask('New task', 'Details', 1);

		// THEN: The existing state remains intact and the error is exposed.
		expect(result).toBeUndefined();
		expect(get(userTasks)).toEqual([existingTask]);
		expect(get(error)).toBe('Task rejected');
	});

	it('updates and removes a task after successful API calls (happy path)', async () => {
		// GIVEN: A pending task exists and the API accepts both mutations.
		const task = {
			id: 10,
			title: 'Review',
			description: 'Review code',
			user_id: 1,
			completed: false
		};
		userTasks.set([task]);
		vi.mocked(api.updateTask).mockResolvedValue({ success: true });
		vi.mocked(api.deleteTask).mockResolvedValue({ success: true });

		// WHEN: The task is completed and then removed.
		await toggleTask(task.id, true);
		await removeTask(task.id);

		// THEN: The task is no longer present.
		expect(get(userTasks)).toEqual([]);
	});

	it('edits a task and preserves its completion state (happy path)', async () => {
		// GIVEN: A completed task exists and the API accepts the edit.
		const task = {
			id: 10,
			title: 'Review',
			description: 'Review code',
			user_id: 1,
			completed: true
		};
		userTasks.set([task]);
		vi.mocked(api.updateTask).mockResolvedValue({ success: true });

		// WHEN: The task title and description are edited.
		const result = await editTask(task.id, 'Review again', 'Review the updated code');

		// THEN: The content changes while completion remains unchanged.
		expect(result).toBe(true);
		expect(api.updateTask).toHaveBeenCalledWith(task.id, {
			title: 'Review again',
			description: 'Review the updated code'
		});
		expect(get(userTasks)).toEqual([
			{ ...task, title: 'Review again', description: 'Review the updated code' }
		]);
	});

	it('reports an edit failure without changing the task (sad path)', async () => {
		// GIVEN: The API rejects an edit.
		const task = {
			id: 10,
			title: 'Review',
			description: 'Review code',
			user_id: 1,
			completed: false
		};
		userTasks.set([task]);
		vi.mocked(api.updateTask).mockResolvedValue({ success: false, error: 'Task not found' });

		// WHEN: The task is edited.
		const result = await editTask(task.id, 'Changed', 'Changed description');

		// THEN: The original task and error remain available.
		expect(result).toBe(false);
		expect(get(userTasks)).toEqual([task]);
		expect(get(error)).toBe('Task not found');
	});

	it('stores fetched tasks and reports task loading errors (sad path)', async () => {
		// GIVEN: The task endpoint returns an error.
		vi.mocked(api.getUserTasks).mockResolvedValue({ success: false, error: 'Tasks unavailable' });

		// WHEN: Tasks are fetched directly.
		await fetchUserTasks(1);

		// THEN: The error is exposed and the task collection stays empty.
		expect(get(userTasks)).toEqual([]);
		expect(get(error)).toBe('Tasks unavailable');
	});

	it('reports failure and leaves the task untouched when the API rejects a toggle (sad path)', async () => {
		// GIVEN: An existing task and an API that rejects the toggle.
		const task = {
			id: 10,
			title: 'Review',
			description: 'Review code',
			user_id: 1,
			completed: false
		};
		userTasks.set([task]);
		vi.mocked(api.updateTask).mockResolvedValue({ success: false, error: 'Task locked' });

		// WHEN: The task is toggled.
		const result = await toggleTask(task.id, true);

		// THEN: The caller learns the toggle failed, the task is unchanged, and
		// the error is exposed (the caller is responsible for reverting any
		// optimistic UI, e.g. the checkbox's own DOM element).
		expect(result).toBe(false);
		expect(get(userTasks)).toEqual([task]);
		expect(get(error)).toBe('Task locked');
	});

	it('reports failure and leaves the task untouched when toggling throws (sad path)', async () => {
		// GIVEN: An existing task and an API call that throws.
		const task = {
			id: 10,
			title: 'Review',
			description: 'Review code',
			user_id: 1,
			completed: false
		};
		userTasks.set([task]);
		vi.mocked(api.updateTask).mockRejectedValue(new Error('Network down'));

		// WHEN: The task is toggled.
		const result = await toggleTask(task.id, true);

		// THEN: The caller learns the toggle failed and the task is unchanged.
		expect(result).toBe(false);
		expect(get(userTasks)).toEqual([task]);
		expect(get(error)).toBe('Network down');
	});

	it('reports success when the API accepts a toggle (happy path)', async () => {
		// GIVEN: An existing task and an API that accepts the toggle.
		const task = {
			id: 10,
			title: 'Review',
			description: 'Review code',
			user_id: 1,
			completed: false
		};
		userTasks.set([task]);
		vi.mocked(api.updateTask).mockResolvedValue({ success: true });

		// WHEN: The task is toggled.
		const result = await toggleTask(task.id, true);

		// THEN: The caller learns the toggle succeeded and the task is updated.
		expect(result).toBe(true);
		expect(get(userTasks)).toEqual([{ ...task, completed: true }]);
	});
});
