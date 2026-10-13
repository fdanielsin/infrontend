import { api, type ApiFailure, type ErrorCode, type Task } from '$lib/api/client';
import { m } from '$lib/paraglide/messages';
import type { NotificationState } from './notification.svelte';
import { RequestStatus } from './request-status.svelte';
import { UndoableDeletes } from './undoable-deletes';

const TASK_NOT_FOUND: ErrorCode = 'TASK_NOT_FOUND';

// The task no longer exists on the server: an expected outcome, not an error.
function isTaskGone(failure: ApiFailure) {
	return failure.code === TASK_NOT_FOUND;
}

export class TaskState {
	tasks = $state.raw<Task[]>([]);
	readonly status: RequestStatus;

	readonly #notifications: NotificationState;
	// Whose tasks the list is for, set as soon as a user is selected (before his tasks arrive): a
	// task created for someone else, whose answer comes late, is never added to it. Null only
	// while no user was ever selected, when there is no list to protect.
	#listOwnerId: number | null = null;
	// Deletions the user can still undo. A hidden page sends them at once (TASK-R18).
	readonly #deletes: UndoableDeletes<Task>;

	constructor(notifications: NotificationState) {
		this.#notifications = notifications;
		this.status = new RequestStatus(notifications);
		this.#deletes = new UndoableDeletes<Task>({
			notifications,
			status: this.status,
			send: (id, { keepalive }) =>
				keepalive ? api.deleteTask(id, { keepalive }) : api.deleteTask(id),
			isGone: isTaskGone,
			message: (task) => m.tasks_deleted_named({ title: task.title }),
			undoLabel: m.tasks_undo_delete,
			failureMessage: m.error_delete_task,
			putBack: (task, index) => this.#putBack(task, index),
			whenHidden: 'send'
		});
	}

	// Empties the list for the user being selected, and makes him its owner from now on.
	clear(ownerId: number | null = null) {
		this.tasks = [];
		this.#listOwnerId = ownerId;
		void this.commitPending();
	}

	async load(userId: number, isCurrent: () => boolean) {
		const result = await this.status.run(() => api.getUserTasks(userId), {
			fallbackMessage: m.error_fetch_tasks,
			isCurrent
		});
		if (result.success && isCurrent()) {
			this.tasks = result.data.filter((task) => !this.#deletes.isInFlight(task.id));
			this.#listOwnerId = userId;
		}
	}

	async add(title: string, description: string, userId: number) {
		const result = await this.status.run(
			() => api.createTask({ title, description, user_id: userId, completed: false }),
			{ fallbackMessage: m.error_create_task }
		);
		if (!result.success) return undefined;
		// A reload of the same user's list may already hold the task when the answer comes.
		const listed = this.tasks.some((task) => task.id === result.data.id);
		if (!listed && (this.#listOwnerId === null || this.#listOwnerId === userId)) {
			this.tasks = [...this.tasks, result.data];
		}
		return result.data;
	}

	// Returns false on failure so the caller can reset the checkbox: a one-way
	// `checked` binding does not rewrite an unchanged value.
	async toggle(id: number, completed: boolean): Promise<boolean> {
		const result = await this.status.run(() => api.updateTask(id, { completed }), {
			fallbackMessage: m.error_update_task,
			tracksLoading: false,
			isHandled: isTaskGone
		});
		if (!result.success) {
			if (isTaskGone(result)) this.#dropGoneTask(id);
			return false;
		}
		this.tasks = this.tasks.map((task) => (task.id === id ? { ...task, completed } : task));
		return true;
	}

	async edit(id: number, title: string, description: string) {
		const result = await this.status.run(() => api.updateTask(id, { title, description }), {
			fallbackMessage: m.error_update_task,
			isHandled: isTaskGone
		});
		if (!result.success) {
			if (isTaskGone(result)) this.#dropGoneTask(id);
			return false;
		}
		this.tasks = this.tasks.map((task) =>
			task.id === id ? { ...task, title, description } : task
		);
		return true;
	}

	// The task leaves the list at once and its deletion waits for the end of the toast: Undo puts
	// it back without any request. `onundo` lets the caller place the focus once it is back.
	remove(
		id: number,
		{ onundo, onleave }: { onundo?: (id: number) => void; onleave?: () => void } = {}
	) {
		const index = this.tasks.findIndex((task) => task.id === id);
		const task = this.tasks[index];
		if (!task || this.#deletes.has(id)) return;
		this.tasks = this.tasks.filter((listed) => listed.id !== id);
		this.#deletes.remove(task, index, { onundo, onleave });
	}

	// Sends every waiting deletion and closes its toast. Safe to call again: a deletion is sent once.
	commitPending(options: { keepalive?: boolean } = {}) {
		return this.#deletes.commitPending(options);
	}

	// The page is hidden: a task is sent at once (TASK-R18).
	onHidden() {
		return this.#deletes.onHidden();
	}

	onVisible() {
		this.#deletes.onVisible();
	}

	#putBack(task: Task, index: number) {
		if (this.#listOwnerId !== null && this.#listOwnerId !== task.user_id) return;
		const tasks = [...this.tasks];
		tasks.splice(Math.min(index, tasks.length), 0, task);
		this.tasks = tasks;
	}

	// Only a task still in the current list is dropped and announced, so a repeated
	// action or a change of user during the request stays silent.
	#dropGoneTask(id: number) {
		if (!this.tasks.some((task) => task.id === id)) return;
		this.tasks = this.tasks.filter((task) => task.id !== id);
		this.#notifications.add(m.notifications_task_gone(), 'info');
	}
}
