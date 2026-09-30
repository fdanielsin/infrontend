import { writable } from 'svelte/store';
import { api, type User } from '$lib/api/client';
import { loadUserTasks, userTasks } from '$lib/features/tasks/store';
import { createRequestStatus } from '$lib/stores/request-status';

export const users = writable<User[]>([]);
export const selectedUser = writable<User | null>(null);
export const usersStatus = createRequestStatus();

let selectionRequest = 0;

export async function fetchUsers() {
	const result = await usersStatus.run(() => api.getUsers(), {
		fallbackMessage: 'Failed to fetch users'
	});
	if (result.success) users.set(result.data);
}

export async function addUser(name: string, email: string) {
	const result = await usersStatus.run(() => api.createUser({ name, email }), {
		fallbackMessage: 'Failed to create user'
	});
	if (!result.success) return undefined;
	users.update((list) => [...list, result.data]);
	return result.data;
}

export async function selectUser(id: number) {
	const requestId = ++selectionRequest;
	const isCurrent = () => requestId === selectionRequest;
	selectedUser.set(null);
	userTasks.set([]);
	const result = await usersStatus.run(() => api.getUser(id), {
		fallbackMessage: 'Failed to fetch user',
		isCurrent
	});
	if (!result.success || !isCurrent()) return;
	selectedUser.set(result.data);
	// Selecting a user also loads their tasks, owned by the tasks feature.
	await loadUserTasks(id, isCurrent);
}
