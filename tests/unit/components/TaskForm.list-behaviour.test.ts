import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/svelte';
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
const make = (id: number, title: string) => ({
	id,
	title,
	description: `About ${title}`,
	user_id: 1,
	completed: false
});

// Behaviours of the task list and of its edit form that no other test pinned down: the edit closes
// on Escape only, an edit starts clean, rows follow their task, Save waits for a pending request,
// the first invalid field gets the focus once its error is shown.
describe('TaskForm list and edit behaviour', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
		app.tasks.tasks = [review];
	});

	afterEach(() => {
		cleanup();
	});

	it.each(['a', 'Tab', 'ArrowDown', ' ', 'Backspace', 'Esc', 'Escape '])(
		'keeps the edit open with its draft when "%s" is pressed in the title field (boundary)',
		async (key) => {
			// GIVEN: An edit in progress with a draft.
			const view = renderWithApp(app, TaskForm, { user });
			await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
			await tick();
			const field = view.getAllByLabelText('Task Title')[1] as HTMLInputElement;
			await fireEvent.input(field, { target: { value: 'Draft' } });

			// WHEN: A key other than Escape is pressed in the field.
			await fireEvent.keyDown(field, { key });
			await tick();

			// THEN: The edit is still open with its draft, and nothing was sent.
			expect((view.getAllByLabelText('Task Title')[1] as HTMLInputElement).value).toBe('Draft');
			expect(api.updateTask).not.toHaveBeenCalled();
		}
	);

	it('keeps the edit open when a key is pressed in the description field (boundary)', async () => {
		// GIVEN: An edit in progress.
		const view = renderWithApp(app, TaskForm, { user });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		await tick();
		const description = view.getAllByLabelText('Description (optional)')[1] as HTMLTextAreaElement;

		// WHEN: A character is typed there.
		await fireEvent.keyDown(description, { key: 'x' });
		await tick();

		// THEN: The edit is still open.
		expect(view.getAllByLabelText('Description (optional)')).toHaveLength(2);
	});

	it('does not carry the errors of an edit over to the edit opened next (sad path)', async () => {
		// GIVEN: An invalid edit of a first task, its error shown.
		app.tasks.tasks = [review, reviewTwo];
		const view = renderWithApp(app, TaskForm, { user });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		await tick();
		const first = view.getAllByLabelText('Task Title')[1] as HTMLInputElement;
		await fireEvent.input(first, { target: { value: '' } });
		await fireEvent.submit(first.closest('form')!);
		await tick();
		expect(first.getAttribute('aria-invalid')).toBe('true');

		// WHEN: The edit of the other task is opened without closing the first one.
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review 2' }));
		await tick();

		// THEN: The new edit starts clean: its draft is the task, with no error.
		const second = view.getAllByLabelText('Task Title')[1] as HTMLInputElement;
		expect(second.id).toBe('edit-title-11');
		expect(second.value).toBe('Review 2');
		expect(second.getAttribute('aria-invalid')).toBe('false');
		expect(second.hasAttribute('aria-describedby')).toBe(false);
	});

	it('keeps the element of a task when the order moves its row (limit)', async () => {
		// GIVEN: Three tasks in creation order.
		app.tasks.tasks = [make(1, 'Banana'), make(2, 'apple'), make(3, 'Cherry')];
		const view = renderWithApp(app, TaskForm, { user });
		const checkbox = (id: number) => view.container.querySelector(`#task-${id}`);
		const before = [1, 2, 3].map(checkbox);

		// WHEN: The order changes, which moves the rows.
		app.taskOrder.set('title');
		await tick();

		// THEN: Each task still has its own element (a row follows its task: the focus and the
		// state held by a row would otherwise land on another task).
		expect(view.getAllByRole('checkbox').map((box) => box.id)).toEqual([
			'task-2',
			'task-1',
			'task-3'
		]);
		expect([1, 2, 3].map(checkbox)).toEqual(before);
		[1, 2, 3].forEach((id, index) => expect(checkbox(id)).toBe(before[index]));
	});

	it('keeps Save enabled while the list loads, and busy only for its own request (exception)', async () => {
		// GIVEN: An edit in progress.
		const view = renderWithApp(app, TaskForm, { user });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		await tick();
		const save = view.getByRole('button', { name: 'Save' }) as HTMLButtonElement;

		// WHEN: Another request of the domain is pending.
		app.tasks.status.loading = true;
		await tick();

		// THEN: Save is neither disabled nor busy (see SubmitButtons.test.ts for its own request).
		expect(save.disabled).toBe(false);
		expect(save.getAttribute('aria-busy')).toBeNull();
	});

	it('focuses the description of an edit when only the description is invalid (sad path)', async () => {
		// GIVEN: An edit in progress whose title is valid and whose description is over 2000 characters.
		const view = renderWithApp(app, TaskForm, { user });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		await tick();
		const description = view.getAllByLabelText('Description (optional)')[1] as HTMLTextAreaElement;
		await fireEvent.input(description, { target: { value: 'D'.repeat(2001) } });

		// WHEN: The edit is saved.
		await fireEvent.submit(description.closest('form')!);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await tick();

		// THEN: Nothing is sent, the description is marked invalid and has the focus.
		expect(api.updateTask).not.toHaveBeenCalled();
		expect(description.getAttribute('aria-invalid')).toBe('true');
		expect(document.activeElement).toBe(description);
		expect(
			(view.getAllByLabelText('Task Title')[1] as HTMLInputElement).getAttribute('aria-invalid')
		).toBe('false');
	});

	it('focuses the title first when the title and the description are both invalid (boundary)', async () => {
		// GIVEN: The add form with an empty title and a description over 2000 characters.
		const view = renderWithApp(app, TaskForm, { user });
		const title = view.container.querySelector('#title') as HTMLInputElement;
		const description = view.container.querySelector('#description') as HTMLTextAreaElement;
		await fireEvent.input(description, { target: { value: 'D'.repeat(2001) } });

		// WHEN: The form is submitted.
		await fireEvent.submit(title.closest('form')!);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await tick();

		// THEN: Both fields are marked invalid and the first one in the page has the focus.
		expect(title.getAttribute('aria-invalid')).toBe('true');
		expect(description.getAttribute('aria-invalid')).toBe('true');
		expect(document.activeElement).toBe(title);
	});

	it('focuses the title first when both fields of an edit are invalid (boundary)', async () => {
		// GIVEN: An edit with an empty title and a description over 2000 characters.
		const view = renderWithApp(app, TaskForm, { user });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		await tick();
		const title = view.getAllByLabelText('Task Title')[1] as HTMLInputElement;
		const description = view.getAllByLabelText('Description (optional)')[1] as HTMLTextAreaElement;
		await fireEvent.input(title, { target: { value: '' } });
		await fireEvent.input(description, { target: { value: 'D'.repeat(2001) } });

		// WHEN: The edit is saved.
		await fireEvent.submit(title.closest('form')!);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await tick();

		// THEN: The title has the focus.
		expect(document.activeElement).toBe(title);
	});

	it('shows the error before the field receives the focus, so that it is read with it (limit)', async () => {
		// GIVEN: The add form, with a listener that notes the state of the field when it is focused.
		const view = renderWithApp(app, TaskForm, { user });
		const title = view.container.querySelector('#title') as HTMLInputElement;
		let invalidWhenFocused: string | null = 'never focused';
		let describedWhenFocused: string | null = 'never focused';
		title.addEventListener('focus', () => {
			invalidWhenFocused = title.getAttribute('aria-invalid');
			describedWhenFocused = title.getAttribute('aria-describedby');
		});

		// WHEN: An empty title is submitted.
		await fireEvent.submit(title.closest('form')!);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await tick();

		// THEN: At the moment of the focus the field is already invalid and linked to its error.
		expect(invalidWhenFocused).toBe('true');
		expect(describedWhenFocused).toBe('title-error');
	});

	it('validates the edit fields when they are left, and leaves the edit open (happy path)', async () => {
		// GIVEN: An edit in progress.
		const view = renderWithApp(app, TaskForm, { user });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		await tick();
		const title = view.getAllByLabelText('Task Title')[1] as HTMLElement;
		const description = view.getAllByLabelText('Description (optional)')[1] as HTMLTextAreaElement;

		// WHEN: The title is emptied and left, the description changed and left.
		await fireEvent.input(title, { target: { value: '' } });
		await fireEvent.blur(title);
		await fireEvent.input(description, { target: { value: 'Other' } });
		await fireEvent.blur(description);

		// THEN: The title shows its error, the description its success; nothing was saved or closed.
		expect(title.getAttribute('aria-invalid')).toBe('true');
		expect(description.parentElement?.querySelector('svg[data-icon="check"]')).not.toBeNull();
		expect(api.updateTask).not.toHaveBeenCalled();
		expect(view.getByRole('button', { name: 'Save' })).toBeTruthy();
	});
});
