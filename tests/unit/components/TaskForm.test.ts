import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import TaskForm from '$lib/features/tasks/TaskForm.svelte';
import { lastToast } from '../support/last-toast';
import { renderWithApp } from '../support/render-with-app';

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

const user = { id: 1, name: 'Ada', email: 'ada@example.com' };
const task = {
	id: 10,
	title: 'Review',
	description: 'Review code',
	user_id: 1,
	completed: false
};

function addTaskForm(view: { getByLabelText: (label: string) => HTMLElement }) {
	const title = view.getByLabelText('Task Title') as HTMLInputElement;
	const description = view.getByLabelText('Description (optional)') as HTMLTextAreaElement;
	const form = title.closest('form') as HTMLFormElement;
	return {
		title,
		description,
		async submit(titleValue: string, descriptionValue: string) {
			await fireEvent.input(title, { target: { value: titleValue } });
			await fireEvent.input(description, { target: { value: descriptionValue } });
			await fireEvent.submit(form);
		}
	};
}

describe('TaskForm', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
		app.tasks.tasks = [task];
	});

	afterEach(() => {
		cleanup();
	});

	it('reverts the checkbox to the real state when the API rejects the toggle (sad path)', async () => {
		// GIVEN: A rendered task list and an API that rejects the toggle request.
		vi.mocked(api.updateTask).mockResolvedValue({ success: false, error: 'Task locked' });
		const { getByRole } = renderWithApp(app, TaskForm, { user });
		const checkbox = getByRole('checkbox', { name: 'Review' }) as HTMLInputElement;

		// WHEN: The user clicks the checkbox (the browser flips it natively before
		// the rejection is known).
		await fireEvent.click(checkbox);

		// THEN: Once the rejection is handled, the checkbox reflects the real,
		// unchanged `completed` value instead of keeping the optimistic click.
		await waitFor(() => expect(checkbox.checked).toBe(false));
		expect(lastToast(app)).toBe('Task locked');
	});

	it('asks to select a user when none is selected (happy path)', () => {
		// GIVEN / WHEN: The form is rendered without a user.
		const { getByText, queryByRole } = renderWithApp(app, TaskForm, { user: null });

		// THEN: Only the invitation is shown, no task form.
		expect(getByText('Select a user to manage tasks')).toBeTruthy();
		expect(queryByRole('button', { name: 'Add Task' })).toBeNull();
	});

	it('adds a task and clears the fields (happy path)', async () => {
		// GIVEN: An API that accepts the task.
		const created = { ...task, id: 11, title: 'Buy milk', description: 'Semi-skimmed' };
		vi.mocked(api.createTask).mockResolvedValue({ success: true, data: created });
		const view = renderWithApp(app, TaskForm, { user });
		const form = addTaskForm(view);

		// WHEN: A valid task is submitted.
		await form.submit('Buy milk', 'Semi-skimmed');

		// THEN: It is listed and the fields are emptied.
		await waitFor(() => expect(view.getByText('Buy milk')).toBeTruthy());
		expect(api.createTask).toHaveBeenCalledWith({
			title: 'Buy milk',
			description: 'Semi-skimmed',
			user_id: user.id,
			completed: false
		});
		expect(form.title.value).toBe('');
		expect(form.description.value).toBe('');
	});

	it('cancels an edit without calling the API (happy path)', async () => {
		// GIVEN: A task being edited with a changed title.
		const view = renderWithApp(app, TaskForm, { user });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		const editTitle = view.getByDisplayValue('Review') as HTMLInputElement;
		await fireEvent.input(editTitle, { target: { value: 'Changed' } });

		// WHEN: The edit is cancelled.
		await fireEvent.click(view.getByRole('button', { name: 'Cancel' }));

		// THEN: The original task is shown again and nothing was sent.
		expect(view.getByText('Review')).toBeTruthy();
		expect(view.queryByDisplayValue('Changed')).toBeNull();
		expect(api.updateTask).not.toHaveBeenCalled();
	});

	it('refuses an empty title, whatever the description (sad path)', async () => {
		// GIVEN: A rendered form.
		const view = renderWithApp(app, TaskForm, { user });

		// WHEN: An empty title is submitted with a short description.
		await addTaskForm(view).submit('', 'ab');

		// THEN: Only the title is reported (the contract requires it) and nothing is sent.
		expect(await view.findByText('Title is required')).toBeTruthy();
		expect(view.queryByText(/at least 3 characters/)).toBeNull();
		expect(view.getByLabelText('Description (optional)').getAttribute('aria-invalid')).toBe(
			'false'
		);
		expect(api.createTask).not.toHaveBeenCalled();
	});

	it('current rule: refuses an edit with an empty title (sad path)', async () => {
		// GIVEN: A task being edited.
		const view = renderWithApp(app, TaskForm, { user });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		const editTitle = view.getByDisplayValue('Review') as HTMLInputElement;

		// WHEN: The title is emptied and saved.
		await fireEvent.input(editTitle, { target: { value: '' } });
		await fireEvent.submit(editTitle.closest('form') as HTMLFormElement);

		// THEN: The message is shown, the edit stays open and nothing is sent.
		expect(await view.findByText('Title is required')).toBeTruthy();
		expect(editTitle.getAttribute('aria-invalid')).toBe('true');
		expect(api.updateTask).not.toHaveBeenCalled();
	});

	it('accepts a 1-character title with an empty description, as the contract does (boundary)', async () => {
		// GIVEN: An API that accepts the task.
		vi.mocked(api.createTask).mockResolvedValue({
			success: true,
			data: { ...task, id: 11, title: 'B', description: '' }
		});
		const view = renderWithApp(app, TaskForm, { user });

		// WHEN: The shortest accepted values are submitted.
		await addTaskForm(view).submit('B', '');

		// THEN: The task is sent as is, without any validation message.
		await waitFor(() =>
			expect(api.createTask).toHaveBeenCalledWith({
				title: 'B',
				description: '',
				user_id: user.id,
				completed: false
			})
		);
		expect(view.queryByText('Title is required')).toBeNull();
	});

	it('accepts a Unicode description of exactly 2000 characters (boundary)', async () => {
		// GIVEN: A description of 2000 code points (2400 UTF-16 units) with accents, emoji and markup.
		const description = 'é🚀<b>'.repeat(400);
		vi.mocked(api.createTask).mockResolvedValue({
			success: true,
			data: { ...task, id: 11, title: 'Long', description }
		});
		const view = renderWithApp(app, TaskForm, { user });

		// WHEN: It is submitted.
		await addTaskForm(view).submit('Long', description);

		// THEN: It is sent unchanged.
		await waitFor(() =>
			expect(api.createTask).toHaveBeenCalledWith({
				title: 'Long',
				description,
				user_id: user.id,
				completed: false
			})
		);
	});

	it('refuses a description over 2000 characters with a message, without sending (limit)', async () => {
		// GIVEN: A description one character over the limit.
		const description = 'a'.repeat(2001);
		const view = renderWithApp(app, TaskForm, { user });

		// WHEN: It is submitted.
		await addTaskForm(view).submit('Long', description);

		// THEN: The message is shown and nothing is sent.
		expect(await view.findByText('Description must be at most 2000 characters')).toBeTruthy();
		expect(api.createTask).not.toHaveBeenCalled();
	});

	it('clears a description by editing it to empty (happy path)', async () => {
		// GIVEN: A task being edited and an API that accepts the change.
		vi.mocked(api.updateTask).mockResolvedValue({
			success: true,
			data: { id: task.id, title: task.title, description: '', completed: task.completed }
		});
		const view = renderWithApp(app, TaskForm, { user });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		const editDescription = view.getByDisplayValue('Review code') as HTMLTextAreaElement;

		// WHEN: The description is emptied and saved.
		await fireEvent.input(editDescription, { target: { value: '' } });
		await fireEvent.submit(editDescription.closest('form') as HTMLFormElement);

		// THEN: The empty description is sent and the edit closes.
		await waitFor(() =>
			expect(api.updateTask).toHaveBeenCalledWith(task.id, { title: 'Review', description: '' })
		);
		await waitFor(() => expect(view.queryByDisplayValue('Review')).toBeNull());
		expect(view.queryByText('Review code')).toBeNull();
	});

	it('shows "No tasks yet" for an empty list (limit)', () => {
		// GIVEN / WHEN: The user has no task.
		app.tasks.tasks = [];
		const { getByText } = renderWithApp(app, TaskForm, { user });

		// THEN: The empty state and a zero count are shown.
		expect(getByText('No tasks yet')).toBeTruthy();
		expect(getByText('Tasks (0)')).toBeTruthy();
	});

	it('renders titles with markup as plain text (limit)', () => {
		// GIVEN: A task whose title contains HTML.
		app.tasks.tasks = [{ ...task, title: '<img src=x onerror=alert(1)>' }];

		// WHEN: The list is rendered.
		const { getByText, container } = renderWithApp(app, TaskForm, { user });

		// THEN: The title is shown as typed and no element is injected.
		expect(getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
		expect(container.querySelector('li img')).toBeNull();
	});

	it('reverts the checkbox when the toggle request throws (exception)', async () => {
		// GIVEN: A toggle request that rejects.
		vi.mocked(api.updateTask).mockRejectedValue(new Error('Network down'));
		const { getByRole } = renderWithApp(app, TaskForm, { user });
		const checkbox = getByRole('checkbox', { name: 'Review' }) as HTMLInputElement;

		// WHEN: The checkbox is clicked.
		await fireEvent.click(checkbox);

		// THEN: It returns to the real state and the error is shown.
		await waitFor(() => expect(checkbox.checked).toBe(false));
		expect(lastToast(app)).toBe('Network down');
	});

	it('keeps "Add Task" usable while the users are loading (sad path, F-02)', () => {
		// GIVEN: The users feature is loading.
		app.users.status.loading = true;

		// WHEN: The task form is rendered.
		const { getByRole } = renderWithApp(app, TaskForm, { user });

		// THEN: Adding a task is not blocked by another feature.
		expect((getByRole('button', { name: 'Add Task' }) as HTMLButtonElement).disabled).toBe(false);
	});

	describe('a task already deleted on the server', () => {
		const other = { ...task, id: 11, title: 'Other', description: 'Other code' };
		const gone = {
			success: false as const,
			error: 'Task not found',
			status: 404,
			code: 'TASK_NOT_FOUND'
		};

		it('closes the edit of a task that is gone, and removes its line (happy path)', async () => {
			// GIVEN: A task being edited, already deleted on the server.
			vi.mocked(api.updateTask).mockResolvedValue(gone);
			const view = renderWithApp(app, TaskForm, { user });
			await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
			const editTitle = view.getByDisplayValue('Review') as HTMLInputElement;

			// WHEN: The edit is saved.
			await fireEvent.input(editTitle, { target: { value: 'Changed' } });
			await fireEvent.submit(editTitle.closest('form') as HTMLFormElement);

			// THEN: The edit closes, the task is gone and no error banner is shown.
			await waitFor(() => expect(view.queryByDisplayValue('Changed')).toBeNull());
			expect(view.queryByText('Review')).toBeNull();
			expect(view.queryByText('Task not found')).toBeNull();
			expect(view.getByText('No tasks yet')).toBeTruthy();
		});

		it('keeps the edit of another task open when a different task disappears (limit)', async () => {
			// GIVEN: Two tasks; the second is being edited, the first is gone on the server.
			app.tasks.tasks = [task, other];
			vi.mocked(api.deleteTask).mockResolvedValue(gone);
			const view = renderWithApp(app, TaskForm, { user });
			await fireEvent.click(view.getByRole('button', { name: 'Edit Other' }));
			const editTitle = view.getByDisplayValue('Other') as HTMLInputElement;
			await fireEvent.input(editTitle, { target: { value: 'Other draft' } });

			// WHEN: The first task is deleted and the server confirms it is gone.
			await fireEvent.click(view.getByRole('button', { name: 'Delete Review' }));

			// THEN: The first line disappears and the draft of the second stays open.
			await waitFor(() => expect(view.queryByText('Review')).toBeNull());
			expect((view.getByDisplayValue('Other draft') as HTMLInputElement).value).toBe('Other draft');
		});

		it('removes the line of a gone task on toggle, without error banner (boundary)', async () => {
			// GIVEN: A listed task already deleted on the server.
			vi.mocked(api.updateTask).mockResolvedValue(gone);
			const { getByRole, queryByRole, queryByText } = renderWithApp(app, TaskForm, { user });

			// WHEN: Its checkbox is clicked.
			await fireEvent.click(getByRole('checkbox', { name: 'Review' }));

			// THEN: The line disappears and no error is shown.
			await waitFor(() => expect(queryByRole('checkbox', { name: 'Review' })).toBeNull());
			expect(queryByText('Task not found')).toBeNull();
		});
	});
});
