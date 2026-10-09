import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiResult, type UpdatedTask } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import { lastToast } from '../support/last-toast';

function updated(task: { id: number; title: string; description: string; completed: boolean }) {
	return {
		success: true as const,
		data: {
			id: task.id,
			title: task.title,
			description: task.description,
			completed: task.completed
		}
	};
}

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

// Deleting waits for the end of the Undo toast: the helper lets it end and waits for the answer.
async function removeAndCommit(app: AppState, id: number) {
	app.tasks.remove(id);
	await app.tasks.commitPending();
}

describe('tasks store', () => {
	const task = {
		id: 10,
		title: 'Review',
		description: 'Review code',
		user_id: 1,
		completed: false
	};

	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
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
		app.tasks.tasks = [existingTask];
		vi.mocked(api.createTask).mockResolvedValue({ success: false, error: 'Task rejected' });

		// WHEN: A task is added.
		const result = await app.tasks.add('New task', 'Details', 1);

		// THEN: The existing state remains intact and the error is exposed.
		expect(result).toBeUndefined();
		expect(app.tasks.tasks).toEqual([existingTask]);
		expect(lastToast(app)).toBe('Task rejected');
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
		app.tasks.tasks = [task];
		vi.mocked(api.updateTask).mockResolvedValue(
			updated({ ...task, title: 'Review again', description: 'Review the updated code' })
		);

		// WHEN: The task title and description are edited.
		const result = await app.tasks.edit(task.id, 'Review again', 'Review the updated code');

		// THEN: The content changes while completion remains unchanged.
		expect(result).toBe(true);
		expect(api.updateTask).toHaveBeenCalledWith(task.id, {
			title: 'Review again',
			description: 'Review the updated code'
		});
		expect(app.tasks.tasks).toEqual([
			{ ...task, title: 'Review again', description: 'Review the updated code' }
		]);
	});

	it('reports an edit failure without changing the task (sad path)', async () => {
		// GIVEN: The API rejects an edit.
		app.tasks.tasks = [task];
		vi.mocked(api.updateTask).mockResolvedValue({ success: false, error: 'Task not found' });

		// WHEN: The task is edited.
		const result = await app.tasks.edit(task.id, 'Changed', 'Changed description');

		// THEN: The original task and error remain available.
		expect(result).toBe(false);
		expect(app.tasks.tasks).toEqual([task]);
		expect(lastToast(app)).toBe('Task not found');
	});

	it('reports failure and leaves the task untouched when the API rejects a toggle (sad path)', async () => {
		// GIVEN: An existing task and an API that rejects the toggle.
		app.tasks.tasks = [task];
		vi.mocked(api.updateTask).mockResolvedValue({ success: false, error: 'Task locked' });

		// WHEN: The task is toggled.
		const result = await app.tasks.toggle(task.id, true);

		// THEN: The caller learns the toggle failed, the task is unchanged, and
		// the error is exposed (the caller is responsible for reverting any
		// optimistic UI, e.g. the checkbox's own DOM element).
		expect(result).toBe(false);
		expect(app.tasks.tasks).toEqual([task]);
		expect(lastToast(app)).toBe('Task locked');
	});

	it('reports failure and leaves the task untouched when toggling throws (sad path)', async () => {
		// GIVEN: An existing task and an API call that throws.
		app.tasks.tasks = [task];
		vi.mocked(api.updateTask).mockRejectedValue(new Error('Network down'));

		// WHEN: The task is toggled.
		const result = await app.tasks.toggle(task.id, true);

		// THEN: The caller learns the toggle failed and the task is unchanged.
		expect(result).toBe(false);
		expect(app.tasks.tasks).toEqual([task]);
		expect(lastToast(app)).toBe('Network down');
	});

	it('reports success when the API accepts a toggle (happy path)', async () => {
		// GIVEN: An existing task and an API that accepts the toggle.
		app.tasks.tasks = [task];
		vi.mocked(api.updateTask).mockResolvedValue(updated({ ...task, completed: true }));

		// WHEN: The task is toggled.
		const result = await app.tasks.toggle(task.id, true);

		// THEN: Only completed is sent, the caller learns the toggle succeeded and the task is updated.
		expect(api.updateTask).toHaveBeenCalledWith(task.id, { completed: true });
		expect(result).toBe(true);
		expect(app.tasks.tasks).toEqual([{ ...task, completed: true }]);
	});

	it('appends and returns the created task (happy path)', async () => {
		// GIVEN: One task listed and an API that accepts the new one.
		app.tasks.tasks = [task];
		const created = { ...task, id: 11, title: 'New task', description: 'Details' };
		vi.mocked(api.createTask).mockResolvedValue({ success: true, data: created });

		// WHEN: A task is added.
		const result = await app.tasks.add('New task', 'Details', 1);

		// THEN: The API receives an uncompleted task and the store appends it.
		expect(result).toEqual(created);
		expect(api.createTask).toHaveBeenCalledWith({
			title: 'New task',
			description: 'Details',
			user_id: 1,
			completed: false
		});
		expect(app.tasks.tasks).toEqual([task, created]);
		expect(lastToast(app)).toBeNull();
		expect(app.tasks.status.loading).toBe(false);
	});

	it('removes only the deleted task (happy path)', async () => {
		// GIVEN: Two tasks and an API that accepts the deletion.
		const other = { ...task, id: 11, title: 'Other' };
		app.tasks.tasks = [task, other];
		vi.mocked(api.deleteTask).mockResolvedValue({ success: true, message: 'Task deleted' });

		// WHEN: The first task is removed.
		await removeAndCommit(app, task.id);

		// THEN: Only the other task remains.
		expect(api.deleteTask).toHaveBeenCalledWith(task.id);
		expect(app.tasks.tasks).toEqual([other]);
	});

	it('keeps the task and exposes the error when the API refuses the deletion (sad path)', async () => {
		// GIVEN: The API refuses the deletion.
		app.tasks.tasks = [task];
		vi.mocked(api.deleteTask).mockResolvedValue({ success: false, error: 'HTTP 500' });

		// WHEN: The task is removed.
		await removeAndCommit(app, task.id);

		// THEN: The task is listed again and the error is exposed.
		expect(app.tasks.tasks).toEqual([task]);
		expect(lastToast(app)).toBe('HTTP 500');
	});

	it('leaves the list unchanged for an id that is not listed (boundary)', async () => {
		// GIVEN: The API accepts every call for an id absent from the local list.
		app.tasks.tasks = [task];
		vi.mocked(api.updateTask).mockResolvedValue(updated({ ...task, id: 999 }));
		vi.mocked(api.deleteTask).mockResolvedValue({ success: true });

		// WHEN: The unknown id is toggled, edited and removed.
		await app.tasks.toggle(999, true);
		await app.tasks.edit(999, 'Changed', 'Changed description');
		await removeAndCommit(app, 999);

		// THEN: The listed task is untouched.
		expect(app.tasks.tasks).toEqual([task]);
	});

	it.each([
		['addTask', () => app.tasks.add('New task', 'Details', 1)],
		['editTask', () => app.tasks.edit(10, 'Changed', 'Changed description')],
		['removeTask', () => removeAndCommit(app, 10)]
	] as const)(
		'%s keeps the list and exposes the message when the API call throws (exception)',
		async (_name, action) => {
			// GIVEN: Every API call rejects.
			app.tasks.tasks = [task];
			vi.mocked(api.createTask).mockRejectedValue(new Error('Network down'));
			vi.mocked(api.updateTask).mockRejectedValue(new Error('Network down'));
			vi.mocked(api.deleteTask).mockRejectedValue(new Error('Network down'));

			// WHEN: The action runs.
			await action();

			// THEN: The list is unchanged, the error is exposed and loading is over.
			expect(app.tasks.tasks).toEqual([task]);
			expect(lastToast(app)).toBe('Network down');
			expect(app.tasks.status.loading).toBe(false);
		}
	);

	it.each(['toggleTask', 'removeTask'] as const)(
		'%s never switches loading on, so the forms stay usable (limit, F-02)',
		async (action) => {
			// GIVEN: A slow API.
			app.tasks.tasks = [task];
			let answer!: (value: ApiResult<UpdatedTask>) => void;
			vi.mocked(api.updateTask).mockReturnValue(new Promise((resolve) => (answer = resolve)));
			let answerDelete!: (value: ApiResult<void>) => void;
			vi.mocked(api.deleteTask).mockReturnValue(new Promise((resolve) => (answerDelete = resolve)));

			// WHEN: The background action runs.
			const running =
				action === 'toggleTask' ? app.tasks.toggle(task.id, true) : removeAndCommit(app, task.id);

			// THEN: loading never becomes true.
			expect(app.tasks.status.loading).toBe(false);
			if (action === 'toggleTask') answer(updated({ ...task, completed: true }));
			else answerDelete({ success: true });
			await running;
			expect(app.tasks.status.loading).toBe(false);
		}
	);

	it('publishes a failed toggle as an error notification (sad path, QM-02)', async () => {
		// GIVEN: The API refuses the toggle.
		app.tasks.tasks = [task];
		vi.mocked(api.updateTask).mockResolvedValue({
			success: false,
			error: 'Task not found',
			status: 404
		});

		// WHEN: The task is toggled.
		await app.tasks.toggle(task.id, true);

		// THEN: The same message is notified as an error.
		expect(app.notifications.items).toEqual([
			expect.objectContaining({ message: 'Task not found', type: 'error', duration: 6000 })
		]);
	});

	it.each([
		[
			'addTask',
			() => app.tasks.add('New task', 'Details', 1),
			"We couldn't add the task. Your entries are kept."
		],
		['toggleTask', () => app.tasks.toggle(10, true), "We couldn't update the task."],
		['editTask', () => app.tasks.edit(10, 'Changed', ''), "We couldn't update the task."],
		['removeTask', () => removeAndCommit(app, 10), "We couldn't delete the task."]
	] as const)(
		'%s shows its own fallback message when the failure has none (limit)',
		async (_name, action, fallback) => {
			// GIVEN: Every API call fails without a message.
			app.tasks.tasks = [task];
			const failure = { success: false as const, error: '' };
			vi.mocked(api.createTask).mockResolvedValue(failure);
			vi.mocked(api.updateTask).mockResolvedValue(failure);
			vi.mocked(api.deleteTask).mockResolvedValue(failure);

			// WHEN: The action runs.
			await action();

			// THEN: The action's fallback is shown and notified.
			expect(lastToast(app)).toBe(fallback);
			expect(app.notifications.items).toEqual([expect.objectContaining({ message: fallback })]);
		}
	);
});
