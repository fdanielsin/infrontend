import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { api, type ApiFailure, type Task } from '$lib/api/client';
import {
	editTask,
	removeTask,
	tasksStatus,
	toggleTask,
	userTasks
} from '$lib/features/tasks/store';
import { notifications } from '$lib/stores/notification';

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

const first: Task = { id: 10, title: 'First', description: '', user_id: 1, completed: false };
const second: Task = { id: 11, title: 'Second', description: '', user_id: 1, completed: false };
const third: Task = { id: 12, title: 'Third', description: '', user_id: 1, completed: false };

const gone: ApiFailure = {
	success: false,
	error: 'Task not found',
	status: 404,
	code: 'TASK_NOT_FOUND'
};

function failWith(failure: ApiFailure) {
	vi.mocked(api.updateTask).mockResolvedValue(failure);
	vi.mocked(api.deleteTask).mockResolvedValue(failure);
}

const actions = [
	['removeTask', (id: number) => removeTask(id)],
	['toggleTask', (id: number) => toggleTask(id, true)],
	['editTask', (id: number) => editTask(id, 'Changed', '')]
] as const;

describe('a task already deleted on the server (TASK_NOT_FOUND)', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		userTasks.set([first, second, third]);
		tasksStatus.loading.set(false);
		tasksStatus.error.set(null);
		notifications.set([]);
	});

	it.each(actions)(
		'%s drops the task and announces it, without any error (happy path)',
		async (_name, action) => {
			// GIVEN: The server no longer knows the task.
			failWith(gone);

			// WHEN: The action runs on it.
			const result = await action(second.id);

			// THEN: Only that task leaves the list, an information is shown, no error.
			expect(get(userTasks)).toEqual([first, third]);
			expect(get(notifications)).toEqual([
				expect.objectContaining({ message: 'Task already deleted', type: 'info' })
			]);
			expect(get(tasksStatus.error)).toBeNull();
			if (_name !== 'removeTask') expect(result).toBe(false);
		}
	);

	it.each([
		[
			'USER_NOT_FOUND',
			{ success: false, error: 'User not found', status: 404, code: 'USER_NOT_FOUND' }
		],
		[
			'ROUTE_NOT_FOUND',
			{ success: false, error: 'Route not found', status: 404, code: 'ROUTE_NOT_FOUND' }
		],
		['a 404 without code', { success: false, error: 'HTTP 404', status: 404 }],
		[
			'a 400',
			{
				success: false,
				error: 'Task title cannot be empty',
				status: 400,
				code: 'VALIDATION_FAILED'
			}
		],
		[
			'a 500',
			{ success: false, error: 'Internal server error', status: 500, code: 'INTERNAL_ERROR' }
		]
	] as const)('treats %s as an error and keeps the task (sad path)', async (_case, failure) => {
		// GIVEN: Any failure other than TASK_NOT_FOUND.
		failWith(failure);

		for (const [, action] of actions) {
			// WHEN: Each action runs.
			notifications.set([]);
			await action(second.id);

			// THEN: The error is shown and notified as an error, the task stays.
			expect(get(tasksStatus.error)).toBe(failure.error);
			expect(get(notifications)).toEqual([
				expect.objectContaining({ message: failure.error, type: 'error' })
			]);
			expect(get(userTasks)).toEqual([first, second, third]);
		}
	});

	it.each(actions)(
		'%s stays silent when the task is no longer listed (limit: second delete, user switched)',
		async (_name, action) => {
			// GIVEN: The task is already gone from the current list.
			userTasks.set([first]);
			failWith(gone);

			// WHEN: The action answers TASK_NOT_FOUND.
			await action(second.id);

			// THEN: Nothing changes and nothing is announced.
			expect(get(userTasks)).toEqual([first]);
			expect(get(notifications)).toEqual([]);
			expect(get(tasksStatus.error)).toBeNull();
		}
	);

	it('shows the fixed text, whatever message the server sends with the code (limit)', async () => {
		// GIVEN: TASK_NOT_FOUND with an unusual server message.
		failWith({ ...gone, error: 'Gone <b>for good</b>' });

		// WHEN: The task is removed.
		await removeTask(second.id);

		// THEN: The fixed information text is shown, never the server message.
		expect(get(notifications).map((n) => n.message)).toEqual(['Task already deleted']);
	});

	it('empties a one-task list (boundary)', async () => {
		// GIVEN: A single task, already deleted on the server.
		userTasks.set([second]);
		failWith(gone);

		// WHEN: It is toggled.
		await toggleTask(second.id, true);

		// THEN: The list is empty.
		expect(get(userTasks)).toEqual([]);
	});

	it('keeps the error cleared for the next successful action (boundary)', async () => {
		// GIVEN: A task found gone, then a successful toggle of another one.
		failWith(gone);
		await removeTask(second.id);
		vi.mocked(api.updateTask).mockResolvedValue({
			success: true,
			data: { id: first.id, title: first.title, description: '', completed: true }
		});

		// WHEN: Another task is toggled.
		await toggleTask(first.id, true);

		// THEN: No error appears.
		expect(get(tasksStatus.error)).toBeNull();
		expect(get(userTasks)).toEqual([{ ...first, completed: true }, third]);
	});

	it('treats a network failure during a delete as an error (exception)', async () => {
		// GIVEN: The delete request rejects.
		vi.mocked(api.deleteTask).mockRejectedValue(new TypeError('Failed to fetch'));

		// WHEN: The task is removed.
		await removeTask(second.id);

		// THEN: The error is shown and the task stays.
		expect(get(tasksStatus.error)).toBe('Failed to fetch');
		expect(get(userTasks)).toEqual([first, second, third]);
	});
});
