import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { api, type ApiResult, type Task } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import { renderWithApp } from '../support/render-with-app';
import TaskFormKeyedUser from '../support/TaskFormKeyedUser.svelte';
import TaskFormSwitchingUser from '../support/TaskFormSwitchingUser.svelte';
import TaskFormWithToasts from '../support/TaskFormWithToasts.svelte';

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
const todo = (id: number): Task => ({
	id,
	title: `Task ${id}`,
	description: '',
	user_id: 1,
	completed: false
});
const done = (id: number): Task => ({ ...todo(id), completed: true });

// Texts to guarantee: the table of the spec (tasks-completion.md, « Libellés »), in English.
const COMMAND = 'Mark all as done';
const SENDING = 'Marking…';
const ALL_DONE_TOAST = 'All tasks marked as done';
const PARTIAL_ERROR = "We couldn't mark every task as done.";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

async function settle() {
	await tick();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await tick();
}

// A server that keeps what it is sent, like the real one.
function serve(tasks: Task[]) {
	const stored = new Map(tasks.map((t) => [t.id, { ...t }]));
	vi.mocked(api.updateTask).mockImplementation((id, body) => {
		const saved = { ...stored.get(id)!, ...body };
		stored.set(id, saved);
		return Promise.resolve({ success: true, data: saved } as ApiResult<Task>);
	});
	vi.mocked(api.getUserTasks).mockImplementation(() =>
		Promise.resolve({ success: true, data: [...stored.values()] } as ApiResult<Task[]>)
	);
	return stored;
}

type View = Pick<
	ReturnType<typeof renderWithApp>,
	'queryByRole' | 'getByRole' | 'getByLabelText' | 'container'
>;

describe('"Mark all as done" on the task list (TASK-R22 to R26, screen)', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(private readonly report: (entries: { target: Element }[]) => void) {}
				observe(target: Element) {
					this.report([{ target }]);
				}
				unobserve() {}
				disconnect() {}
			}
		);
		app = new AppState();
		app.tasks.clear(1);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	function open(tasks: Task[]) {
		app.tasks.tasks = tasks;
		serve(tasks);
		return renderWithApp(app, TaskFormWithToasts, { user });
	}
	const command = (view: View) => view.queryByRole('button', { name: COMMAND });
	const heading = (view: View) => view.getByRole('heading', { level: 3 });

	describe('presence', () => {
		it('TASK-R22: is the last control of the bar, after "Show" and "Sort by" (happy path)', () => {
			const view = open([todo(1), todo(2), done(3)]);

			const button = command(view)!;
			expect(button).toBeTruthy();
			const filter = view.getByLabelText('Show');
			const order = view.getByLabelText('Sort by');
			for (const before of [filter, order]) {
				expect(
					before.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
				).toBeTruthy();
			}
			expect(button.hasAttribute('disabled')).toBe(false);
		});

		it.each(['all', 'todo', 'done'] as const)(
			'TASK-R22: stays visible with the filter %s (happy path)',
			(filter) => {
				app.taskFilter.set(filter);
				const view = open([todo(1), done(2)]);

				expect(command(view)).toBeTruthy();
			}
		);

		it('TASK-R22: exists for a single task to do (boundary)', () => {
			expect(command(open([todo(1)]))).toBeTruthy();
		});

		it('TASK-R22: is absent from the page with no task, or with every task done (limit)', () => {
			expect(command(open([]))).toBeNull();
			cleanup();
			expect(command(open([done(1), done(2)]))).toBeNull();
		});

		it('TASK-R22: does not count a task to do waiting for its deletion, and comes back with Undo (limit)', async () => {
			const view = open([todo(1), done(2)]);

			await fireEvent.click(view.getByRole('button', { name: 'Delete Task 1' }));
			await settle();
			expect(command(view)).toBeNull();

			await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
			await settle();
			expect(command(view)).toBeTruthy();
		});

		it('TASK-R22: has a decorative icon before the text (happy path)', () => {
			const button = command(open([todo(1)]))!;

			expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
			expect(button.firstElementChild?.tagName.toLowerCase()).toBe('svg');
		});
	});

	describe('inactive while a task is edited', () => {
		it('TASK-R22: is disabled during an edit and sends nothing (sad path)', async () => {
			const view = open([todo(1), todo(2)]);

			await fireEvent.click(view.getByRole('button', { name: 'Edit Task 1' }));
			await settle();

			expect(command(view)!.hasAttribute('disabled')).toBe(true);
			await fireEvent.click(command(view)!);
			expect(api.updateTask).not.toHaveBeenCalled();
		});
	});

	describe('while sending', () => {
		it('TASK-R22: stays active, says it is busy, keeps the focus and ignores a second activation (happy path)', async () => {
			const view = open([todo(1), todo(2)]);
			const late = deferred<ApiResult<Task>>();
			vi.mocked(api.updateTask).mockReturnValue(late.promise);
			const button = command(view)!;
			button.focus();

			await fireEvent.click(button);
			await settle();
			await fireEvent.click(button);

			const busy = view.getByRole('button', { name: SENDING });
			expect(busy).toBe(button);
			expect(busy.getAttribute('aria-busy')).toBe('true');
			expect(busy.hasAttribute('disabled')).toBe(false);
			expect(document.activeElement).toBe(busy);
			expect(api.updateTask).toHaveBeenCalledTimes(2);
			late.resolve({ success: true, data: done(1) });
		});

		it('TASK-R23: leaves the checkbox, Edit and Delete of the rows active (limit)', async () => {
			const view = open([todo(1), todo(2)]);
			vi.mocked(api.updateTask).mockReturnValue(deferred<ApiResult<Task>>().promise);

			await fireEvent.click(command(view)!);
			await settle();

			expect(view.getByRole('button', { name: 'Edit Task 1' }).hasAttribute('disabled')).toBe(
				false
			);
			expect(view.getByRole('button', { name: 'Delete Task 1' }).hasAttribute('disabled')).toBe(
				false
			);
			expect(view.getAllByRole('checkbox').every((box) => !box.hasAttribute('disabled'))).toBe(
				true
			);
		});

		it('TASK-R25: shows no sending state on the command while Undo is sent (limit)', async () => {
			const view = open([todo(1), done(2)]);
			await fireEvent.click(command(view)!);
			await settle();
			const late = deferred<ApiResult<Task>>();
			vi.mocked(api.updateTask).mockReturnValue(late.promise);

			await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
			await settle();

			expect(command(view)).toBeNull();
			expect(view.queryByRole('button', { name: SENDING })).toBeNull();
			late.resolve({ success: true, data: todo(1) });
		});
	});

	describe('result', () => {
		it('TASK-R23: is announced by the toast alone, with nothing else read (happy path)', async () => {
			app.taskFilter.set('todo');
			const view = open([todo(1), todo(2), todo(3)]);

			await fireEvent.click(command(view)!);
			await settle();

			expect(view.getByText('No tasks to do')).toBeTruthy();
			expect(view.getAllByText(ALL_DONE_TOAST)).toHaveLength(1);
			expect(view.container.ownerDocument.querySelector('[data-announcement]')?.textContent).toBe(
				''
			);
		});

		it('TASK-R24: puts the toast with Undo above the error in the page, and keeps the command (sad path)', async () => {
			const view = open([todo(1), todo(2), todo(3)]);
			const real = vi.mocked(api.updateTask).getMockImplementation()!;
			vi.mocked(api.updateTask).mockImplementation((id, body) =>
				id === 3
					? Promise.resolve({ success: false, error: 'boom', status: 500, requestId: 'req-1' })
					: real(id, body)
			);

			await fireEvent.click(command(view)!);
			await settle();

			const toasts = [...view.container.ownerDocument.querySelectorAll('[data-toast]')];
			expect(toasts.map((toast) => toast.textContent)).toEqual([
				expect.stringContaining('Tasks marked as done: 2'),
				expect.stringContaining(PARTIAL_ERROR)
			]);
			expect(command(view)).toBeTruthy();
		});
	});

	describe('focus', () => {
		async function activateWithKeyboard(view: View) {
			const button = command(view)!;
			button.focus();
			await fireEvent.click(button);
			await settle();
		}

		it('TASK-R25: goes to Undo when the command that had it disappears (happy path)', async () => {
			const view = open([todo(1), todo(2)]);

			await activateWithKeyboard(view);

			expect(command(view)).toBeNull();
			expect(document.activeElement).toBe(view.getByRole('button', { name: 'Undo' }));
		});

		it('TASK-R25: goes to the list heading when the toast leaves, never to the body (happy path)', async () => {
			const view = open([todo(1), todo(2)]);
			await activateWithKeyboard(view);

			await fireEvent.click(view.getByRole('button', { name: 'Dismiss notification' }));
			await settle();

			expect(document.activeElement).toBe(heading(view));
		});

		it('TASK-R25: goes back to the command once Undo is done (happy path)', async () => {
			const view = open([todo(1), todo(2)]);
			await activateWithKeyboard(view);

			await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
			await settle();

			expect(document.activeElement).toBe(command(view));
		});

		it('TASK-R25: goes to the list heading when the selected user changed before Undo is done (limit)', async () => {
			app.tasks.tasks = [todo(1), todo(2)];
			serve(app.tasks.tasks);
			const other = { id: 2, name: 'Bob', email: 'bob@example.com' };
			const view = renderWithApp(app, TaskFormSwitchingUser, { first: user, second: other });
			await activateWithKeyboard(view);
			const late = deferred<ApiResult<Task[]>>();
			vi.mocked(api.getUserTasks).mockReturnValue(late.promise);
			app.tasks.clear(2);
			app.tasks.tasks = [{ ...todo(20), user_id: 2 }];
			await fireEvent.click(view.getByRole('button', { name: 'Select the second user' }));

			await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
			await settle();
			late.resolve({ success: true, data: [done(1), done(2)] });
			await settle();

			expect(document.activeElement).toBe(heading(view));
		});

		it('TASK-R26: does not move the focus when the user changed during the sending and the first panel is gone (exception)', async () => {
			app.tasks.tasks = [todo(1), todo(2)];
			const late = deferred<void>();
			vi.mocked(api.updateTask).mockImplementation(async (id) => {
				await late.promise;
				return { success: true, data: done(id) };
			});
			const other = { id: 2, name: 'Bob', email: 'bob@example.com' };
			const view = renderWithApp(app, TaskFormKeyedUser, { first: user, second: other });
			const first = view.getByRole('button', { name: COMMAND });
			first.focus();
			await fireEvent.click(first);
			await settle();
			app.tasks.clear(2);
			app.tasks.tasks = [{ ...todo(20), user_id: 2 }];
			const select = view.getByRole('button', { name: 'Select the second user' });
			await fireEvent.click(select);
			select.focus();
			await settle();

			late.resolve();
			await settle();

			expect(document.activeElement).toBe(select);
		});

		it('TASK-R26: lets the command of the second user act while the first user is being sent (limit)', async () => {
			app.tasks.tasks = [todo(1), todo(2)];
			vi.mocked(api.updateTask).mockImplementation((id) =>
				id < 10
					? deferred<ApiResult<Task>>().promise
					: Promise.resolve({ success: true, data: done(id) } as ApiResult<Task>)
			);
			const other = { id: 2, name: 'Bob', email: 'bob@example.com' };
			const view = renderWithApp(app, TaskFormKeyedUser, { first: user, second: other });
			await fireEvent.click(view.getByRole('button', { name: COMMAND }));
			await settle();
			app.tasks.clear(2);
			app.tasks.tasks = [{ ...todo(20), user_id: 2 }];
			await fireEvent.click(view.getByRole('button', { name: 'Select the second user' }));
			await settle();

			await fireEvent.click(view.getByRole('button', { name: COMMAND }));
			await settle();

			expect(vi.mocked(api.updateTask).mock.calls.map(([id]) => id)).toEqual([1, 2, 20]);
		});

		async function markThenSwitchToSecondUser() {
			app.tasks.tasks = [todo(1), todo(2)];
			serve(app.tasks.tasks);
			const other = { id: 2, name: 'Bob', email: 'bob@example.com' };
			const view = renderWithApp(app, TaskFormKeyedUser, { first: user, second: other });
			const button = view.getByRole('button', { name: COMMAND });
			button.focus();
			await fireEvent.click(button);
			await settle();
			app.tasks.clear(2);
			app.tasks.tasks = [{ ...todo(20), user_id: 2 }];
			await fireEvent.click(view.getByRole('button', { name: 'Select the second user' }));
			await settle();
			return view;
		}

		it('TASK-R25: puts the focus on the heading of the list on the page when Undo is pressed after a change of user (limit)', async () => {
			const view = await markThenSwitchToSecondUser();

			await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
			await settle();

			expect(document.activeElement).toBe(heading(view));
		});

		it('TASK-R25: puts the focus on the heading of the list on the page when the toast leaves after a change of user (limit)', async () => {
			const view = await markThenSwitchToSecondUser();
			const dismiss = view.getByRole('button', { name: 'Dismiss notification' });
			dismiss.focus();

			await fireEvent.click(dismiss);
			await settle();

			expect(document.activeElement).toBe(heading(view));
		});

		it('TASK-R25: leaves the focus where it is when the command was activated without the focus (limit)', async () => {
			const view = open([todo(1), todo(2)]);
			const other = view.getByLabelText('Show');
			other.focus();

			await fireEvent.click(command(view)!);
			await settle();

			expect(document.activeElement).toBe(other);
		});

		it('TASK-R24: keeps the focus on the command when it stays after a partial failure (sad path)', async () => {
			const view = open([todo(1), todo(2)]);
			const real = vi.mocked(api.updateTask).getMockImplementation()!;
			vi.mocked(api.updateTask).mockImplementation((id, body) =>
				id === 2 ? Promise.resolve({ success: false, error: 'boom', status: 500 }) : real(id, body)
			);

			await activateWithKeyboard(view);

			expect(document.activeElement).toBe(command(view));
		});
	});
});
