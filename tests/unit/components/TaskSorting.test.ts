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
			expect(messages()).toEqual(['Tasks sorted by title']);
			expect(app.notifications.items[0]?.type).toBe('info');
			expect(storage.getItem('indrive.task-order')).toBe('title');
		});

		it('sorts by status, then back to the creation order, exactly as it was (happy path)', async () => {
			app.tasks.tasks = [make(1, 'a', true), make(2, 'b'), make(3, 'c', true), make(4, 'd')];
			const view = render();

			await choose(view, 'status');
			expect(titlesShown(view)).toEqual(['task-2', 'task-4', 'task-1', 'task-3']);
			await choose(view, 'created');

			expect(titlesShown(view)).toEqual(['task-1', 'task-2', 'task-3', 'task-4']);
			expect(messages()).toEqual(['Tasks sorted by status', 'Tasks sorted by creation order']);
		});

		it('says nothing when the choice does not change (boundary)', async () => {
			const view = render();

			await choose(view, 'created');

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
			expect(messages()).toEqual(['zzz: position 3 of 3']);
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
			expect(messages()).toEqual(['Banana: position 3 of 3']);
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
