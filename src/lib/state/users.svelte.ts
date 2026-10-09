import { api, type User } from '$lib/api/client';
import { m } from '$lib/paraglide/messages';
import type { NotificationState } from './notification.svelte';
import { RequestStatus } from './request-status.svelte';
import type { TaskState } from './tasks.svelte';

// What the list may claim: nothing is known before the first answer.
export type LoadState = 'idle' | 'loading' | 'loaded' | 'failed';

// An email already taken is shown under the email field, so it gets no toast; the other failures
// are reported by their toast.
export type AddUserOutcome =
	{ status: 'created'; user: User } | { status: 'email_taken' } | { status: 'failed' };

export class UserState {
	users = $state.raw<User[]>([]);
	selected = $state.raw<User | null>(null);
	loadState = $state<LoadState>('idle');
	readonly status: RequestStatus;

	readonly #tasks: TaskState;
	#selectionRequest = 0;

	constructor(tasks: TaskState, notifications: NotificationState) {
		this.#tasks = tasks;
		this.status = new RequestStatus(notifications);
	}

	async fetch() {
		this.loadState = 'loading';
		const result = await this.status.run(() => api.getUsers(), {
			fallbackMessage: m.error_fetch_users
		});
		if (result.success) this.users = result.data;
		this.loadState = result.success ? 'loaded' : 'failed';
	}

	async add(name: string, email: string): Promise<AddUserOutcome> {
		const result = await this.status.run(() => api.createUser({ name, email }), {
			fallbackMessage: m.error_create_user,
			isHandled: (failure) => failure.code === 'EMAIL_TAKEN'
		});
		if (result.success) {
			this.users = [...this.users, result.data];
			return { status: 'created', user: result.data };
		}
		return { status: result.code === 'EMAIL_TAKEN' ? 'email_taken' : 'failed' };
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
