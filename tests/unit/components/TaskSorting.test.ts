import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { api, type Task } from '$lib/api/client';
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
const make = (id: number, title: string, completed = false): Task => ({
	id,
	title,
	description: `About ${title}`,
	user_id: 1,
	completed
});
// Creation order: Banana, apple, Cherry.
const THREE = [make(1, 'Banana'), make(2, 'apple'), make(3, 'Cherry')];

function memoryStorage(initial: Record<string, string> = {}): Storage {
	const data = new Map(Object.entries(initial));
	return {
		get length() {
			return data.size;
		},
		clear: () => data.clear(),
		getItem: (key) => data.get(key) ?? null,
		key: (index) => [...data.keys()][index] ?? null,
		removeItem: (key) => void data.delete(key),
		setItem: (key, value) => void data.set(key, String(value))
	};
}

describe('task sorting in the list', () => {
	let app: AppState;
	let storage: Storage;

	const render = () => renderWithApp(app, TaskForm, { user });
	const titlesShown = (view: ReturnType<typeof render>) =>
		view.getAllByRole('checkbox').map((box) => box.id);
	const messages = () => app.notifications.items.map((item) => item.message);
	// What the hidden live region says: low-severity news is announced, never shown as a toast.
	const announced = () => app.notifications.announcement?.message ?? null;
	const choose = (view: ReturnType<typeof render>, value: string) =>
		fireEvent.change(view.getByLabelText('Sort by'), { target: { value } });

	beforeEach(() => {
		vi.resetAllMocks();
		storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		app = new AppState();
		app.tasks.tasks = THREE;
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	describe('the selector', () => {
		it('offers the three orders, labelled, creation order selected (happy path)', () => {
			const view = render();

			const select = view.getByLabelText('Sort by') as HTMLSelectElement;
			expect([...select.options].map((option) => option.text)).toEqual([
				'Creation order',
				'Title (A→Z)',
				'Status'
			]);
			expect(select.value).toBe('created');
			expect(messages()).toEqual([]);
		});

		it.each([[[]], [[make(1, 'Only')]]])(
			'is not shown for fewer than two tasks (boundary)',
			(tasks) => {
				app.tasks.tasks = tasks;

				const view = render();

				expect(view.queryByLabelText('Sort by')).toBeNull();
			}
		);

		it('is shown from two tasks (boundary)', () => {
			app.tasks.tasks = [make(1, 'a'), make(2, 'b')];

			expect(render().getByLabelText('Sort by')).toBeTruthy();
		});

		it('is not shown when no user is selected (sad path)', () => {
			const view = renderWithApp(app, TaskForm, { user: null });

			expect(view.queryByLabelText('Sort by')).toBeNull();
		});

		it('ignores a value that is not an order (sad path)', async () => {
			const view = render();

			await choose(view, 'bogus');

			expect(app.taskOrder.current).toBe('created');
			expect(storage.getItem('indrive.task-order')).toBeNull();
			expect(messages()).toEqual([]);
		});
	});

	describe('sorting', () => {
		it('sorts by title, ignoring the case, and announces it once (happy path)', async () => {
			const view = render();

			await choose(view, 'title');

			expect(titlesShown(view)).toEqual(['task-2', 'task-1', 'task-3']);
			expect(messages()).toEqual([]);
			expect(announced()).toBe('Tasks sorted by title');
			expect(storage.getItem('indrive.task-order')).toBe('title');
		});

		it('sorts by status, then back to the creation order, exactly as it was (happy path)', async () => {
			app.tasks.tasks = [make(1, 'a', true), make(2, 'b'), make(3, 'c', true), make(4, 'd')];
			const view = render();

			await choose(view, 'status');
			expect(titlesShown(view)).toEqual(['task-2', 'task-4', 'task-1', 'task-3']);
			expect(announced()).toBe('Tasks sorted by status');
			await choose(view, 'created');

			expect(titlesShown(view)).toEqual(['task-1', 'task-2', 'task-3', 'task-4']);
			expect(messages()).toEqual([]);
			expect(announced()).toBe('Tasks sorted by creation order');
		});

		it('says nothing when the choice does not change (boundary)', async () => {
			const view = render();

			await choose(view, 'created');

			expect(messages()).toEqual([]);
		});

		it('announces nothing when the choice does not change, nor for an unknown value (boundary)', async () => {
			const view = render();

			await choose(view, 'created');
			await choose(view, 'bogus');

			expect(announced()).toBeNull();
			expect(messages()).toEqual([]);
		});

		it('announces nothing when the stored order is restored at load (boundary)', () => {
			storage.setItem('indrive.task-order', 'status');
			app = new AppState();
			app.tasks.tasks = THREE;

			render();

			expect(announced()).toBeNull();
			expect(messages()).toEqual([]);
		});

		it('announces again each time the order changes back to a previous one (limit)', async () => {
			const view = render();

			await choose(view, 'title');
			const first = app.notifications.announcement;
			await choose(view, 'created');
			await choose(view, 'title');

			expect(announced()).toBe('Tasks sorted by title');
			expect(app.notifications.announcement?.id).not.toBe(first?.id);
			expect(messages()).toEqual([]);
		});

		it('does not reorder the list of the state (limit)', async () => {
			const view = render();

			await choose(view, 'title');

			expect(app.tasks.tasks.map((task) => task.id)).toEqual([1, 2, 3]);
		});

		it('starts with the order stored by a previous visit, without announcing it (happy path)', () => {
			storage.setItem('indrive.task-order', 'title');
			app = new AppState();
			app.tasks.tasks = THREE;

			const view = render();

			expect(titlesShown(view)).toEqual(['task-2', 'task-1', 'task-3']);
			expect((view.getByLabelText('Sort by') as HTMLSelectElement).value).toBe('title');
			expect(messages()).toEqual([]);
		});

		it('follows the language: "ñ" sorts after "n" in Spanish (limit)', async () => {
			app.tasks.tasks = [make(1, 'Ñu'), make(2, 'Nube'), make(3, 'Oso')];
			app.taskOrder.set('title');
			app.locale.current = 'es';

			const view = render();

			expect(titlesShown(view)).toEqual(['task-2', 'task-1', 'task-3']);
			app.locale.current = 'en';
			await waitFor(() => expect(titlesShown(view)).toEqual(['task-1', 'task-2', 'task-3']));
		});
	});

	describe('changes of the list', () => {
		beforeEach(() => app.taskOrder.set('title'));

		it('places a created task in order (happy path)', async () => {
			vi.mocked(api.createTask).mockResolvedValue({
				success: true,
				data: make(4, 'Avocado')
			});
			const view = render();

			await fireEvent.input(view.getByLabelText('Task Title'), { target: { value: 'Avocado' } });
			await fireEvent.submit(view.getByLabelText('Task Title').closest('form')!);

			await waitFor(() =>
				expect(titlesShown(view)).toEqual(['task-2', 'task-4', 'task-1', 'task-3'])
			);
		});

		it('keeps the order after a deletion (happy path)', async () => {
			vi.mocked(api.deleteTask).mockResolvedValue({ success: true, data: undefined });
			const view = render();

			await fireEvent.click(view.getByRole('button', { name: 'Delete Banana' }));

			await waitFor(() => expect(titlesShown(view)).toEqual(['task-2', 'task-3']));
		});

		it('sorts the tasks of another user (happy path)', async () => {
			const view = render();

			app.tasks.tasks = [make(7, 'zeta'), make(8, 'Alpha')];

			await waitFor(() => expect(titlesShown(view)).toEqual(['task-8', 'task-7']));
		});

		it('moves an edited row, keeps its Edit button focused and announces its position (happy path)', async () => {
			vi.mocked(api.updateTask).mockResolvedValue({
				success: true,
				data: make(2, 'zzz')
			});
			const view = render();
			await fireEvent.click(view.getByRole('button', { name: 'Edit apple' }));
			await fireEvent.input(view.getByDisplayValue('apple'), { target: { value: 'zzz' } });

			await fireEvent.submit(view.getByDisplayValue('zzz').closest('form')!);

			await waitFor(() => expect(titlesShown(view)).toEqual(['task-1', 'task-3', 'task-2']));
			await waitFor(() =>
				expect(document.activeElement).toBe(view.getByRole('button', { name: 'Edit zzz' }))
			);
			expect(messages()).toEqual([]);
			expect(announced()).toBe('zzz: position 3 of 3');
		});

		it('says nothing when an edit keeps the row in place (boundary)', async () => {
			vi.mocked(api.updateTask).mockResolvedValue({
				success: true,
				data: make(2, 'apple 2')
			});
			const view = render();
			await fireEvent.click(view.getByRole('button', { name: 'Edit apple' }));
			await fireEvent.input(view.getByDisplayValue('apple'), { target: { value: 'apple 2' } });

			await fireEvent.submit(view.getByDisplayValue('apple 2').closest('form')!);

			await waitFor(() => expect(view.getByText('apple 2')).toBeTruthy());
			expect(messages()).toEqual([]);
		});
	});

	describe('toggling under the status order', () => {
		beforeEach(() => app.taskOrder.set('status'));

		it('moves the row, keeps the focus on its checkbox and announces the position (happy path)', async () => {
			vi.mocked(api.updateTask).mockResolvedValue({
				success: true,
				data: make(1, 'Banana', true)
			});
			const view = render();
			const checkbox = view.getByRole('checkbox', { name: 'Banana' }) as HTMLInputElement;
			checkbox.focus();

			await fireEvent.click(checkbox);

			await waitFor(() => expect(titlesShown(view)).toEqual(['task-2', 'task-3', 'task-1']));
			await waitFor(() => expect(document.activeElement?.id).toBe('task-1'));
			expect(messages()).toEqual([]);
			expect(announced()).toBe('Banana: position 3 of 3');
		});

		it('says nothing when the row stays where it is (boundary)', async () => {
			vi.mocked(api.updateTask).mockResolvedValue({
				success: true,
				data: make(3, 'Cherry', true)
			});
			const view = render();

			await fireEvent.click(view.getByRole('checkbox', { name: 'Cherry' }));

			await waitFor(() => expect(app.tasks.tasks[2]?.completed).toBe(true));
			expect(titlesShown(view)).toEqual(['task-1', 'task-2', 'task-3']);
			expect(messages()).toEqual([]);
		});

		it('reorders nothing and announces nothing when the update fails (exception)', async () => {
			vi.mocked(api.updateTask).mockResolvedValue({ success: false, error: 'Task locked' });
			const view = render();
			const checkbox = view.getByRole('checkbox', { name: 'Banana' }) as HTMLInputElement;

			await fireEvent.click(checkbox);

			await waitFor(() => expect(checkbox.checked).toBe(false));
			expect(titlesShown(view)).toEqual(['task-1', 'task-2', 'task-3']);
			expect(messages()).toEqual(['Task locked']);
		});
	});
});

// Banana and Cherry are to do, apple is done.
const MIXED = [make(1, 'Banana'), make(2, 'apple', true), make(3, 'Cherry')];

describe('task filter in the list', () => {
	let app: AppState;
	let storage: Storage;

	const render = () => renderWithApp(app, TaskForm, { user });
	const idsShown = (view: ReturnType<typeof render>) =>
		view.queryAllByRole('checkbox').map((box) => box.id);
	const announced = () => app.notifications.announcement?.message ?? null;
	const heading = (view: ReturnType<typeof render>) => view.getByRole('heading', { level: 3 });
	const choose = (view: ReturnType<typeof render>, value: string) =>
		fireEvent.change(view.getByLabelText('Show'), { target: { value } });

	beforeEach(() => {
		vi.resetAllMocks();
		storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
		app = new AppState();
		app.tasks.tasks = MIXED;
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	describe('the selector', () => {
		it('offers All, To do and Done, labelled, All selected, and says nothing at load (happy path)', () => {
			const view = render();

			const select = view.getByLabelText('Show') as HTMLSelectElement;
			expect([...select.options].map((option) => option.text)).toEqual(['All', 'To do', 'Done']);
			expect(select.value).toBe('all');
			expect(announced()).toBeNull();
		});

		it('is shown from one task, and not without any (boundary)', () => {
			app.tasks.tasks = [make(1, 'Only')];
			expect(render().getByLabelText('Show')).toBeTruthy();
			cleanup();

			app.tasks.tasks = [];
			expect(render().queryByLabelText('Show')).toBeNull();
		});

		it('ignores a value that is not a filter (sad path)', async () => {
			const view = render();

			await choose(view, 'bogus');

			expect(app.taskFilter.current).toBe('all');
			expect(storage.getItem('indrive.task-filter')).toBeNull();
			expect(announced()).toBeNull();
		});
	});

	describe('filtering', () => {
		it('shows the tasks to do, the done ones, then all of them again, and keeps the list of the state (happy path)', async () => {
			const view = render();
			const list = app.tasks.tasks;

			await choose(view, 'todo');
			expect(idsShown(view)).toEqual(['task-1', 'task-3']);
			await choose(view, 'done');
			expect(idsShown(view)).toEqual(['task-2']);
			await choose(view, 'all');
			expect(idsShown(view)).toEqual(['task-1', 'task-2', 'task-3']);

			expect(app.tasks.tasks).toBe(list);
		});

		it('keeps the same count in the heading under every filter (happy path)', async () => {
			const view = render();
			const headings: string[] = [];

			for (const filter of ['all', 'todo', 'done']) {
				await choose(view, filter);
				headings.push(heading(view).textContent?.trim() ?? '');
			}

			expect(headings).toEqual(['2 to do of 3', '2 to do of 3', '2 to do of 3']);
		});

		it('filters first and sorts after (happy path)', async () => {
			app.taskOrder.set('title');
			const view = render();

			await choose(view, 'todo');

			expect(idsShown(view)).toEqual(['task-1', 'task-3']);
			app.tasks.tasks = [make(1, 'Zed'), make(2, 'Alpha'), make(3, 'Mid', true)];
			await waitFor(() => expect(idsShown(view)).toEqual(['task-2', 'task-1']));
		});

		it('remembers the choice and restores it without announcing it (happy path)', () => {
			storage.setItem('indrive.task-filter', 'done');
			app = new AppState();
			app.tasks.tasks = MIXED;

			expect(idsShown(render())).toEqual(['task-2']);
			expect(announced()).toBeNull();
		});
	});

	describe('empty lists of a filter', () => {
		it('says there is nothing to do, not that there are no tasks yet (boundary)', async () => {
			app.tasks.tasks = [make(1, 'a', true), make(2, 'b', true)];
			const view = render();

			await choose(view, 'todo');

			expect(view.getByText('No tasks to do')).toBeTruthy();
			expect(view.getByText('Every task is done.')).toBeTruthy();
			expect(view.queryByText('No tasks yet')).toBeNull();
			expect(view.getByLabelText('Show')).toBeTruthy();
		});

		it('says there is nothing done (boundary)', async () => {
			const view = render();
			app.tasks.tasks = [make(1, 'a'), make(2, 'b')];

			await choose(view, 'done');

			expect(view.getByText('No completed tasks')).toBeTruthy();
			expect(view.getByText('Tick a task to see it here.')).toBeTruthy();
			expect(view.queryByText('No tasks yet')).toBeNull();
		});

		it('keeps "No tasks yet" for a user without any task, whatever the remembered filter (limit)', () => {
			app.taskFilter.set('done');
			app.tasks.tasks = [];

			const view = render();

			expect(view.getByText('No tasks yet')).toBeTruthy();
			expect(view.queryByText('No completed tasks')).toBeNull();
		});
	});

	describe('announcements', () => {
		it('announces the shown count when the choice changes, not when it stays (happy path)', async () => {
			const view = render();

			await choose(view, 'todo');
			expect(announced()).toBe('Showing tasks to do: 2');
			const first = app.notifications.announcement;
			await choose(view, 'todo');
			expect(app.notifications.announcement).toBe(first);
			await choose(view, 'done');
			expect(announced()).toBe('Showing completed tasks: 1');
			await choose(view, 'all');
			expect(announced()).toBe('Showing all tasks: 3');
		});
	});

	describe('a task that leaves the filter', () => {
		beforeEach(() => app.taskFilter.set('todo'));

		it('moves the focus to the next row and announces where the task went (happy path)', async () => {
			vi.mocked(api.updateTask).mockResolvedValue({
				success: true,
				data: make(1, 'Banana', true)
			});
			const view = render();
			const checkbox = view.getByRole('checkbox', { name: 'Banana' }) as HTMLInputElement;
			checkbox.focus();

			await fireEvent.click(checkbox);

			await waitFor(() => expect(idsShown(view)).toEqual(['task-3']));
			await waitFor(() => expect(document.activeElement?.id).toBe('task-3'));
			expect(announced()).toBe('Banana: moved to Done');
		});

		it('moves the focus to the NEXT row, not the previous one, when a middle row leaves (boundary)', async () => {
			app.tasks.tasks = [make(1, 'A'), make(2, 'B'), make(3, 'C')];
			vi.mocked(api.updateTask).mockResolvedValue({ success: true, data: make(2, 'B', true) });
			const view = render();
			const checkbox = view.getByRole('checkbox', { name: 'B' }) as HTMLInputElement;
			checkbox.focus();

			await fireEvent.click(checkbox);

			await waitFor(() => expect(idsShown(view)).toEqual(['task-1', 'task-3']));
			await waitFor(() => expect(document.activeElement?.id).toBe('task-3'));
		});

		it('moves the focus to the previous row when it was the last one (boundary)', async () => {
			vi.mocked(api.updateTask).mockResolvedValue({
				success: true,
				data: make(3, 'Cherry', true)
			});
			const view = render();
			const checkbox = view.getByRole('checkbox', { name: 'Cherry' }) as HTMLInputElement;
			checkbox.focus();

			await fireEvent.click(checkbox);

			await waitFor(() => expect(document.activeElement?.id).toBe('task-1'));
		});

		it('moves the focus to the heading when it was the only row (boundary)', async () => {
			app.tasks.tasks = [make(1, 'Banana'), make(2, 'apple', true)];
			vi.mocked(api.updateTask).mockResolvedValue({
				success: true,
				data: make(1, 'Banana', true)
			});
			const view = render();
			const checkbox = view.getByRole('checkbox', { name: 'Banana' }) as HTMLInputElement;
			checkbox.focus();

			await fireEvent.click(checkbox);

			await waitFor(() => expect(document.activeElement).toBe(heading(view)));
			expect(view.getByText('No tasks to do')).toBeTruthy();
		});

		it('keeps the row, restores the box and says nothing when the update fails (exception)', async () => {
			vi.mocked(api.updateTask).mockResolvedValue({ success: false, error: 'Task locked' });
			const view = render();
			const checkbox = view.getByRole('checkbox', { name: 'Banana' }) as HTMLInputElement;

			await fireEvent.click(checkbox);

			await waitFor(() => expect(checkbox.checked).toBe(false));
			expect(idsShown(view)).toEqual(['task-1', 'task-3']);
			expect(announced()).toBeNull();
		});
	});

	describe('changes that meet the filter', () => {
		it('keeps the row being edited when the filter would hide it, then lets it go (boundary)', async () => {
			const view = render();
			await fireEvent.click(view.getByRole('button', { name: 'Edit Banana' }));

			await choose(view, 'done');

			expect(view.getByDisplayValue('Banana')).toBeTruthy();
			expect(idsShown(view)).toEqual(['task-1', 'task-2']);
			await fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
			await waitFor(() => expect(idsShown(view)).toEqual(['task-2']));
		});

		it('counts the position among the rows shown (limit)', async () => {
			app.taskOrder.set('title');
			app.taskFilter.set('done');
			app.tasks.tasks = [make(1, 'Banana'), make(2, 'apple', true), make(3, 'Cherry', true)];
			vi.mocked(api.updateTask).mockResolvedValue({ success: true, data: make(2, 'zzz', true) });
			const view = render();
			await fireEvent.click(view.getByRole('button', { name: 'Edit apple' }));
			await fireEvent.input(view.getByDisplayValue('apple'), { target: { value: 'zzz' } });

			await fireEvent.submit(view.getByDisplayValue('zzz').closest('form')!);

			await waitFor(() => expect(announced()).toBe('zzz: position 2 of 2'));
		});

		it('puts the focus on the heading when an undone deletion is not shown by the filter (boundary)', async () => {
			const view = render();
			await fireEvent.click(view.getByRole('button', { name: 'Delete Banana' }));
			await choose(view, 'done');
			// Undo is pressed from a toast, so the focus is not on the heading when the row comes back.
			view.getByLabelText('Show').focus();
			expect(document.activeElement).not.toBe(heading(view));

			app.notifications.runAction(app.notifications.items[0]!.id);

			await waitFor(() => expect(document.activeElement).toBe(heading(view)));
			expect(idsShown(view)).toEqual(['task-2']);
			expect(announced()).toBe('Banana: shown in To do');
		});

		it('says where a created task is when the filter hides it (happy path)', async () => {
			app.taskFilter.set('done');
			vi.mocked(api.createTask).mockResolvedValue({ success: true, data: make(4, 'Avocado') });
			const view = render();

			await fireEvent.input(view.getByLabelText('Task Title'), { target: { value: 'Avocado' } });
			await fireEvent.submit(view.getByLabelText('Task Title').closest('form')!);

			await waitFor(() => expect(announced()).toBe('Avocado: shown in To do'));
			expect(idsShown(view)).toEqual(['task-2']);
		});

		it('says nothing when a created task is shown (boundary)', async () => {
			vi.mocked(api.createTask).mockResolvedValue({ success: true, data: make(4, 'Avocado') });
			const view = render();

			await fireEvent.input(view.getByLabelText('Task Title'), { target: { value: 'Avocado' } });
			await fireEvent.submit(view.getByLabelText('Task Title').closest('form')!);

			await waitFor(() => expect(idsShown(view)).toContain('task-4'));
			expect(announced()).toBeNull();
		});

		it('says nothing when a whole new list arrives (limit)', async () => {
			app.taskFilter.set('done');
			const view = render();

			app.tasks.tasks = [make(7, 'x'), make(8, 'y')];

			await waitFor(() => expect(idsShown(view)).toEqual([]));
			expect(announced()).toBeNull();
		});

		it('says nothing when the first list holds one task that the filter hides (boundary)', () => {
			app.taskFilter.set('todo');
			app.tasks.tasks = [make(1, 'Done one', true)];

			const view = render();

			expect(idsShown(view)).toEqual([]);
			expect(announced()).toBeNull();
		});

		it('says nothing when a list of one hidden task replaces another list (boundary)', async () => {
			app.taskFilter.set('todo');
			app.tasks.tasks = [make(1, 'A'), make(2, 'B')];
			const view = render();

			app.tasks.tasks = [make(9, 'Done other', true)];

			await waitFor(() => expect(idsShown(view)).toEqual([]));
			expect(announced()).toBeNull();
		});

		it('says nothing when two hidden tasks arrive at once next to a known one (limit)', async () => {
			app.taskFilter.set('todo');
			app.tasks.tasks = [make(1, 'A')];
			const view = render();

			app.tasks.tasks = [make(1, 'A'), make(7, 'x', true), make(8, 'y', true)];

			await waitFor(() => expect(app.tasks.tasks).toHaveLength(3));
			expect(idsShown(view)).toEqual(['task-1']);
			expect(announced()).toBeNull();
		});
	});
});
