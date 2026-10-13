import { api, type ApiFailure, type ErrorCode, type User } from '$lib/api/client';
import { m } from '$lib/paraglide/messages';
import type { NotificationState } from './notification.svelte';
import { RequestStatus } from './request-status.svelte';
import type { TaskState } from './tasks.svelte';
import { UndoableDeletes, type CommitOptions, type RemoveHooks } from './undoable-deletes';

const USER_NOT_FOUND: ErrorCode = 'USER_NOT_FOUND';

// The user no longer exists on the server: an expected outcome, not an error.
function isUserGone(failure: ApiFailure) {
	return failure.code === USER_NOT_FOUND;
}

// After a deletion, the other Delete buttons ignore clicks for this long: the neighbouring row
// has just moved under the pointer (USER-R21).
export const DELETE_GUARD_MS = 500;

// Emails are unique whatever their case, and a trailing space is trimmed (USER-R04).
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Where an action on a missing user came from, so the focus can go back to the right title.
export interface GoneNotice {
	id: number;
	from: 'list' | 'panel';
	// Changes with each notice, so that the same user twice is a new event.
	seq: number;
}

export type SelectOutcome = 'selected' | 'gone' | 'failed' | 'ignored';
export type RenameOutcome = 'renamed' | 'gone' | 'failed' | 'ignored';

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
	// The last user found deleted elsewhere, for the screen to place the focus.
	gone = $state.raw<GoneNotice | null>(null);
	readonly status: RequestStatus;

	readonly #tasks: TaskState;
	readonly #notifications: NotificationState;
	// A user deleted on screen waits for a page that is hidden: the return resumes the window.
	readonly #deletes: UndoableDeletes<User>;
	// Users deleted on screen, waiting or sent. Ids are never reused (USER-R16), so an answer that
	// comes late, or a list that is reloaded, cannot bring one back; Undo or a refusal releases it.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	readonly #removed = new Set<number>();
	#lastRemovalAt = Number.NEGATIVE_INFINITY;
	#selectionRequest = 0;
	#requestedId: number | null = null;
	#goneSeq = 0;

	constructor(tasks: TaskState, notifications: NotificationState) {
		this.#tasks = tasks;
		this.#notifications = notifications;
		this.status = new RequestStatus(notifications);
		this.#tasks.onUserGone = (userId) => this.#handleGone(userId, 'panel');
		this.#deletes = new UndoableDeletes<User>({
			notifications,
			status: this.status,
			send: (id, { keepalive }) =>
				keepalive ? api.deleteUser(id, { keepalive }) : api.deleteUser(id),
			isGone: isUserGone,
			message: (user) => m.users_deleted_named({ name: user.name }),
			undoLabel: m.users_undo_delete,
			failureMessage: m.error_delete_user,
			fixedFailureMessage: true,
			putBack: (user) => this.#putBack(user),
			whenHidden: 'pause'
		});
	}

	async fetch() {
		this.loadState = 'loading';
		const result = await this.status.run(() => api.getUsers(), {
			fallbackMessage: m.error_fetch_users
		});
		if (result.success) this.users = result.data.filter((user) => !this.#removed.has(user.id));
		this.loadState = result.success ? 'loaded' : 'failed';
	}

	async add(name: string, email: string): Promise<AddUserOutcome> {
		// The email of a user waiting for his deletion is free only once it is sent (USER-R16).
		if (this.#deletes.waiting().some((user) => sameEmail(user.email, email))) {
			await this.#deletes.commitPending({ where: (user) => sameEmail(user.email, email) });
			// A refused deletion brought the user back: the email is not free, nothing is created.
			if (this.users.some((user) => sameEmail(user.email, email))) return { status: 'failed' };
		}
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

	async select(id: number): Promise<SelectOutcome> {
		const requestId = ++this.#selectionRequest;
		const isCurrent = () => requestId === this.#selectionRequest;
		this.#requestedId = id;
		this.selected = null;
		this.#tasks.clear(id);
		const result = await this.status.run(() => api.getUser(id), {
			fallbackMessage: m.error_fetch_user,
			isCurrent,
			isHandled: isUserGone
		});
		if (!isCurrent()) return 'ignored';
		if (!result.success) {
			if (!isUserGone(result)) return 'failed';
			this.#handleGone(id, 'list');
			return 'gone';
		}
		this.selected = result.data;
		// Selecting a user also loads their tasks, owned by the tasks feature.
		await this.#tasks.load(id, isCurrent);
		return 'selected';
	}

	// Only the name changes (USER-R18). The answer of a user deleted meanwhile is ignored (USER-R24).
	async rename(id: number, name: string): Promise<RenameOutcome> {
		const result = await this.status.run(() => api.updateUser(id, { name }), {
			fallbackMessage: m.error_update_user,
			tracksLoading: false,
			isCurrent: () => !this.#removed.has(id),
			isHandled: isUserGone
		});
		if (this.#removed.has(id)) return 'ignored';
		if (!result.success) {
			if (!isUserGone(result)) return 'failed';
			this.#handleGone(id, 'list');
			return 'gone';
		}
		this.users = this.users.map((user) => (user.id === id ? result.data : user));
		if (this.selected?.id === id) this.selected = result.data;
		return 'renamed';
	}

	// The user leaves the list at once and his deletion waits for the end of the toast: Undo puts
	// him back without any request (USER-R19). False when nothing was done: unknown, already waiting,
	// or too soon after another deletion (USER-R21).
	remove(id: number, hooks: RemoveHooks = {}): boolean {
		const index = this.users.findIndex((user) => user.id === id);
		const user = this.users[index];
		if (!user || this.#deletes.has(id)) return false;
		if (Date.now() - this.#lastRemovalAt < DELETE_GUARD_MS) return false;
		this.#lastRemovalAt = Date.now();
		this.#removed.add(id);
		this.users = this.users.filter((listed) => listed.id !== id);
		// His waiting task deletions, and every answer still on its way for him, follow him.
		this.#tasks.discardPendingFor(id);
		if (this.selected?.id === id || this.#requestedId === id) this.#unselect();
		this.#deletes.remove(user, index, hooks);
		return true;
	}

	// Sends every waiting deletion and closes its toast. Safe to call again: a deletion is sent once.
	commitPending(options: CommitOptions<User> = {}) {
		return this.#deletes.commitPending(options);
	}

	// The screen takes the notice once: it places the focus where the action came from.
	consumeGone(from: GoneNotice['from']): boolean {
		if (this.gone?.from !== from) return false;
		this.gone = null;
		return true;
	}

	onHidden() {
		return this.#deletes.onHidden();
	}

	onVisible() {
		this.#deletes.onVisible();
	}

	#unselect() {
		++this.#selectionRequest;
		this.selected = null;
		this.#tasks.closeList();
	}

	// Back in the list in the order of the server, which is the order of creation (USER-R05).
	#putBack(user: User) {
		this.#removed.delete(user.id);
		if (this.users.some((listed) => listed.id === user.id)) return;
		const at = this.users.findIndex((listed) => listed.id > user.id);
		const users = [...this.users];
		users.splice(at === -1 ? users.length : at, 0, user);
		this.users = users;
	}

	// The server says the user does not exist: he leaves the list; he is unselected only if he was
	// the selection; the news is told only if he was still shown, and never as an error (USER-R23).
	#handleGone(id: number, from: GoneNotice['from']) {
		const shown = this.users.some((user) => user.id === id);
		if (shown) this.users = this.users.filter((user) => user.id !== id);
		if (this.selected?.id === id || this.#requestedId === id) this.#unselect();
		if (!shown) return;
		this.#notifications.add(m.users_gone(), 'info');
		this.gone = { id, from, seq: ++this.#goneSeq };
	}
}
