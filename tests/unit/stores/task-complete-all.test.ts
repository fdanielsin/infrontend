import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiFailure, type ApiResult, type Task } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({
	api: {
		getUsers: vi.fn(),
		getUser: vi.fn(),
		getUserTasks: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		deleteTask: vi.fn()
	}
}));

const task = (id: number, completed = false, user_id = 1): Task => ({
	id,
	title: `Task ${id}`,
	description: '',
	user_id,
	completed
});
const refused: ApiFailure = {
	success: false,
	error: 'boom',
	status: 500,
	code: 'INTERNAL_ERROR',
	requestId: 'req-500'
};
const offline: ApiFailure = { success: false, error: 'Unknown error', kind: 'unknown' };
const gone: ApiFailure = {
	success: false,
	error: 'Task not found',
	status: 404,
	code: 'TASK_NOT_FOUND'
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

// `updateTask` answers by task id and body; the default answer is a success.
function answers(byId: Record<number, ApiResult<Task> | undefined> = {}) {
	vi.mocked(api.updateTask).mockImplementation((id, body) =>
		Promise.resolve(
			byId[id] ?? {
				success: true,
				data: { ...task(id), completed: body.completed ?? false }
			}
		)
	);
}
const sent = () =>
	vi.mocked(api.updateTask).mock.calls.map(([id, body]) => [id, body.completed] as const);

describe('mark every task as done (TASK-R22 to R26)', () => {
	let app: AppState;
	const toasts = () => app.notifications.items;
	const errors = () => toasts().filter((n) => n.type === 'error');
	const undoToast = () => toasts().find((n) => n.action);
	const listed = (id: number) => app.tasks.tasks.find((t) => t.id === id);

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
		app.tasks.clear(1);
		answers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	describe('effect (TASK-R23)', () => {
		it('completes the tasks to do and only them, then offers Undo for 6 s (criteria 5, 8)', async () => {
			// GIVEN: Two tasks to do and one done.
			app.tasks.tasks = [task(1), task(2), task(3, true)];

			// WHEN: Every task is marked as done.
			await app.tasks.markAllDone();

			// THEN: Exactly the two tasks to do were sent, and the single announcement is the toast.
			expect(sent()).toEqual([
				[1, true],
				[2, true]
			]);
			expect(app.tasks.tasks.every((t) => t.completed)).toBe(true);
			expect(toasts()).toEqual([
				expect.objectContaining({
					message: 'All tasks marked as done',
					type: 'success',
					duration: 6000
				})
			]);
			expect(undoToast()?.action?.label).toBe('Undo');
			expect(app.notifications.announcement).toBeNull();
		});

		it('sends nothing for a task waiting for its deletion (criterion 6)', async () => {
			// GIVEN: A task to do waits for its deletion, and another does not.
			app.tasks.tasks = [task(1), task(2)];
			app.tasks.remove(1);

			// WHEN: Every task is marked as done.
			await app.tasks.markAllDone();

			// THEN: Only the other task is sent.
			expect(sent()).toEqual([[2, true]]);
		});

		it('changes no row before the last answer (criterion 7)', async () => {
			// GIVEN: The first answer is back, the second is late.
			const late = deferred<ApiResult<Task>>();
			app.tasks.tasks = [task(1), task(2)];
			vi.mocked(api.updateTask)
				.mockResolvedValueOnce({ success: true, data: task(1, true) })
				.mockReturnValueOnce(late.promise);
			const running = app.tasks.markAllDone();
			await vi.waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(2));

			// THEN: Nothing changed yet.
			expect(app.tasks.tasks.map((t) => t.completed)).toEqual([false, false]);

			// WHEN: The last answer arrives.
			late.resolve({ success: true, data: task(2, true) });
			await running;

			// THEN: Both rows changed together.
			expect(app.tasks.tasks.map((t) => t.completed)).toEqual([true, true]);
		});

		it('never has more than 4 requests in flight, whatever the number of tasks', async () => {
			// GIVEN: Ten tasks to do, each request answering only when released.
			app.tasks.tasks = Array.from({ length: 10 }, (_, i) => task(i + 1));
			let inFlight = 0;
			let peak = 0;
			const releases: Array<() => void> = [];
			vi.mocked(api.updateTask).mockImplementation(async (id) => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				await new Promise<void>((release) => releases.push(release));
				inFlight--;
				return { success: true, data: task(id, true) };
			});

			// WHEN: They are all marked, releasing the requests as they arrive.
			const running = app.tasks.markAllDone();
			while (vi.mocked(api.updateTask).mock.calls.length < 10) {
				await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
				releases.splice(0).forEach((release) => release());
				await Promise.resolve();
			}
			releases.splice(0).forEach((release) => release());
			await running;

			// THEN: The peak never passed 4, and all ten were completed.
			expect(peak).toBe(4);
			expect(app.tasks.tasks.every((t) => t.completed)).toBe(true);
		});

		it('ignores a second activation while the first one is sent (criterion 20)', async () => {
			// GIVEN: An operation whose answers are late.
			const late = deferred<ApiResult<Task>>();
			app.tasks.tasks = [task(1), task(2)];
			vi.mocked(api.updateTask).mockReturnValue(late.promise);
			const first = app.tasks.markAllDone();

			// WHEN: The command is activated again.
			await app.tasks.markAllDone();
			late.resolve({ success: true, data: task(1, true) });
			await first;

			// THEN: Only one operation's requests were sent.
			expect(api.updateTask).toHaveBeenCalledTimes(2);
		});

		it('says it is busy only while sending', async () => {
			const late = deferred<ApiResult<Task>>();
			app.tasks.tasks = [task(1)];
			vi.mocked(api.updateTask).mockReturnValue(late.promise);
			const running = app.tasks.markAllDone();
			expect(app.tasks.markingAll).toBe(true);
			late.resolve({ success: true, data: task(1, true) });
			await running;
			expect(app.tasks.markingAll).toBe(false);
		});
	});

	describe('failure (TASK-R24)', () => {
		it('keeps the refused task to do, completes the others, one error with the reference (criterion 9, 13)', async () => {
			// GIVEN: Three tasks to do, the third refused with a 500.
			app.tasks.tasks = [task(1), task(2), task(3)];
			answers({ 3: refused });

			// WHEN: Every task is marked as done.
			await app.tasks.markAllDone();

			// THEN: Two are done, the third is to do, and one fixed error stays with its reference.
			expect(app.tasks.tasks.map((t) => t.completed)).toEqual([true, true, false]);
			expect(errors()).toEqual([
				expect.objectContaining({
					message: "We couldn't mark every task as done.",
					reference: 'req-500',
					duration: 0
				})
			]);
			// AND: The Undo toast counts the two successes only, and never says "All tasks".
			expect(undoToast()?.message).toBe('Tasks marked as done: 2');
		});

		it('shows a single error for several network failures (criterion 10)', async () => {
			app.tasks.tasks = [task(1), task(2), task(3)];
			answers({ 2: offline, 3: offline });

			await app.tasks.markAllDone();

			expect(errors()).toHaveLength(1);
			expect(errors()[0]?.reference).toBeUndefined();
		});

		it('lets a refusal the user can fix leave by itself', async () => {
			app.tasks.tasks = [task(1)];
			answers({ 1: { success: false, error: 'bad', status: 400, code: 'VALIDATION_FAILED' } });

			await app.tasks.markAllDone();

			expect(errors()).toEqual([
				expect.objectContaining({ message: "We couldn't mark every task as done.", duration: 6000 })
			]);
		});

		it('offers no Undo when nothing was saved (criterion 14)', async () => {
			app.tasks.tasks = [task(1), task(2)];
			answers({ 1: refused, 2: refused });

			await app.tasks.markAllDone();

			expect(errors()).toHaveLength(1);
			expect(undoToast()).toBeUndefined();
			expect(app.tasks.tasks.map((t) => t.completed)).toEqual([false, false]);
		});

		it('drops a task gone from the server with one information and no error (criterion 11)', async () => {
			app.tasks.tasks = [task(1), task(2), task(3)];
			answers({ 2: gone, 3: gone });

			await app.tasks.markAllDone();

			expect(app.tasks.tasks.map((t) => t.id)).toEqual([1]);
			expect(errors()).toHaveLength(0);
			expect(toasts().filter((n) => n.message === 'Task already deleted')).toHaveLength(1);
			// AND: The gone tasks do not count in the Undo toast, which is not "All tasks".
			expect(undoToast()?.message).toBe('Tasks marked as done: 1');
		});
	});

	describe('Undo (TASK-R25)', () => {
		it('puts back to do the tasks of the operation, announces the count, shows no toast (criterion 12)', async () => {
			// GIVEN: Two tasks to do and one done, all marked as done.
			app.tasks.tasks = [task(1), task(2), task(3, true)];
			await app.tasks.markAllDone();
			vi.mocked(api.updateTask).mockClear();

			// WHEN: Undo is pressed.
			app.notifications.runAction(undoToast()!.id);
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));

			// THEN: Only the two are sent back to do; the third stays done.
			expect(sent()).toEqual([
				[1, false],
				[2, false]
			]);
			expect(app.tasks.tasks.map((t) => t.completed)).toEqual([false, false, true]);
			expect(app.notifications.announcement?.message).toBe('Tasks marked as to do: 2');
			expect(toasts()).toEqual([]);
		});

		it('targets only the tasks that were saved (criterion 13)', async () => {
			app.tasks.tasks = [task(1), task(2), task(3)];
			answers({ 3: refused });
			await app.tasks.markAllDone();
			vi.mocked(api.updateTask).mockClear();
			answers();

			app.notifications.runAction(undoToast()!.id);
			await vi.waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(2));

			expect(sent().map(([id]) => id)).toEqual([1, 2]);
		});

		it('leaves alone a task unchecked or edited since (criterion 15)', async () => {
			// GIVEN: Three tasks marked, then one unchecked and one edited.
			app.tasks.tasks = [task(1), task(2), task(3)];
			await app.tasks.markAllDone();
			await app.tasks.toggle(1, false);
			await app.tasks.edit(2, 'Renamed', '');
			vi.mocked(api.updateTask).mockClear();

			// WHEN: Undo is pressed.
			app.notifications.runAction(undoToast()!.id);
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));

			// THEN: Only the third is sent.
			expect(sent()).toEqual([[3, false]]);
			expect(app.notifications.announcement?.message).toBe('Tasks marked as to do: 1');
		});

		it('ignores a task deleted since, without a message (criterion 16)', async () => {
			app.tasks.tasks = [task(1), task(2)];
			await app.tasks.markAllDone();
			app.tasks.remove(1);
			vi.mocked(api.updateTask).mockClear();

			app.notifications.runAction(undoToast()!.id);
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));

			expect(sent()).toEqual([[2, false]]);
			expect(toasts().some((n) => n.message === 'Task already deleted')).toBe(false);
		});

		it('shows one error when part of Undo fails and keeps the server state on each row (criterion 17)', async () => {
			app.tasks.tasks = [task(1), task(2)];
			await app.tasks.markAllDone();
			answers({ 2: refused });

			app.notifications.runAction(undoToast()!.id);
			await vi.waitFor(() => expect(errors()).toHaveLength(1));

			expect(errors()[0]?.message).toBe("We couldn't put every task back to do.");
			expect(app.tasks.tasks.map((t) => t.completed)).toEqual([false, true]);
			// AND: The announcement counts the tasks put back, not those asked.
			expect(app.notifications.announcement?.message).toBe('Tasks marked as to do: 1');
		});

		it('announces nothing when every request of Undo fails', async () => {
			app.tasks.tasks = [task(1), task(2)];
			await app.tasks.markAllDone();
			answers({ 1: refused, 2: refused });

			app.notifications.runAction(undoToast()!.id);
			await vi.waitFor(() => expect(errors()).toHaveLength(1));
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));

			expect(app.notifications.announcement).toBeNull();
			expect(app.tasks.tasks.map((t) => t.completed)).toEqual([true, true]);
		});

		it('drops silently a task gone from the server during Undo', async () => {
			app.tasks.tasks = [task(1), task(2)];
			await app.tasks.markAllDone();
			answers({ 1: gone });

			app.notifications.runAction(undoToast()!.id);
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));

			expect(app.tasks.tasks.map((t) => t.id)).toEqual([2]);
			expect(toasts()).toEqual([]);
			expect(app.notifications.announcement?.message).toBe('Tasks marked as to do: 1');
		});

		it('ignores the Undo of another operation while one is being sent', async () => {
			// GIVEN: Two operations, on two tasks; the Undo of the first has not been answered.
			app.tasks.tasks = [task(1)];
			await app.tasks.markAllDone();
			const firstUndo = undoToast()!;
			app.tasks.tasks = [...app.tasks.tasks, task(2)];
			await app.tasks.markAllDone();
			const secondUndo = toasts()
				.filter((n) => n.action)
				.at(-1)!;
			vi.mocked(api.updateTask).mockClear();
			const late = deferred<ApiResult<Task>>();
			vi.mocked(api.updateTask).mockReturnValue(late.promise);
			app.notifications.runAction(firstUndo.id);

			// WHEN: The Undo of the second is pressed meanwhile.
			app.notifications.runAction(secondUndo.id);
			late.resolve({ success: true, data: task(1) });
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));

			// THEN: Only the first one sent its request.
			expect(sent()).toEqual([[1, false]]);
		});

		it('sends nothing more when the toast leaves without Undo (criterion 18)', async () => {
			vi.useFakeTimers();
			app.tasks.tasks = [task(1), task(2)];
			await app.tasks.markAllDone();
			vi.mocked(api.updateTask).mockClear();

			await vi.advanceTimersByTimeAsync(6000);

			expect(undoToast()).toBeUndefined();
			expect(api.updateTask).not.toHaveBeenCalled();
		});

		it('tells the caller when the toast leaves and when Undo is done', async () => {
			const onundo = vi.fn();
			const onleave = vi.fn();
			app.tasks.tasks = [task(1)];
			await app.tasks.markAllDone({ onundo, onleave });

			app.notifications.runAction(undoToast()!.id);
			expect(onleave).not.toHaveBeenCalled();
			await vi.waitFor(() => expect(onundo).toHaveBeenCalledOnce());

			app.tasks.tasks = [task(2)];
			await app.tasks.markAllDone({ onundo, onleave });
			app.notifications.remove(undoToast()!.id, 'dismissed');
			expect(onleave).toHaveBeenCalledOnce();
		});

		it('gives a task to the last operation that saved it (two operations in a row)', async () => {
			// GIVEN: A task marked, unchecked, then marked again by a second operation.
			app.tasks.tasks = [task(1), task(2)];
			await app.tasks.markAllDone();
			const firstUndo = undoToast()!;
			await app.tasks.toggle(1, false);
			await app.tasks.markAllDone();
			vi.mocked(api.updateTask).mockClear();

			// WHEN: Undo of the first operation is pressed.
			app.notifications.runAction(firstUndo.id);
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));

			// THEN: Only the task the second operation did not touch goes back to do.
			expect(sent()).toEqual([[2, false]]);
		});
	});

	describe('changes made while sending (TASK-R26)', () => {
		// A server that keeps what it is sent, and answers a marking only when released.
		function coherentServer(tasks: Task[]) {
			const late = deferred<void>();
			const stored = new Map(tasks.map((t) => [t.id, { ...t }]));
			vi.mocked(api.updateTask).mockImplementation(async (id, body) => {
				if (body.completed === true) await late.promise;
				const saved = { ...stored.get(id)!, ...body };
				stored.set(id, saved);
				return { success: true, data: saved };
			});
			return { release: () => late.resolve(), stored };
		}

		it('follows the server for the checkbox of a task whose title was edited meanwhile, keeping the local title (criterion 26)', async () => {
			// GIVEN: Two tasks sent; the title of the first is edited while the requests are in flight.
			app.tasks.tasks = [task(1), task(2)];
			const server = coherentServer(app.tasks.tasks);
			const running = app.tasks.markAllDone();
			await vi.waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(2));
			await app.tasks.edit(1, 'Renamed', '');

			// WHEN: The answers arrive.
			server.release();
			await running;

			// THEN: The row is done like the server says, with its local title, and counts in the
			// operation: the toast says all, and Undo reaches it.
			expect(listed(1)).toMatchObject({ title: 'Renamed', completed: true });
			expect(server.stored.get(1)?.completed).toBe(true);
			expect(undoToast()?.message).toBe('All tasks marked as done');
			vi.mocked(api.updateTask).mockClear();
			app.notifications.runAction(undoToast()!.id);
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));
			expect(sent()).toEqual([
				[1, false],
				[2, false]
			]);
		});

		it('keeps the choice of the user for a task checked or unchecked meanwhile, out of the operation and of its Undo (criterion 25)', async () => {
			// GIVEN: Two tasks sent.
			app.tasks.tasks = [task(1), task(2)];
			const server = coherentServer(app.tasks.tasks);
			const running = app.tasks.markAllDone();
			await vi.waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(2));
			// AND: The user checks the first row himself while the operation is in flight, and that
			// request is answered at once.
			vi.mocked(api.updateTask).mockImplementationOnce((id, body) =>
				Promise.resolve({
					success: true,
					data: { ...task(id), completed: body.completed ?? false }
				})
			);
			await app.tasks.toggle(1, true);

			// WHEN: The answers arrive.
			server.release();
			await running;

			// THEN: The row keeps the user's choice and is not an object of the operation.
			expect(listed(1)?.completed).toBe(true);
			expect(listed(2)?.completed).toBe(true);
			expect(undoToast()?.message).toBe('Tasks marked as done: 1');
			vi.mocked(api.updateTask).mockClear();
			app.notifications.runAction(undoToast()!.id);
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));
			expect(sent()).toEqual([[2, false]]);
		});

		it('leaves a task removed meanwhile out of the list and of the operation', async () => {
			app.tasks.tasks = [task(1), task(2)];
			const server = coherentServer(app.tasks.tasks);
			const running = app.tasks.markAllDone();
			await vi.waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(2));
			app.tasks.remove(2);

			server.release();
			await running;

			expect(listed(2)).toBeUndefined();
			expect(toasts().map((n) => n.message)).toContain('Tasks marked as done: 1');
		});

		it('TASK-R26: lets the second user mark his tasks while the first user is being sent, and keeps ignoring the first (limit)', async () => {
			// GIVEN: An operation of user 1 whose answers are late.
			const late = deferred<void>();
			const stored = new Map<number, Task>();
			vi.mocked(api.updateTask).mockImplementation(async (id) => {
				if (id < 10) await late.promise;
				const saved = { ...task(id, true, id < 10 ? 1 : 2) };
				stored.set(id, saved);
				return { success: true, data: saved };
			});
			app.tasks.tasks = [task(1), task(2)];
			const first = app.tasks.markAllDone();
			await vi.waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(2));

			// WHEN: Another user is selected and marks his tasks, while the first is still sent.
			app.tasks.clear(2);
			app.tasks.tasks = [task(20, false, 2), task(21, false, 2)];
			await app.tasks.markAllDone();

			// THEN: His two tasks were sent and done, and the list is his.
			expect(sent().filter(([id]) => id >= 20)).toEqual([
				[20, true],
				[21, true]
			]);
			expect(app.tasks.tasks.every((t) => t.completed)).toBe(true);

			// WHEN: The first user is back and activates again, his first operation still being sent.
			app.tasks.clear(1);
			app.tasks.tasks = [task(1), task(2)];
			await app.tasks.markAllDone();

			// THEN: Nothing more was sent for him.
			expect(sent().filter(([id]) => id < 10)).toHaveLength(2);
			late.resolve();
			await first;
		});

		it('TASK-R25: gives each user his own Undo toast, which puts back only his own tasks (limit)', async () => {
			// GIVEN: User 1 marked his tasks, then user 2 marked his.
			app.tasks.tasks = [task(1), task(2)];
			await app.tasks.markAllDone();
			app.tasks.clear(2);
			app.tasks.tasks = [task(20, false, 2)];
			await app.tasks.markAllDone();
			const undos = toasts().filter((n) => n.action);
			expect(undos).toHaveLength(2);
			vi.mocked(api.getUserTasks).mockImplementation((userId) =>
				Promise.resolve({
					success: true,
					data: userId === 1 ? [task(1, true), task(2, true)] : [task(20, true, 2)]
				})
			);
			vi.mocked(api.updateTask).mockClear();

			// WHEN: The Undo of the second user is pressed.
			app.notifications.runAction(undos[1]!.id);
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));

			// THEN: Only his task goes back to do.
			expect(sent()).toEqual([[20, false]]);

			// WHEN: The Undo of the first user is pressed.
			vi.mocked(api.updateTask).mockClear();
			app.notifications.runAction(undos[0]!.id);
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));

			// THEN: Only his two tasks go back to do.
			expect(sent()).toEqual([
				[1, false],
				[2, false]
			]);
		});

		it('TASK-R26: lets the Undo of the second user work while the first user is being sent (limit)', async () => {
			// GIVEN: User 2 marked his task; then user 1 starts an operation whose answers are late.
			const late = deferred<void>();
			vi.mocked(api.updateTask).mockImplementation(async (id, body) => {
				if (id < 10 && body.completed === true) await late.promise;
				return { success: true, data: { ...task(id, body.completed ?? false) } };
			});
			app.tasks.clear(2);
			app.tasks.tasks = [task(20, false, 2)];
			await app.tasks.markAllDone();
			const secondUndo = undoToast()!;
			app.tasks.clear(1);
			app.tasks.tasks = [task(1), task(2)];
			const first = app.tasks.markAllDone();
			await vi.waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(3));
			vi.mocked(api.updateTask).mockClear();
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [task(20, true, 2)] });

			// WHEN: The Undo of user 2 is pressed meanwhile.
			app.notifications.runAction(secondUndo.id);
			await vi.waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(1));

			// THEN: It went through.
			expect(sent()).toEqual([[20, false]]);
			late.resolve();
			await first;
		});

		it('saves the tasks of the first user and leaves the list of the second untouched (criterion 21)', async () => {
			// GIVEN: An operation in flight for user 1.
			const late = deferred<void>();
			app.tasks.tasks = [task(1), task(2)];
			vi.mocked(api.updateTask).mockImplementation(async (id) => {
				await late.promise;
				return { success: true, data: task(id, true) };
			});
			const running = app.tasks.markAllDone();
			await vi.waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(2));

			// WHEN: Another user is selected before the answers.
			app.tasks.clear(2);
			app.tasks.tasks = [task(20, false, 2)];
			late.resolve();
			await running;

			// THEN: The second list did not change, and no row, error or gone message was added.
			expect(app.tasks.tasks).toEqual([task(20, false, 2)]);
			expect(errors()).toHaveLength(0);
			// AND: The result is still offered with Undo, without the name of the first user.
			expect(undoToast()?.message).toBe('All tasks marked as done');
			expect(toasts().map((n) => n.message)).not.toContain('Task already deleted');
		});

		it('verifies the tasks on the server before an Undo asked on another user', async () => {
			// GIVEN: An operation done for user 1, then user 2 selected.
			app.tasks.tasks = [task(1), task(2)];
			await app.tasks.markAllDone();
			app.tasks.clear(2);
			app.tasks.tasks = [task(20, false, 2)];
			vi.mocked(api.updateTask).mockClear();
			// AND: On the server, task 2 was unchecked meanwhile.
			vi.mocked(api.getUserTasks).mockResolvedValue({
				success: true,
				data: [task(1, true), task(2, false)]
			});

			// WHEN: Undo is pressed.
			app.notifications.runAction(undoToast()!.id);
			await vi.waitFor(() => expect(app.tasks.markingAll).toBe(false));

			// THEN: Only task 1 is sent, and the list of user 2 did not change.
			expect(api.getUserTasks).toHaveBeenCalledWith(1);
			expect(sent()).toEqual([[1, false]]);
			expect(app.tasks.tasks).toEqual([task(20, false, 2)]);
		});
	});
});
