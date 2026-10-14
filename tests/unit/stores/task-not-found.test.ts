import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiFailure, type Task } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import { lastToast } from '../support/last-toast';

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

let app: AppState;

// Deleting waits for the end of the Undo toast: the helper lets it end and waits for the answer.
async function removeAndCommit(id: number) {
	app.tasks.remove(id);
	await app.tasks.commitPending();
}

const actions = [
	['removeTask', removeAndCommit],
	['toggleTask', (id: number) => app.tasks.toggle(id, true)],
	['editTask', (id: number) => app.tasks.edit(id, 'Changed', '')]
] as const;

describe('a task already deleted on the server (TASK_NOT_FOUND)', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
		app.tasks.tasks = [first, second, third];
	});

	it.each(actions.filter(([name]) => name !== 'removeTask'))(
		'%s drops the task and announces it, without any error (happy path)',
		async (_name, action) => {
			// GIVEN: The server no longer knows the task.
			failWith(gone);

			// WHEN: The action runs on it.
			const result = await action(second.id);

			// THEN: Only that task leaves the list, an information is shown, no error.
			expect(app.tasks.tasks).toEqual([first, third]);
			expect(app.notifications.items).toEqual([
				expect.objectContaining({ message: 'Task already deleted', type: 'info' })
			]);
			expect(app.notifications.items.filter((toast) => toast.type === 'error')).toEqual([]);
			expect(result).toBe(false);
		}
	);

	it('removeTask keeps the task out and says nothing more than its own toast (happy path)', async () => {
		// GIVEN: The server no longer knows the task the user deleted.
		failWith(gone);

		// WHEN: The deletion is sent.
		await removeAndCommit(second.id);

		// THEN: The task stays out, with neither an error nor the "already deleted" information:
		// the user's wish is met.
		expect(app.tasks.tasks).toEqual([first, third]);
		expect(app.notifications.items).toEqual([]);
	});

	it.each([
		[
			'USER_NOT_FOUND',
			{ success: false, error: 'User not found', status: 404, code: 'USER_NOT_FOUND' },
			'User not found'
		],
		[
			'ROUTE_NOT_FOUND',
			{ success: false, error: 'Route not found', status: 404, code: 'ROUTE_NOT_FOUND' },
			'Resource not found'
		],
		['a 404 without code', { success: false, error: 'HTTP 404', status: 404 }, 'HTTP 404'],
		[
			'a 400',
			{
				success: false,
				error: 'Task title cannot be empty',
				status: 400,
				code: 'VALIDATION_FAILED'
			},
			'Invalid data'
		],
		[
			'a 500',
			{ success: false, error: 'Internal server error', status: 500, code: 'INTERNAL_ERROR' },
			'Something went wrong on our side. Please try again in a moment.'
		]
	] as const)(
		'treats %s as an error and keeps the task (sad path)',
		async (_case, failure, shown) => {
			// GIVEN: Any failure other than TASK_NOT_FOUND.
			failWith(failure);

			for (const [name, action] of actions) {
				// WHEN: Each action runs.
				app.notifications.items = [];
				await action(second.id);

				// THEN: The error is shown and notified as an error, the task stays. A deletion always
				// says the same fixed thing, whatever the failure.
				const expected = name === 'removeTask' ? "We couldn't delete the task." : shown;
				expect(lastToast(app)).toBe(expected);
				expect(app.notifications.items).toEqual([
					expect.objectContaining({ message: expected, type: 'error' })
				]);
				expect(app.tasks.tasks).toEqual([first, second, third]);
			}
		}
	);

	it.each(actions)(
		'%s stays silent when the task is no longer listed (limit: second delete, user switched)',
		async (_name, action) => {
			// GIVEN: The task is already gone from the current list.
			app.tasks.tasks = [first];
			failWith(gone);

			// WHEN: The action answers TASK_NOT_FOUND.
			await action(second.id);

			// THEN: Nothing changes and nothing is announced.
			expect(app.tasks.tasks).toEqual([first]);
			expect(app.notifications.items).toEqual([]);
			expect(app.notifications.items.filter((toast) => toast.type === 'error')).toEqual([]);
		}
	);

	it('shows the fixed text, whatever message the server sends with the code (limit)', async () => {
		// GIVEN: TASK_NOT_FOUND with an unusual server message.
		failWith({ ...gone, error: 'Gone <b>for good</b>' });

		// WHEN: The task is toggled.
		await app.tasks.toggle(second.id, true);

		// THEN: The fixed information text is shown, never the server message.
		expect(app.notifications.items.map((n) => n.message)).toEqual(['Task already deleted']);
	});

	it('empties a one-task list (boundary)', async () => {
		// GIVEN: A single task, already deleted on the server.
		app.tasks.tasks = [second];
		failWith(gone);

		// WHEN: It is toggled.
		await app.tasks.toggle(second.id, true);

		// THEN: The list is empty.
		expect(app.tasks.tasks).toEqual([]);
	});

	it('keeps the error cleared for the next successful action (boundary)', async () => {
		// GIVEN: A task found gone, then a successful toggle of another one.
		failWith(gone);
		await removeAndCommit(second.id);
		vi.mocked(api.updateTask).mockResolvedValue({
			success: true,
			data: { id: first.id, title: first.title, description: '', completed: true }
		});

		// WHEN: Another task is toggled.
		await app.tasks.toggle(first.id, true);

		// THEN: No error appears.
		expect(app.notifications.items.filter((toast) => toast.type === 'error')).toEqual([]);
		expect(app.tasks.tasks).toEqual([{ ...first, completed: true }, third]);
	});

	it('treats a network failure during a delete as an error (exception)', async () => {
		// GIVEN: The delete request rejects.
		vi.mocked(api.deleteTask).mockRejectedValue(new TypeError('Failed to fetch'));

		// WHEN: The task is removed.
		await removeAndCommit(second.id);

		// THEN: The error is shown and the task stays.
		expect(lastToast(app)).toBe("We couldn't delete the task.");
		expect(app.tasks.tasks).toEqual([first, second, third]);
	});
});
