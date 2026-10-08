import { api, type ApiFailure, type ErrorCode, type Task } from '$lib/api/client';
import { m } from '$lib/paraglide/messages';
import type { NotificationState } from './notification.svelte';
import { RequestStatus } from './request-status.svelte';

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

	constructor(notifications: NotificationState) {
		this.#notifications = notifications;
		this.status = new RequestStatus(notifications);
	}

	// Empties the list for the user being selected, and makes him its owner from now on.
	clear(ownerId: number | null = null) {
		this.tasks = [];
		this.#listOwnerId = ownerId;
	}

	async load(userId: number, isCurrent: () => boolean) {
		const result = await this.status.run(() => api.getUserTasks(userId), {
			fallbackMessage: m.error_fetch_tasks,
			isCurrent
		});
		if (result.success && isCurrent()) {
			this.tasks = result.data;
			this.#listOwnerId = userId;
		}
	}

	async add(title: string, description: string, userId: number) {
		const result = await this.status.run(
			() => api.createTask({ title, description, user_id: userId, completed: false }),
			{ fallbackMessage: m.error_create_task }
		);
		if (!result.success) return undefined;
		if (this.#listOwnerId === null || this.#listOwnerId === userId) {
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

	async remove(id: number) {
		const result = await this.status.run(() => api.deleteTask(id), {
			fallbackMessage: m.error_delete_task,
			tracksLoading: false,
			isHandled: isTaskGone
		});
		if (result.success) this.tasks = this.tasks.filter((task) => task.id !== id);
		else if (isTaskGone(result)) this.#dropGoneTask(id);
	}

	// Only a task still in the current list is dropped and announced, so a repeated
	// action or a change of user during the request stays silent.
	#dropGoneTask(id: number) {
		if (!this.tasks.some((task) => task.id === id)) return;
		this.tasks = this.tasks.filter((task) => task.id !== id);
		this.#notifications.add(m.notifications_task_gone(), 'info');
	}
}
