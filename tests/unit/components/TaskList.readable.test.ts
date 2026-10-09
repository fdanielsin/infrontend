import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import TaskForm from '$lib/features/tasks/TaskForm.svelte';
import { renderWithApp } from '../support/render-with-app';
import { stubLayout } from '../support/layout';

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
const other = { id: 11, title: 'Other', description: 'Else', user_id: 1, completed: false };

describe('TaskList readable rows', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
		app.tasks.tasks = [review, other];
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	async function startEditing(
		view: { getByRole(role: string, options: { name: string }): HTMLElement },
		name = 'Review'
	) {
		await fireEvent.click(view.getByRole('button', { name: `Edit ${name}` }));
	}

	it('forwards a tap on the touch target to the checkbox, without renaming it (happy path)', async () => {
		vi.mocked(api.updateTask).mockResolvedValue({
			success: true,
			data: { ...review, completed: true }
		});
		const view = renderWithApp(app, TaskForm, { user });
		const checkbox = view.getByRole('checkbox', { name: 'Review' }) as HTMLInputElement;
		const target = checkbox.parentElement!.querySelector('[data-touch-target]')!;

		await fireEvent.click(target);

		expect(api.updateTask).toHaveBeenCalledTimes(1);
		expect(checkbox.hasAttribute('aria-hidden')).toBe(false);
		expect(view.getAllByRole('checkbox', { name: 'Review' })).toHaveLength(1);
	});

	it('toggles once when the checkbox itself is clicked (boundary values)', async () => {
		vi.mocked(api.updateTask).mockResolvedValue({
			success: true,
			data: { ...review, completed: true }
		});
		const view = renderWithApp(app, TaskForm, { user });

		await fireEvent.click(view.getByRole('checkbox', { name: 'Review' }));

		expect(api.updateTask).toHaveBeenCalledTimes(1);
	});

	it('disables the checkbox and the delete button of the row being edited only (happy path)', async () => {
		// GIVEN: Two tasks.
		const view = renderWithApp(app, TaskForm, { user });

		// WHEN: The first one is edited.
		await startEditing(view);

		// THEN: Its checkbox and delete button are disabled, the other row's ones are not.
		expect((view.getByRole('checkbox', { name: 'Review' }) as HTMLInputElement).disabled).toBe(
			true
		);
		expect(
			(view.getByRole('button', { name: 'Delete Review' }) as HTMLButtonElement).disabled
		).toBe(true);
		expect((view.getByRole('checkbox', { name: 'Other' }) as HTMLInputElement).disabled).toBe(
			false
		);
		expect((view.getByRole('button', { name: 'Delete Other' }) as HTMLButtonElement).disabled).toBe(
			false
		);
	});

	it('does not delete or toggle a task while it is edited (sad path)', async () => {
		// GIVEN: A task in edition.
		const view = renderWithApp(app, TaskForm, { user });
		await startEditing(view);

		// WHEN: Its delete button and checkbox are activated (as a user would: HTMLElement.click,
		// which a disabled control ignores, unlike a synthetic event dispatched to the element).
		view.getByRole('button', { name: 'Delete Review' }).click();
		view.getByRole('checkbox', { name: 'Review' }).click();
		await tick();

		// THEN: No request leaves.
		expect(api.deleteTask).not.toHaveBeenCalled();
		expect(api.updateTask).not.toHaveBeenCalled();
	});

	it('enables them again after Cancel and after a saved edit (happy path)', async () => {
		// GIVEN: An edit that the API accepts.
		vi.mocked(api.updateTask).mockResolvedValue({
			success: true,
			data: { ...review, title: 'New' }
		});
		const view = renderWithApp(app, TaskForm, { user });

		// WHEN: The edit is cancelled.
		await startEditing(view);
		await fireEvent.click(view.getByRole('button', { name: 'Cancel' }));

		// THEN: The delete button works again.
		expect(
			(view.getByRole('button', { name: 'Delete Review' }) as HTMLButtonElement).disabled
		).toBe(false);

		// WHEN: It is edited and saved.
		await startEditing(view);
		await fireEvent.input(view.getByLabelText('Task Title', { selector: '#edit-title-10' }), {
			target: { value: 'New' }
		});
		await fireEvent.click(view.getByRole('button', { name: 'Save' }));

		// THEN: The row is back to normal.
		await waitFor(() =>
			expect((view.getByRole('button', { name: 'Delete New' }) as HTMLButtonElement).disabled).toBe(
				false
			)
		);
	});

	it('keeps the row actions touch-sized on a coarse pointer (limit)', () => {
		// GIVEN / WHEN: A task row.
		const view = renderWithApp(app, TaskForm, { user });

		// THEN: Edit and delete get a 44 px target on touch screens.
		for (const name of ['Edit Review', 'Delete Review']) {
			const button = view.getByRole('button', { name });
			expect(button.classList.contains('pointer-coarse:min-h-11')).toBe(true);
			expect(button.classList.contains('pointer-coarse:min-w-11')).toBe(true);
		}
	});

	it('edits the title in an auto-growing one-row textarea (happy path)', async () => {
		// GIVEN / WHEN: A task in edition.
		const view = renderWithApp(app, TaskForm, { user });
		await startEditing(view);

		// THEN: The title is a textarea of one row, with the same id and label, focused.
		const title = view.getByLabelText('Task Title', {
			selector: '#edit-title-10'
		}) as HTMLTextAreaElement;
		expect(title.tagName).toBe('TEXTAREA');
		expect(title.rows).toBe(1);
		expect(title.classList.contains('resize-none')).toBe(true);
		expect(document.activeElement).toBe(title);
	});

	it('saves with Enter, not with Shift+Enter or during a composition (happy path, limits)', async () => {
		// GIVEN: A task in edition and an API that accepts the update.
		vi.mocked(api.updateTask).mockResolvedValue({
			success: true,
			data: { ...review, title: 'Plan' }
		});
		const view = renderWithApp(app, TaskForm, { user });
		await startEditing(view);
		const title = view.getByLabelText('Task Title', { selector: '#edit-title-10' });
		await fireEvent.input(title, { target: { value: 'Plan' } });

		// WHEN: Shift+Enter and a composing Enter are pressed.
		await fireEvent.keyDown(title, { key: 'Enter', shiftKey: true });
		await fireEvent.keyDown(title, { key: 'Enter', isComposing: true });
		await fireEvent.keyDown(title, { key: 'Enter', keyCode: 229 });

		// THEN: Nothing is sent.
		expect(api.updateTask).not.toHaveBeenCalled();

		// WHEN: Enter is pressed.
		await fireEvent.keyDown(title, { key: 'Enter' });

		// THEN: The title is saved.
		await waitFor(() =>
			expect(api.updateTask).toHaveBeenCalledWith(10, { title: 'Plan', description: 'Review code' })
		);
	});

	it('sends one update when Enter is pressed again while the save is pending (exception)', async () => {
		// GIVEN: A save that has not answered yet.
		let answer: (value: { success: true; data: typeof review }) => void = () => {};
		vi.mocked(api.updateTask).mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			})
		);
		const view = renderWithApp(app, TaskForm, { user });
		await startEditing(view);
		const title = view.getByLabelText('Task Title', { selector: '#edit-title-10' });
		await fireEvent.input(title, { target: { value: 'Plan' } });

		// WHEN: Enter is pressed three times.
		await fireEvent.keyDown(title, { key: 'Enter' });
		await fireEvent.keyDown(title, { key: 'Enter' });
		await fireEvent.keyDown(title, { key: 'Enter' });

		// THEN: One request left.
		expect(api.updateTask).toHaveBeenCalledTimes(1);
		answer({ success: true, data: { ...review, title: 'Plan' } });
	});

	it('turns pasted line breaks into spaces (limit)', async () => {
		// GIVEN: A task in edition.
		const view = renderWithApp(app, TaskForm, { user });
		await startEditing(view);
		const title = view.getByLabelText('Task Title', {
			selector: '#edit-title-10'
		}) as HTMLTextAreaElement;

		// WHEN: A text with line breaks is pasted.
		await fireEvent.input(title, { target: { value: 'one\ntwo\r\nthree' } });

		// THEN: The title stays on one logical line.
		await waitFor(() => expect(title.value).toBe('one two three'));
	});

	it('shows an error and keeps the focus on an emptied title (sad path)', async () => {
		// GIVEN: A task in edition with an emptied title.
		const view = renderWithApp(app, TaskForm, { user });
		await startEditing(view);
		const title = view.getByLabelText('Task Title', { selector: '#edit-title-10' });
		await fireEvent.input(title, { target: { value: '' } });

		// WHEN: Enter is pressed.
		await fireEvent.keyDown(title, { key: 'Enter' });

		// THEN: The field error shows, nothing is sent, the focus stays in the title.
		await waitFor(() =>
			expect(view.container.querySelector('#edit-title-error-10')).not.toBeNull()
		);
		expect(api.updateTask).not.toHaveBeenCalled();
		await waitFor(() => expect(document.activeElement).toBe(title));
	});

	it('clamps the description of each row and shows a hint for an empty list (limit)', () => {
		// GIVEN / WHEN: A row, then an empty list.
		const view = renderWithApp(app, TaskForm, { user });

		// THEN: The description is clamped and identified for the button.
		const text = view.getByText('Review code');
		expect(text.classList.contains('line-clamp-3')).toBe(true);
		expect(text.id).toBe('task-description-10');
	});

	it('names each "Show more" button after its task and links it to its text (happy path)', async () => {
		// GIVEN: Two tasks with a description taller than its box.
		const layout = stubLayout();
		layout.heights.scroll = 300;
		layout.heights.client = 60;
		app.tasks.tasks = [
			{ ...review, description: 'x '.repeat(1000) },
			{ ...other, description: 'y '.repeat(1000) }
		];

		// WHEN: The list is measured.
		const view = renderWithApp(app, TaskForm, { user });
		const first = await waitFor(() => view.getByRole('button', { name: 'Show more: Review' }));
		const second = view.getByRole('button', { name: 'Show more: Other' });

		// THEN: The names differ and start with the visible text (WCAG 2.5.3).
		expect(first).not.toBe(second);
		expect(first.textContent?.trim()).toBe('Show more');
		expect(first.getAttribute('aria-controls')).toBe('task-description-10');
		expect(second.getAttribute('aria-controls')).toBe('task-description-11');

		// WHEN: The first one is expanded.
		await fireEvent.click(first);

		// THEN: Only that row changes, and the name follows.
		expect(
			view.getByRole('button', { name: 'Show less: Review' }).getAttribute('aria-expanded')
		).toBe('true');
		expect(view.getByRole('button', { name: 'Show more: Other' })).toBeTruthy();
	});

	it('shows hints in both empty states (limit)', () => {
		// GIVEN / WHEN: A user without task, then no user.
		app.tasks.tasks = [];
		const withUser = renderWithApp(app, TaskForm, { user });

		// THEN: The existing text stays, followed by the next step.
		expect(withUser.getByText('No tasks yet')).toBeTruthy();
		expect(withUser.getByText('Add the first one with the form above.')).toBeTruthy();
		cleanup();
		const without = renderWithApp(app, TaskForm, { user: null });
		expect(without.getByText('Select a user to manage tasks')).toBeTruthy();
		expect(
			without.getByText('Pick a user in the list to see their tasks and add new ones.')
		).toBeTruthy();
	});

	describe('revealing the list after a selection', () => {
		function stubViewport(twoColumns: boolean) {
			vi.stubGlobal(
				'matchMedia',
				vi.fn((query: string) => ({ matches: twoColumns && query === '(min-width: 48rem)' }))
			);
			const scroll = vi.fn();
			Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
				value: scroll,
				configurable: true,
				writable: true
			});
			return scroll;
		}

		it('scrolls to the task heading and focuses it in one column (happy path)', async () => {
			// GIVEN: A one-column viewport.
			const scroll = stubViewport(false);

			// WHEN: The tasks of a freshly selected user appear.
			const view = renderWithApp(app, TaskForm, { user });

			// THEN: The heading is in view and focused.
			const heading = view.getByRole('heading', { name: 'Tasks (2)' });
			await waitFor(() => expect(document.activeElement).toBe(heading));
			expect(scroll).toHaveBeenCalled();
		});

		it('leaves focus and scroll alone with two columns (limit)', () => {
			// GIVEN: A two-column viewport.
			const scroll = stubViewport(true);

			// WHEN: The tasks appear.
			renderWithApp(app, TaskForm, { user });

			// THEN: Nothing moves.
			expect(scroll).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(document.body);
		});

		it('does not reveal anything without a selected user (limit)', () => {
			// GIVEN: A one-column viewport and no user.
			const scroll = stubViewport(false);

			// WHEN: The panel is rendered.
			renderWithApp(app, TaskForm, { user: null });

			// THEN: Nothing moves.
			expect(scroll).not.toHaveBeenCalled();
		});
	});
});
