import type { ApiFailure, ApiResult } from '$lib/api/client';
import type { NotificationState } from './notification.svelte';
import type { RequestStatus } from './request-status.svelte';

// How long Undo stays offered before the deletion is sent.
export const UNDO_DURATION = 6000;

// What a hidden page does to the deletions still waiting: a task is sent at once (the page is
// still alive, so a request that needs a CORS preflight can finish); a user waits for the return.
export type WhenHidden = 'send' | 'pause';

export interface UndoableDeletesOptions<T extends { id: number }> {
	notifications: NotificationState;
	// The domain's own status: a failed deletion is reported there, never in another feature.
	status: RequestStatus;
	// Sends the deletion; `keepalive` only when the page is being left.
	send: (id: number, options: { keepalive: boolean }) => Promise<ApiResult<void>>;
	// The item no longer exists on the server: an expected outcome, counted as a success.
	isGone: (failure: ApiFailure) => boolean;
	message: (item: T) => string;
	undoLabel: () => string;
	failureMessage: () => string;
	// Puts a restored or refused item back where it was; the owner of the list decides if it fits.
	putBack: (item: T, index: number) => void;
	whenHidden: WhenHidden;
	duration?: number;
}

export interface RemoveHooks {
	// Called once Undo has put the item back.
	onundo?: ((id: number) => void) | undefined;
	// Called once, before the request, when the toast leaves without Undo.
	onleave?: (() => void) | undefined;
}

export interface CommitOptions<T> {
	keepalive?: boolean;
	// Sends only the waiting deletions this accepts, for an action that depends on them alone.
	where?: (item: T) => boolean;
}

interface Pending<T> {
	item: T;
	index: number;
	toastId: string;
}

// Deletions the user can undo for a few seconds. Several can wait at once, whatever the list
// shows: each has its own toast, its own Undo, and is sent once.
export class UndoableDeletes<T extends { id: number }> {
	readonly #options: UndoableDeletesOptions<T>;
	readonly #duration: number;
	// Deletions the user can still undo, by id.
	readonly #pending = new Map<number, Pending<T>>();
	// Deletions sent and not answered yet: the server may still list these items.
	readonly #inFlight = new Set<number>();
	// The page is hidden and this type waits for its return: new deletions wait too.
	#held = false;

	constructor(options: UndoableDeletesOptions<T>) {
		this.#options = options;
		this.#duration = options.duration ?? UNDO_DURATION;
	}

	has(id: number) {
		return this.#pending.has(id);
	}

	isInFlight(id: number) {
		return this.#inFlight.has(id);
	}

	// The items waiting for their deletion to be sent.
	waiting(): T[] {
		return [...this.#pending.values()].map(({ item }) => item);
	}

	// Forgets the waiting deletions this accepts: no request, no failure, the toast just leaves.
	// For items whose deletion is carried by another one.
	discard(where: (item: T) => boolean) {
		for (const { item, toastId } of [...this.#pending.values()]) {
			if (!where(item)) continue;
			this.#pending.delete(item.id);
			this.#options.notifications.remove(toastId, 'action');
		}
	}

	// Starts the wait for an item the caller has already taken out of its list. Returns false,
	// and does nothing, for an item already waiting.
	remove(item: T, index: number, { onundo, onleave }: RemoveHooks = {}) {
		const id = item.id;
		if (this.#pending.has(id)) return false;
		const toastId = this.#options.notifications.add(this.#options.message(item), 'success', {
			duration: this.#duration,
			action: {
				label: this.#options.undoLabel(),
				icon: 'undo',
				run: () => {
					if (this.#restore(id)) onundo?.(id);
				}
			},
			onclose: (reason) => {
				if (reason === 'action') return;
				onleave?.();
				void this.#commit(id);
			}
		});
		this.#pending.set(id, { item, index, toastId });
		if (this.#held) this.#options.notifications.pause(toastId, 'hidden');
		return true;
	}

	// Sends every waiting deletion and closes its toast. Safe to call again: a deletion is sent once.
	async commitPending({ keepalive = false, where }: CommitOptions<T> = {}) {
		const waiting = [...this.#pending.values()].filter(({ item }) => !where || where(item));
		const commits = waiting.map(({ item }) => this.#commit(item.id, { keepalive }));
		for (const { toastId } of waiting) this.#options.notifications.remove(toastId, 'dismissed');
		await Promise.all(commits);
	}

	// The page is hidden: what happens to the waiting deletions depends on the kind of item.
	async onHidden() {
		if (this.#options.whenHidden === 'send') {
			await this.commitPending({ keepalive: true });
			return;
		}
		this.#held = true;
		for (const { toastId } of this.#pending.values()) {
			this.#options.notifications.pause(toastId, 'hidden');
		}
	}

	// The page is visible again: a paused window goes on with the time it had left.
	onVisible() {
		if (this.#options.whenHidden !== 'pause') return;
		this.#held = false;
		for (const { toastId } of this.#pending.values()) {
			this.#options.notifications.resume(toastId, 'hidden');
		}
	}

	#restore(id: number) {
		const pending = this.#pending.get(id);
		if (!pending) return false;
		this.#pending.delete(id);
		this.#options.putBack(pending.item, pending.index);
		return true;
	}

	async #commit(id: number, { keepalive = false }: { keepalive?: boolean } = {}) {
		const pending = this.#pending.get(id);
		if (!pending) return;
		this.#pending.delete(id);
		this.#inFlight.add(id);
		const { status, send, isGone, failureMessage } = this.#options;
		const result = await status
			.run(() => send(id, { keepalive }), {
				fallbackMessage: failureMessage,
				tracksLoading: false,
				isHandled: isGone
			})
			.finally(() => this.#inFlight.delete(id));
		if (!result.success && !isGone(result)) this.#options.putBack(pending.item, pending.index);
	}
}
