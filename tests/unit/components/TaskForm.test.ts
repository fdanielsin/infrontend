import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { api } from '$lib/api/client';
import { userTasks } from '$lib/features/tasks/store';
import { error, loading } from '$lib/stores/request-status';
import TaskForm from '$lib/features/tasks/TaskForm.svelte';

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
	const description = view.getByLabelText('Description') as HTMLTextAreaElement;
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
	beforeEach(() => {
		vi.resetAllMocks();
		userTasks.set([task]);
		loading.set(false);
		error.set(null);
	});

	afterEach(() => {
		cleanup();
	});

	it('reverts the checkbox to the real state when the API rejects the toggle (sad path)', async () => {
		// GIVEN: A rendered task list and an API that rejects the toggle request.
		vi.mocked(api.updateTask).mockResolvedValue({ success: false, error: 'Task locked' });
		const { getByRole } = render(TaskForm, { props: { user } });
		const checkbox = getByRole('checkbox', {
			name: /mark review as complete/i
		}) as HTMLInputElement;

		// WHEN: The user clicks the checkbox (the browser flips it natively before
		// the rejection is known).
		await fireEvent.click(checkbox);

		// THEN: Once the rejection is handled, the checkbox reflects the real,
		// unchanged `completed` value instead of keeping the optimistic click.
		await waitFor(() => expect(checkbox.checked).toBe(false));
		expect(getByRole('alert').textContent).toContain('Task locked');
	});

	it('asks to select a user when none is selected (happy path)', () => {
		// GIVEN / WHEN: The form is rendered without a user.
		const { getByText, queryByRole } = render(TaskForm, { props: { user: null } });

		// THEN: Only the invitation is shown, no task form.
		expect(getByText('Select a user to manage tasks')).toBeTruthy();
		expect(queryByRole('button', { name: 'Add Task' })).toBeNull();
	});

	it('adds a task and clears the fields (happy path)', async () => {
		// GIVEN: An API that accepts the task.
		const created = { ...task, id: 11, title: 'Buy milk', description: 'Semi-skimmed' };
		vi.mocked(api.createTask).mockResolvedValue({ success: true, data: created });
		const view = render(TaskForm, { props: { user } });
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
		const view = render(TaskForm, { props: { user } });
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

	it('current rule: refuses an empty title and a 2-character description (sad path)', async () => {
		// GIVEN: A rendered form.
		const view = render(TaskForm, { props: { user } });

		// WHEN: An empty title and a 2-character description are submitted.
		await addTaskForm(view).submit('', 'ab');

		// THEN: Both messages are shown and nothing is sent.
		expect(await view.findByText('Title is required')).toBeTruthy();
		expect(view.getByText('Description must be at least 3 characters')).toBeTruthy();
		expect(api.createTask).not.toHaveBeenCalled();
	});

	it('current rule: refuses an edit with an empty title (sad path)', async () => {
		// GIVEN: A task being edited.
		const view = render(TaskForm, { props: { user } });
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

	it('current rule: accepts a 1-character title with a 3-character description (boundary)', async () => {
		// GIVEN: An API that accepts the task.
		vi.mocked(api.createTask).mockResolvedValue({
			success: true,
			data: { ...task, id: 11, title: 'B', description: 'abc' }
		});
		const view = render(TaskForm, { props: { user } });

		// WHEN: The shortest accepted values are submitted.
		await addTaskForm(view).submit('B', 'abc');

		// THEN: The task is sent without any validation message.
		await waitFor(() =>
			expect(api.createTask).toHaveBeenCalledWith({
				title: 'B',
				description: 'abc',
				user_id: user.id,
				completed: false
			})
		);
		expect(view.queryByText('Title is required')).toBeNull();
		expect(view.queryByText('Description must be at least 3 characters')).toBeNull();
	});

	it('shows "No tasks yet" for an empty list (limit)', () => {
		// GIVEN / WHEN: The user has no task.
		userTasks.set([]);
		const { getByText } = render(TaskForm, { props: { user } });

		// THEN: The empty state and a zero count are shown.
		expect(getByText('No tasks yet')).toBeTruthy();
		expect(getByText('Tasks (0)')).toBeTruthy();
	});

	it('renders titles with markup as plain text (limit)', () => {
		// GIVEN: A task whose title contains HTML.
		userTasks.set([{ ...task, title: '<img src=x onerror=alert(1)>' }]);

		// WHEN: The list is rendered.
		const { getByText, container } = render(TaskForm, { props: { user } });

		// THEN: The title is shown as typed and no element is injected.
		expect(getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
		expect(container.querySelector('li img')).toBeNull();
	});

	it('reverts the checkbox when the toggle request throws (exception)', async () => {
		// GIVEN: A toggle request that rejects.
		vi.mocked(api.updateTask).mockRejectedValue(new Error('Network down'));
		const { getByRole } = render(TaskForm, { props: { user } });
		const checkbox = getByRole('checkbox', {
			name: /mark review as complete/i
		}) as HTMLInputElement;

		// WHEN: The checkbox is clicked.
		await fireEvent.click(checkbox);

		// THEN: It returns to the real state and the error is shown.
		await waitFor(() => expect(checkbox.checked).toBe(false));
		expect(getByRole('alert').textContent).toContain('Network down');
	});
});
