import { api, type ApiFailure, type ErrorCode, type Task } from '$lib/api/client';
import { m } from '$lib/paraglide/messages';
import type { NotificationState } from './notification.svelte';
import { RequestStatus } from './request-status.svelte';

// How long Undo stays offered before the deletion is sent.
const UNDO_DURATION = 6000;

interface PendingDelete {
	task: Task;
	index: number;
	toastId: string;
}

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
	// Deletions the user can still undo, by task id.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#pendingDeletes = new Map<number, PendingDelete>();
	// Deletions sent and not answered yet: the server may still list these tasks.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#deletesInFlight = new Set<number>();

	constructor(notifications: NotificationState) {
		this.#notifications = notifications;
		this.status = new RequestStatus(notifications);
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
			this.tasks = result.data.filter((task) => !this.#deletesInFlight.has(task.id));
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
		if (!task || this.#pendingDeletes.has(id)) return;
		this.tasks = this.tasks.filter((listed) => listed.id !== id);
		const toastId = this.#notifications.add(
			m.tasks_deleted_named({ title: task.title }),
			'success',
			{
				duration: UNDO_DURATION,
				action: {
					label: m.tasks_undo_delete(),
					icon: 'undo',
					run: () => {
						if (this.#restore(id)) onundo?.(id);
					}
				},
				onclose: (reason) => {
					if (reason === 'action') return;
					onleave?.();
					void this.#commit(id);
				}
			}
		);
		this.#pendingDeletes.set(id, { task, index, toastId });
	}

	// Sends every waiting deletion and closes its toast. Safe to call again: a deletion is sent once.
	async commitPending(options: { keepalive?: boolean } = {}) {
		const waiting = [...this.#pendingDeletes.values()];
		const commits = waiting.map(({ task }) => this.#commit(task.id, options));
		for (const { toastId } of waiting) this.#notifications.remove(toastId, 'dismissed');
		await Promise.all(commits);
	}

	#restore(id: number) {
		const pending = this.#pendingDeletes.get(id);
		if (!pending) return false;
		this.#pendingDeletes.delete(id);
		this.#putBack(pending);
		return true;
	}

	#putBack({ task, index }: PendingDelete) {
		if (this.#listOwnerId !== null && this.#listOwnerId !== task.user_id) return;
		const tasks = [...this.tasks];
		tasks.splice(Math.min(index, tasks.length), 0, task);
		this.tasks = tasks;
	}

	async #commit(id: number, { keepalive = false }: { keepalive?: boolean } = {}) {
		const pending = this.#pendingDeletes.get(id);
		if (!pending) return;
		this.#pendingDeletes.delete(id);
		this.#deletesInFlight.add(id);
		const result = await this.status
			.run(() => (keepalive ? api.deleteTask(id, { keepalive }) : api.deleteTask(id)), {
				fallbackMessage: m.error_delete_task,
				tracksLoading: false,
				isHandled: isTaskGone
			})
			.finally(() => this.#deletesInFlight.delete(id));
		if (!result.success && !isTaskGone(result)) this.#putBack(pending);
	}

	// Only a task still in the current list is dropped and announced, so a repeated
	// action or a change of user during the request stays silent.
	#dropGoneTask(id: number) {
		if (!this.tasks.some((task) => task.id === id)) return;
		this.tasks = this.tasks.filter((task) => task.id !== id);
		this.#notifications.add(m.notifications_task_gone(), 'info');
	}
}
