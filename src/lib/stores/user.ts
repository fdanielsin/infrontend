// src/lib/stores/user.ts
import { writable, derived } from 'svelte/store';
import { api, type User, type Task } from '$lib/api/client';

export const users = writable<User[]>([]);
export const loading = writable(false);
export const error = writable<string | null>(null);
export const selectedUser = writable<User | null>(null);
export const userTasks = writable<Task[]>([]);

export async function fetchUsers() {
	loading.set(true);
	error.set(null);
	try {
		const response = await api.getUsers();
		if (response.success && response.data) {
			users.set(response.data);
		} else {
			error.set(response.error || 'Failed to fetch users');
		}
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
	} finally {
		loading.set(false);
	}
}

export async function addUser(name: string, email: string) {
	loading.set(true);
	error.set(null);
	try {
		const response = await api.createUser({ name, email });
		if (response.success && response.data) {
			users.update(u => [...u, response.data!]);
			return response.data;
		} else {
			error.set(response.error || 'Failed to create user');
		}
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
	} finally {
		loading.set(false);
	}
}

export async function selectUser(id: number) {
	loading.set(true);
	error.set(null);
	try {
		const response = await api.getUser(id);
		if (response.success && response.data) {
			selectedUser.set(response.data);
			await fetchUserTasks(id);
		} else {
			error.set(response.error || 'Failed to fetch user');
		}
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
	} finally {
		loading.set(false);
	}
}

export async function fetchUserTasks(userId: number) {
	try {
		const response = await api.getUserTasks(userId);
		if (response.success && response.data) {
			userTasks.set(response.data);
		} else {
			error.set(response.error || 'Failed to fetch tasks');
		}
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
	}
}

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
			userTasks.update(t => [...t, response.data!]);
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

export async function toggleTask(id: number, completed: boolean) {
	try {
		const response = await api.updateTask(id, { completed });
		if (response.success) {
			userTasks.update(tasks =>
				tasks.map(t => (t.id === id ? { ...t, completed } : t))
			);
		} else {
			error.set(response.error || 'Failed to update task');
		}
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
	}
}

export async function removeTask(id: number) {
	try {
		const response = await api.deleteTask(id);
		if (response.success) {
			userTasks.update(tasks => tasks.filter(t => t.id !== id));
		} else {
			error.set(response.error || 'Failed to delete task');
		}
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
	}
}
