import { api, type ApiFailure, type ErrorCode, type Task } from '$lib/api/client';
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

	constructor(notifications: NotificationState) {
		this.#notifications = notifications;
		this.status = new RequestStatus(notifications);
	}

	clear() {
		this.tasks = [];
	}

	async load(userId: number, isCurrent: () => boolean) {
		const result = await this.status.run(() => api.getUserTasks(userId), {
			fallbackMessage: 'Failed to fetch tasks',
			isCurrent
		});
		if (result.success && isCurrent()) this.tasks = result.data;
	}

	async add(title: string, description: string, userId: number) {
		const result = await this.status.run(
			() => api.createTask({ title, description, user_id: userId, completed: false }),
			{ fallbackMessage: 'Failed to create task' }
		);
		if (!result.success) return undefined;
		this.tasks = [...this.tasks, result.data];
		return result.data;
	}

	// Returns false on failure so the caller can reset the checkbox: a one-way
	// `checked` binding does not rewrite an unchanged value.
	async toggle(id: number, completed: boolean): Promise<boolean> {
		const result = await this.status.run(() => api.updateTask(id, { completed }), {
			fallbackMessage: 'Failed to update task',
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
			fallbackMessage: 'Failed to update task',
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
			fallbackMessage: 'Failed to delete task',
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
		this.#notifications.add('Task already deleted', 'info');
	}
}
