import { api, type User } from '$lib/api/client';
import { m } from '$lib/paraglide/messages';
import type { NotificationState } from './notification.svelte';
import { RequestStatus } from './request-status.svelte';
import type { TaskState } from './tasks.svelte';

export class UserState {
	users = $state.raw<User[]>([]);
	selected = $state.raw<User | null>(null);
	readonly status: RequestStatus;

	readonly #tasks: TaskState;
	#selectionRequest = 0;

	constructor(tasks: TaskState, notifications: NotificationState) {
		this.#tasks = tasks;
		this.status = new RequestStatus(notifications);
	}

	async fetch() {
		const result = await this.status.run(() => api.getUsers(), {
			fallbackMessage: m.error_fetch_users
		});
		if (result.success) this.users = result.data;
	}

	async add(name: string, email: string) {
		const result = await this.status.run(() => api.createUser({ name, email }), {
			fallbackMessage: m.error_create_user
		});
		if (!result.success) return undefined;
		this.users = [...this.users, result.data];
		return result.data;
	}

	async select(id: number) {
		const requestId = ++this.#selectionRequest;
		const isCurrent = () => requestId === this.#selectionRequest;
		this.selected = null;
		this.#tasks.clear(id);
		const result = await this.status.run(() => api.getUser(id), {
			fallbackMessage: m.error_fetch_user,
			isCurrent
		});
		if (!result.success || !isCurrent()) return;
		this.selected = result.data;
		// Selecting a user also loads their tasks, owned by the tasks feature.
		await this.#tasks.load(id, isCurrent);
	}
}
