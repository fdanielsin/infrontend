import { writable } from 'svelte/store';
import { api, type Task } from '$lib/api/client';
import { createRequestStatus } from '$lib/stores/request-status';

export const userTasks = writable<Task[]>([]);
export const tasksStatus = createRequestStatus();

export async function loadUserTasks(userId: number, isCurrent: () => boolean) {
	const result = await tasksStatus.run(() => api.getUserTasks(userId), {
		fallbackMessage: 'Failed to fetch tasks',
		isCurrent
	});
	if (result.success && isCurrent()) userTasks.set(result.data);
}

export async function addTask(title: string, description: string, userId: number) {
	const result = await tasksStatus.run(
		() => api.createTask({ title, description, user_id: userId, completed: false }),
		{ fallbackMessage: 'Failed to create task' }
	);
	if (!result.success) return undefined;
	userTasks.update((tasks) => [...tasks, result.data]);
	return result.data;
}

// Returns false on failure so the caller can reset the checkbox: a one-way
// `checked` binding does not rewrite an unchanged value.
export async function toggleTask(id: number, completed: boolean): Promise<boolean> {
	const result = await tasksStatus.run(() => api.updateTask(id, { completed }), {
		fallbackMessage: 'Failed to update task',
		tracksLoading: false
	});
	if (!result.success) return false;
	userTasks.update((tasks) => tasks.map((t) => (t.id === id ? { ...t, completed } : t)));
	return true;
}

export async function editTask(id: number, title: string, description: string) {
	const result = await tasksStatus.run(() => api.updateTask(id, { title, description }), {
		fallbackMessage: 'Failed to update task'
	});
	if (!result.success) return false;
	userTasks.update((tasks) =>
		tasks.map((task) => (task.id === id ? { ...task, title, description } : task))
	);
	return true;
}

export async function removeTask(id: number) {
	const result = await tasksStatus.run(() => api.deleteTask(id), {
		fallbackMessage: 'Failed to delete task',
		tracksLoading: false
	});
	if (result.success) userTasks.update((tasks) => tasks.filter((t) => t.id !== id));
}
