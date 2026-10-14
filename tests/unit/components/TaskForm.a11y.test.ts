import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import TaskForm from '$lib/features/tasks/TaskForm.svelte';
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
const review = {
	id: 10,
	title: 'Review',
	description: 'Review code',
	user_id: 1,
	completed: false
};
const reviewTwo = {
	id: 11,
	title: 'Review 2',
	description: 'Second pass',
	user_id: 1,
	completed: true
};
const gone = {
	success: false as const,
	error: 'Task not found',
	status: 404,
	code: 'TASK_NOT_FOUND'
};

interface View {
	getAllByLabelText(text: string): HTMLElement[];
	getByRole(role: string, options: { name: string }): HTMLElement;
}
function itemAt<T>(items: T[], index: number): T {
	const item = items[index];
	if (item === undefined) throw new Error(`No item at index ${index}`);
	return item;
}

function editTitleInput(view: View) {
	return itemAt(view.getAllByLabelText('Task Title'), 1) as HTMLInputElement;
}

async function openEdit(view: View, title: string) {
	await fireEvent.click(view.getByRole('button', { name: `Edit ${title}` }));
	await tick();
}

async function pressEscape(target: Element) {
	await fireEvent.keyDown(target, { key: 'Escape' });
	await tick();
}

async function settle() {
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await tick();
}

describe('TaskForm accessibility', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
		app.tasks.tasks = [review, reviewTwo];
	});

	afterEach(() => {
		// A deletion waits 6 s behind its Undo toast: closing the toast as undone sends nothing, so a
		// slow run cannot send it after the next test reset the mocks.
		for (const toast of app.notifications.items) app.notifications.remove(toast.id, 'action');
		cleanup();
	});

	describe('task checkbox name', () => {
		it('names each checkbox by its exact visible title, whatever its state (happy path)', () => {
			// GIVEN / WHEN: An open task and a completed task whose title starts the same way.
			const view = renderWithApp(app, TaskForm, { user });

			// THEN: Each checkbox is found by its own title only, with its real state.
			expect((view.getByRole('checkbox', { name: 'Review' }) as HTMLInputElement).checked).toBe(
				false
			);
			expect((view.getByRole('checkbox', { name: 'Review 2' }) as HTMLInputElement).checked).toBe(
				true
			);
			expect(view.queryByRole('checkbox', { name: /mark/i })).toBeNull();
		});

		it('keeps the same name once the task is checked (happy path)', async () => {
			// GIVEN: An open task and an API that accepts the toggle.
			vi.mocked(api.updateTask).mockResolvedValue({
				success: true,
				data: { ...review, completed: true }
			});
			const view = renderWithApp(app, TaskForm, { user });

			// WHEN: The task is checked.
			await fireEvent.click(view.getByRole('checkbox', { name: 'Review' }));
			await settle();

			// THEN: The checkbox keeps its name and is checked.
			expect((view.getByRole('checkbox', { name: 'Review' }) as HTMLInputElement).checked).toBe(
				true
			);
		});

		it('keeps the title as name while the task is edited (limit)', async () => {
			// GIVEN: A rendered list.
			const view = renderWithApp(app, TaskForm, { user });

			// WHEN: The first task is being edited (its visible label is replaced by the form).
			await openEdit(view, 'Review');

			// THEN: Its checkbox is still named by the title.
			expect(view.getByRole('checkbox', { name: 'Review' })).toBeTruthy();
		});

		it('uses a title with markup or Unicode as is (limit)', () => {
			// GIVEN / WHEN: A title with markup and Unicode.
			const title = '<b>Révision</b> 🚀 « 東京 »';
			app.tasks.tasks = [{ ...review, title }];
			const view = renderWithApp(app, TaskForm, { user });

			// THEN: The checkbox is named by that exact text.
			expect(view.getByRole('checkbox', { name: title })).toBeTruthy();
		});
	});

	describe('focus while editing', () => {
		it('moves the focus to the title field when an edit opens (happy path)', async () => {
			// GIVEN: A rendered list.
			const view = renderWithApp(app, TaskForm, { user });

			// WHEN: Edit is pressed.
			await openEdit(view, 'Review');

			// THEN: The focus is in the edit title field.
			expect(document.activeElement).toBe(editTitleInput(view));
			expect(editTitleInput(view).value).toBe('Review');
		});

		it('gives the focus back to the Edit button after a successful save (happy path)', async () => {
			// GIVEN: An edit in progress and an API that accepts it.
			vi.mocked(api.updateTask).mockResolvedValue({
				success: true,
				data: { ...review, title: 'Reviewed' }
			});
			const view = renderWithApp(app, TaskForm, { user });
			await openEdit(view, 'Review');
			await fireEvent.input(editTitleInput(view), { target: { value: 'Reviewed' } });

			// WHEN: The edit is saved.
			await fireEvent.click(view.getByRole('button', { name: 'Save' }));
			await settle();

			// THEN: The focus is on the Edit button of the edited task.
			expect(document.activeElement).toBe(view.getByRole('button', { name: 'Edit Reviewed' }));
		});

		it('gives the focus back to the Edit button after Cancel (happy path)', async () => {
			// GIVEN: An edit in progress.
			const view = renderWithApp(app, TaskForm, { user });
			await openEdit(view, 'Review');

			// WHEN: Cancel is pressed.
			await fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
			await tick();

			// THEN: The edit is closed and the focus is on its Edit button.
			expect(view.queryByRole('button', { name: 'Save' })).toBeNull();
			expect(document.activeElement).toBe(view.getByRole('button', { name: 'Edit Review' }));
		});

		it('cancels the edit with Escape, without calling the API (happy path)', async () => {
			// GIVEN: An edit in progress with a draft.
			const view = renderWithApp(app, TaskForm, { user });
			await openEdit(view, 'Review');
			await fireEvent.input(editTitleInput(view), { target: { value: 'Draft' } });

			// WHEN: Escape is pressed in the title field.
			await pressEscape(editTitleInput(view));

			// THEN: The edit is closed, nothing is sent and the focus is on the Edit button.
			expect(view.queryByDisplayValue('Draft')).toBeNull();
			expect(api.updateTask).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(view.getByRole('button', { name: 'Edit Review' }));
		});

		it('ignores Escape pressed outside the edit form (sad path)', async () => {
			// GIVEN: An edit in progress with a draft.
			const view = renderWithApp(app, TaskForm, { user });
			await openEdit(view, 'Review');
			await fireEvent.input(editTitleInput(view), { target: { value: 'Draft' } });

			// WHEN: Escape is pressed in the add form.
			await pressEscape(itemAt(view.getAllByLabelText('Task Title'), 0));

			// THEN: The edit stays open with its draft.
			expect(editTitleInput(view).value).toBe('Draft');
		});

		it('ignores Escape when nothing is being edited (sad path)', async () => {
			// GIVEN: No edit in progress, the focus on a checkbox.
			const view = renderWithApp(app, TaskForm, { user });
			const checkbox = view.getByRole('checkbox', { name: 'Review' });
			checkbox.focus();

			// WHEN: Escape is pressed.
			await pressEscape(checkbox);

			// THEN: Nothing changes.
			expect(document.activeElement).toBe(checkbox);
			expect(view.getAllByLabelText('Task Title')).toHaveLength(1);
		});

		it('links an invalid edit to its error and focuses the title field (sad path)', async () => {
			// GIVEN: An edit in progress, the focus moved to the Save button.
			const view = renderWithApp(app, TaskForm, { user });
			await openEdit(view, 'Review');
			await fireEvent.input(editTitleInput(view), { target: { value: '' } });
			view.getByRole('button', { name: 'Save' }).focus();

			// WHEN: The empty title is saved.
			await fireEvent.click(view.getByRole('button', { name: 'Save' }));
			await tick();

			// THEN: The field is invalid, described by its error, and focused.
			const field = editTitleInput(view);
			expect(field.getAttribute('aria-invalid')).toBe('true');
			expect(field.getAttribute('aria-describedby')).toBe('edit-title-error-10');
			expect(document.getElementById('edit-title-error-10')?.textContent?.trim()).toBe(
				'Title is required'
			);
			expect(document.activeElement).toBe(field);
			expect(api.updateTask).not.toHaveBeenCalled();
		});

		it('keeps the edit open and the focus in place when the server refuses it (sad path)', async () => {
			// GIVEN: An edit in progress and an API that refuses it.
			vi.mocked(api.updateTask).mockResolvedValue({
				success: false,
				error: 'Title too long',
				status: 400
			});
			const view = renderWithApp(app, TaskForm, { user });
			await openEdit(view, 'Review');
			const save = view.getByRole('button', { name: 'Save' });
			save.focus();

			// WHEN: The edit is saved.
			await fireEvent.click(save);
			await settle();

			// THEN: The edit stays open and the focus stays on Save.
			expect(view.getByRole('button', { name: 'Save' })).toBe(save);
			expect(document.activeElement).toBe(save);
		});

		it('still cancels with Escape after switching to the edit of a task higher in the list (limit)', async () => {
			// GIVEN: The second task is edited, then the first one.
			const view = renderWithApp(app, TaskForm, { user });
			await openEdit(view, 'Review 2');
			await openEdit(view, 'Review');
			expect(editTitleInput(view).value).toBe('Review');

			// WHEN: Escape is pressed in the open edit.
			await pressEscape(editTitleInput(view));

			// THEN: The edit closes.
			expect(view.queryByRole('button', { name: 'Save' })).toBeNull();
			expect(document.activeElement).toBe(view.getByRole('button', { name: 'Edit Review' }));
		});

		it('still cancels with Escape after switching to the edit of a task lower in the list (limit)', async () => {
			// GIVEN: The first task is edited, then the second one.
			const view = renderWithApp(app, TaskForm, { user });
			await openEdit(view, 'Review');
			await openEdit(view, 'Review 2');
			expect(editTitleInput(view).value).toBe('Review 2');

			// WHEN: Escape is pressed in the open edit.
			await pressEscape(editTitleInput(view));

			// THEN: The edit closes.
			expect(view.queryByRole('button', { name: 'Save' })).toBeNull();
			expect(document.activeElement).toBe(view.getByRole('button', { name: 'Edit Review 2' }));
		});

		it('still focuses the invalid field after switching to the edit of a task higher in the list (limit)', async () => {
			// GIVEN: The second task is edited, then the first one, whose title is emptied.
			const view = renderWithApp(app, TaskForm, { user });
			await openEdit(view, 'Review 2');
			await openEdit(view, 'Review');
			await fireEvent.input(editTitleInput(view), { target: { value: '' } });
			view.getByRole('button', { name: 'Save' }).focus();

			// WHEN: The edit is saved.
			await fireEvent.click(view.getByRole('button', { name: 'Save' }));
			await tick();

			// THEN: The focus is on the invalid title field.
			expect(document.activeElement).toBe(editTitleInput(view));
		});

		it('moves the focus to the list heading when the edited task is gone on the server (limit)', async () => {
			// GIVEN: An edit in progress on a task already deleted on the server.
			vi.mocked(api.updateTask).mockResolvedValue(gone);
			const view = renderWithApp(app, TaskForm, { user });
			await openEdit(view, 'Review');

			// WHEN: The edit is saved.
			await fireEvent.click(view.getByRole('button', { name: 'Save' }));
			await settle();

			// THEN: The line is gone and the focus is on the list heading.
			expect(view.queryByRole('checkbox', { name: 'Review' })).toBeNull();
			expect(document.activeElement).toBe(view.getByRole('heading', { name: 'All done' }));
		});
	});

	describe('focus after a line disappears', () => {
		it('moves the focus to the list heading after a deletion (happy path)', async () => {
			// GIVEN: The focus on the Delete button of a task, and an API that accepts it.
			vi.mocked(api.deleteTask).mockResolvedValue({ success: true, message: 'Deleted' });
			const view = renderWithApp(app, TaskForm, { user });
			const deleteButton = view.getByRole('button', { name: 'Delete Review' });
			deleteButton.focus();

			// WHEN: The task is deleted.
			await fireEvent.click(deleteButton);
			await settle();

			// THEN: The focus is on the list heading, which says what is left.
			expect(document.activeElement).toBe(view.getByRole('heading', { name: 'All done' }));
		});

		it('moves the focus to the heading of an empty list after deleting the only task (boundary)', async () => {
			// GIVEN: A single task.
			app.tasks.tasks = [review];
			vi.mocked(api.deleteTask).mockResolvedValue({ success: true, message: 'Deleted' });
			const view = renderWithApp(app, TaskForm, { user });
			const deleteButton = view.getByRole('button', { name: 'Delete Review' });
			deleteButton.focus();

			// WHEN: It is deleted.
			await fireEvent.click(deleteButton);
			await settle();

			// THEN: The focus is on the plain "Tasks" title.
			expect(document.activeElement).toBe(view.getByRole('heading', { name: 'Tasks' }));
			expect(view.getByText('No tasks yet')).toBeTruthy();
		});

		it.each([
			[
				'the server refuses the deletion (sad path)',
				() =>
					vi.mocked(api.deleteTask).mockResolvedValue({
						success: false,
						error: 'Server error',
						status: 500
					}),
				"We couldn't delete the task."
			],
			[
				'the deletion request throws (exception)',
				() => vi.mocked(api.deleteTask).mockRejectedValue(new Error('Network down')),
				"We couldn't delete the task."
			]
		] as const)(
			'keeps the focus on the list heading when %s, and shows the row again',
			async (_case, arrange, message) => {
				// GIVEN: An API that fails, and the focus on the Delete button.
				arrange();
				const view = renderWithApp(app, TaskForm, { user });
				const deleteButton = view.getByRole('button', { name: 'Delete Review' });
				deleteButton.focus();

				// WHEN: Delete is pressed and the Undo time runs out.
				await fireEvent.click(deleteButton);
				await settle();
				const heading = view.getByRole('heading', { name: 'All done' });
				await app.tasks.commitPending();
				await settle();

				// THEN: The row is back, the error is notified and the focus has not been pulled away.
				expect(view.getByRole('checkbox', { name: 'Review' })).toBeTruthy();
				expect(app.notifications.items).toEqual([
					expect.objectContaining({ message, type: 'error' })
				]);
				expect(document.activeElement).toBe(heading);
			}
		);

		it('puts the focus on the checkbox of the task when the deletion is undone (happy path)', async () => {
			// GIVEN: A deleted task, focus on the list heading.
			const view = renderWithApp(app, TaskForm, { user });
			const deleteButton = view.getByRole('button', { name: 'Delete Review' });
			deleteButton.focus();
			await fireEvent.click(deleteButton);
			await settle();
			expect(view.queryByRole('checkbox', { name: 'Review' })).toBeNull();

			// WHEN: Undo is pressed in the toast.
			app.notifications.runAction(app.notifications.items[0]!.id);

			// THEN: The row is back first in the list, focused, and nothing was sent.
			const checkbox = view.getByRole('checkbox', { name: 'Review' });
			expect(document.activeElement).toBe(checkbox);
			expect(api.deleteTask).not.toHaveBeenCalled();
		});

		it('moves the focus to the list heading when a checked task turns out to be gone (limit)', async () => {
			// GIVEN: The focus on the checkbox of a task already deleted on the server.
			vi.mocked(api.updateTask).mockResolvedValue(gone);
			const view = renderWithApp(app, TaskForm, { user });
			const checkbox = view.getByRole('checkbox', { name: 'Review' });
			checkbox.focus();

			// WHEN: The checkbox is clicked and its line disappears.
			await fireEvent.click(checkbox);
			await waitFor(() => expect(view.queryByRole('checkbox', { name: 'Review' })).toBeNull());
			await settle();

			// THEN: The focus is on the list heading, never on the body.
			expect(document.activeElement).toBe(view.getByRole('heading', { name: 'All done' }));
		});
	});

	describe('add form validation', () => {
		it('links an empty title to its error and focuses it (sad path)', async () => {
			// GIVEN: The focus on the Add Task button and an empty title.
			const view = renderWithApp(app, TaskForm, { user });
			const add = view.getByRole('button', { name: 'Add Task' });
			add.focus();

			// WHEN: The form is submitted.
			await fireEvent.submit(add.closest('form') as HTMLFormElement);
			await tick();

			// THEN: The title is invalid, described by its error, and focused.
			const title = itemAt(view.getAllByLabelText('Task Title'), 0);
			expect(title.getAttribute('aria-invalid')).toBe('true');
			expect(title.getAttribute('aria-describedby')).toBe('title-error');
			expect(document.getElementById('title-error')?.textContent?.trim()).toBe('Title is required');
			expect(document.activeElement).toBe(title);
			expect(api.createTask).not.toHaveBeenCalled();
		});

		it('leaves the fields unmarked and the focus in place when the title is valid (boundary)', async () => {
			// GIVEN: A 1-character title and an API that accepts it.
			vi.mocked(api.createTask).mockResolvedValue({
				success: true,
				data: { ...review, id: 12, title: 'R', description: '' }
			});
			const view = renderWithApp(app, TaskForm, { user });
			const title = itemAt(view.getAllByLabelText('Task Title'), 0);
			await fireEvent.input(title, { target: { value: 'R' } });
			const add = view.getByRole('button', { name: 'Add Task' });
			add.focus();

			// WHEN: The form is submitted.
			await fireEvent.submit(add.closest('form') as HTMLFormElement);
			await settle();

			// THEN: No field is marked invalid and the focus does not jump to the title.
			expect(title.getAttribute('aria-invalid')).toBe('false');
			expect(title.hasAttribute('aria-describedby')).toBe(false);
			expect(document.activeElement).not.toBe(title);
		});
	});
});
