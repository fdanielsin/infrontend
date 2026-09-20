import { api } from '$lib/api/client';
import {
	addUser,
	error,
	fetchUserTasks,
	fetchUsers,
	loading,
	selectUser,
	selectedUser,
	userTasks,
	users
} from '$lib/features/users/store';

export {
	addUser,
	error,
	fetchUserTasks,
	fetchUsers,
	loading,
	selectUser,
	selectedUser,
	userTasks,
	users
};

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

export async function toggleTask(id: number, completed: boolean) {
	try {
		const response = await api.updateTask(id, { completed });
		if (response.success) {
			userTasks.update((tasks) => tasks.map((t) => (t.id === id ? { ...t, completed } : t)));
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
			userTasks.update((tasks) => tasks.filter((t) => t.id !== id));
		} else {
			error.set(response.error || 'Failed to delete task');
		}
	} catch (err) {
		error.set(err instanceof Error ? err.message : 'Unknown error');
	}
}
