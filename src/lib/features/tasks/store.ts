import { writable } from 'svelte/store';
import { api, type Task } from '$lib/api/client';
import { error, loading } from '$lib/stores/request-status';

export const userTasks = writable<Task[]>([]);

export async function addTask(title: string, description: string, userId: number) {
	loading.set(true);
	error.set(null);
	try {
		const response = await api.createTask({
			title,
			description,
			user_id: userId,
			completed: false
		});
		if (response.success && response.data) {
			userTasks.update((t) => [...t, response.data!]);
			return response.data;
		} else {
			error.set(response.error || 'Failed to create task');
		}
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
	} finally {
		loading.set(false);
	}
}

// Returns false on failure so the caller can reset the checkbox: a one-way
// `checked` binding does not rewrite an unchanged value.
export async function toggleTask(id: number, completed: boolean): Promise<boolean> {
	try {
		const response = await api.updateTask(id, { completed });
		if (response.success) {
			userTasks.update((tasks) => tasks.map((t) => (t.id === id ? { ...t, completed } : t)));
			return true;
		}
		error.set(response.error || 'Failed to update task');
		return false;
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
		return false;
	}
}

export async function editTask(id: number, title: string, description: string) {
	loading.set(true);
	error.set(null);
	try {
		const response = await api.updateTask(id, { title, description });
		if (response.success) {
			userTasks.update((tasks) =>
				tasks.map((task) => (task.id === id ? { ...task, title, description } : task))
			);
			return true;
		}
		error.set(response.error || 'Failed to update task');
		return false;
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
		return false;
	} finally {
		loading.set(false);
	}
}

export async function removeTask(id: number) {
	try {
		const response = await api.deleteTask(id);
		if (response.success) {
			userTasks.update((tasks) => tasks.filter((t) => t.id !== id));
		} else {
			error.set(response.error || 'Failed to delete task');
		}
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
	}
}
