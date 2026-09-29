import { writable } from 'svelte/store';
import { api, type User } from '$lib/api/client';
import { userTasks } from '$lib/features/tasks/store';
import { error, loading } from '$lib/stores/request-status';

export const users = writable<User[]>([]);
export const selectedUser = writable<User | null>(null);

let selectionRequest = 0;

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
			users.update((u) => [...u, response.data!]);
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
	// Selecting a user also loads their tasks, owned by the tasks feature.
	const requestId = ++selectionRequest;
	loading.set(true);
	error.set(null);
	try {
		const response = await api.getUser(id);
		if (requestId !== selectionRequest) return;
		if (response.success && response.data) {
			selectedUser.set(response.data);
			const tasksResponse = await api.getUserTasks(id);
			if (requestId !== selectionRequest) return;
			if (tasksResponse.success && tasksResponse.data) {
				userTasks.set(tasksResponse.data);
			} else {
				error.set(tasksResponse.error || 'Failed to fetch tasks');
			}
		} else {
			error.set(response.error || 'Failed to fetch user');
		}
	} catch (err) {
		if (requestId === selectionRequest) {
			error.set(err instanceof Error ? err.message : 'Unknown error');
		}
	} finally {
		if (requestId === selectionRequest) loading.set(false);
	}
}
