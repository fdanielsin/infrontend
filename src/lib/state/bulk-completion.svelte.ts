import { api, type ApiFailure, type ApiResult, type Task } from '$lib/api/client';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { m } from '$lib/paraglide/messages';
import { isPersistentFailure } from './failure-persistence';
import type { NotificationState } from './notification.svelte';
import type { RequestStatus } from './request-status.svelte';
import { UNDO_DURATION } from './undoable-deletes';

// Requests sent at once, then the next group when the whole group has answered. A browser keeps 6
// connections per host (HTTP/1.1): 4 leaves room for the rest of the page.
// Worst case: each request is bounded to 10 s (api/client.ts), so N tasks that all time out take
// ceil(N / 4) * 10 s: 100 tasks, about 4 minutes. No route sends several at once (TASK-R23).
export const COMPLETION_GROUP_SIZE = 4;

const TASK_NOT_FOUND = 'TASK_NOT_FOUND';

export interface CompletionHooks {
	// Called once Undo is over (the tasks are back to do, or the attempt has failed).
	onundo?: (() => void) | undefined;
	// Called once, when the toast leaves without Undo.
	onleave?: (() => void) | undefined;
}

// What the operation needs from the list it works on.
export interface CompletionList {
	tasks(): Task[];
	// Whose tasks the list is for; null while no user was ever selected.
	ownerId(): number | null;
	replace(update: (tasks: Task[]) => Task[]): void;
}

interface Operation {
	id: number;
	userId: number;
	// The tasks it saved, as they were left: Undo touches a task only while it is still so.
	saved: SvelteMap<number, Task>;
}

const sameState = (a: Task, b: Task) =>
	a.completed === b.completed && a.title === b.title && a.description === b.description;

type Settled = { id: number; result: ApiResult<unknown> };

// Marks every task to do as done, and puts them back (TASK-R22 to R26). One request per task: the
// contract has no route for several.
export class BulkCompletion {
	// True while a marking or an Undo is sent: a second one starts nothing (TASK-R26).
	busy = $state(false);

	readonly #list: CompletionList;
	readonly #notifications: NotificationState;
	readonly #status: RequestStatus;
	#lastOperationId = 0;
	// Each task belongs to the last operation that saved it: an older Undo leaves it alone.
	readonly #holder = new SvelteMap<number, number>();

	constructor(list: CompletionList, notifications: NotificationState, status: RequestStatus) {
		this.#list = list;
		this.#notifications = notifications;
		this.#status = status;
	}

	async markAllDone(hooks: CompletionHooks = {}) {
		if (this.busy) return;
		const todo = this.#list.tasks().filter((task) => !task.completed);
		const [first] = todo;
		if (!first) return;
		this.busy = true;
		try {
			const userId = first.user_id;
			const settled = await this.#send(todo, true);
			const failures = settled.flatMap(({ result }) => (result.success ? [] : [result]));
			const saved = new SvelteMap<number, Task>();
			const gone = new SvelteSet<number>();
			const sameList = this.#isListOf(userId);
			const current = this.#list.tasks();
			for (const { id, result } of settled) {
				if (!result.success) {
					if (result.code === TASK_NOT_FOUND) gone.add(id);
					continue;
				}
				// A task removed, or checked or unchecked by the user while sending, keeps what the user
				// made of it. A new title or description does not change the answer: the server says done.
				const before = todo.find((task) => task.id === id)!;
				const now = current.find((task) => task.id === id);
				if (sameList && (!now || now.completed !== before.completed)) continue;
				saved.set(id, { ...(now ?? before), completed: true });
			}
			if (sameList) this.#apply(saved, gone, userId);
			const failed = failures.filter((failure) => failure.code !== TASK_NOT_FOUND);
			if (failed.length) this.#reportFailure(failed, m.error_mark_all_done());
			if (saved.size) this.#offerUndo(userId, saved, todo.length, hooks);
		} finally {
			this.busy = false;
		}
	}

	#apply(saved: SvelteMap<number, Task>, gone: SvelteSet<number>, userId: number) {
		const listed = this.#list.tasks();
		const dropped = listed.filter((task) => gone.has(task.id)).length;
		this.#list.replace((tasks) =>
			tasks.filter((task) => !gone.has(task.id)).map((task) => saved.get(task.id) ?? task)
		);
		// One information for the whole operation, only for a task the user was looking at.
		if (dropped && this.#isListOf(userId)) {
			this.#notifications.add(m.notifications_task_gone(), 'info');
		}
	}

	#offerUndo(
		userId: number,
		saved: SvelteMap<number, Task>,
		asked: number,
		hooks: CompletionHooks
	) {
		const operation: Operation = { id: ++this.#lastOperationId, userId, saved };
		for (const id of saved.keys()) this.#holder.set(id, operation.id);
		this.#notifications.add(
			saved.size === asked
				? m.tasks_marked_all_done()
				: m.tasks_marked_some_done({ count: saved.size }),
			'success',
			{
				duration: UNDO_DURATION,
				action: {
					label: m.tasks_undo_delete(),
					icon: 'undo',
					run: () => void this.#undo(operation, hooks)
				},
				onclose: (reason) => {
					if (reason !== 'action') hooks.onleave?.();
				}
			}
		);
	}

	async #undo(operation: Operation, hooks: CompletionHooks) {
		if (this.busy) return;
		this.busy = true;
		try {
			const current = await this.#tasksOf(operation.userId);
			if (!current) {
				this.#notifications.notifyError(m.error_undo_mark_all());
				return;
			}
			const targets = [...operation.saved].filter(([id, expected]) => {
				const now = current.find((task) => task.id === id);
				return this.#holder.get(id) === operation.id && now && sameState(now, expected);
			});
			const settled = await this.#send(
				targets.map(([, task]) => task),
				false
			);
			const restored = new SvelteSet<number>();
			const gone = new SvelteSet<number>();
			const failed: ApiFailure[] = [];
			for (const { id, result } of settled) {
				if (result.success) restored.add(id);
				else if (result.code === TASK_NOT_FOUND) gone.add(id);
				else failed.push(result);
			}
			for (const id of [...restored, ...gone]) this.#holder.delete(id);
			if (this.#isListOf(operation.userId)) {
				this.#list.replace((tasks) =>
					tasks
						.filter((task) => !gone.has(task.id))
						.map((task) => (restored.has(task.id) ? { ...task, completed: false } : task))
				);
			}
			if (failed.length) this.#reportFailure(failed, m.error_undo_mark_all());
			if (restored.size) {
				this.#notifications.announce(m.tasks_marked_todo({ count: restored.size }));
			}
		} finally {
			this.busy = false;
			hooks.onundo?.();
		}
	}

	// The tasks of the user as they are now: the list when it is his, else the server's answer.
	async #tasksOf(userId: number): Promise<Task[] | null> {
		if (this.#isListOf(userId)) return this.#list.tasks();
		const result = await this.#status.run(() => api.getUserTasks(userId), {
			fallbackMessage: m.error_undo_mark_all,
			tracksLoading: false,
			isHandled: () => true
		});
		return result.success ? result.data : null;
	}

	#isListOf(userId: number) {
		const owner = this.#list.ownerId();
		return owner === null || owner === userId;
	}

	async #send(tasks: Task[], completed: boolean): Promise<Settled[]> {
		const settled: Settled[] = [];
		for (let start = 0; start < tasks.length; start += COMPLETION_GROUP_SIZE) {
			const group = tasks.slice(start, start + COMPLETION_GROUP_SIZE);
			settled.push(
				...(await Promise.all(
					group.map(async ({ id }) => ({
						id,
						// Failures are gathered here and reported once, never one by one.
						result: await this.#status.run(() => api.updateTask(id, { completed }), {
							fallbackMessage: m.error_update_task,
							tracksLoading: false,
							isHandled: () => true
						})
					}))
				))
			);
		}
		return settled;
	}

	// One error for the whole operation, with the reference of the first answer that has one, and
	// kept on screen when any failure is one the user cannot fix (NOTIF-R03, NOTIF-R07).
	#reportFailure(failures: ApiFailure[], message: string) {
		this.#notifications.notifyError(message, {
			reference: failures.find((failure) => failure.requestId)?.requestId,
			persistent: failures.some(isPersistentFailure)
		});
	}
}
