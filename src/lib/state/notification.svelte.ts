import type { IconName } from '$lib/ui/icons';
import { m } from '$lib/paraglide/messages';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

// Why a toast left: its button was pressed, the user closed it, or its time ran out.
export type CloseReason = 'action' | 'dismissed' | 'expired';

// A button in the toast. The label arrives translated, like every text shown.
export interface ToastAction {
	label: string;
	// A decorative icon before the label, which stays visible.
	icon?: IconName;
	run: () => void;
}

export interface Notification {
	id: string;
	message: string;
	type: NotificationType;
	duration?: number;
	// A server-side reference the user can copy for a support request.
	reference?: string;
	action?: ToastAction;
}

export interface ErrorOptions {
	// A server-side reference the user can copy for a support request.
	reference?: string | undefined;
	// Stays until closed, instead of leaving after ERROR_NOTIFICATION_DURATION.
	persistent?: boolean;
}

export interface ToastOptions {
	// Milliseconds before the toast leaves by itself; 0 keeps it until it is closed.
	duration?: number;
	reference?: string | undefined;
	action?: ToastAction;
	// Called once, after the toast has left, whatever the reason.
	onclose?: (reason: CloseReason) => void;
}

const DEFAULT_DURATION = 3000;
const PERSISTENT = 0;

export const ERROR_NOTIFICATION_DURATION = 6000;
// More than this many toasts would cover the page: the others wait, in arrival order. A toast with
// an action (an undo window) is never made to wait, and persistent errors take their places.
export const MAX_VISIBLE_TOASTS = 3;
// Long enough for a screen reader to read it; short enough not to leave a stale sentence for a
// reader browsing the page.
export const ANNOUNCEMENT_LIFETIME = 10_000;

// `id` changes with each announcement, so that the same text is rendered, and read, again.
export interface Announcement {
	id: number;
	message: string;
}

interface DismissTimer {
	timeout: ReturnType<typeof setTimeout> | null;
	remaining: number;
	startedAt: number;
}

function visibleToasts(items: Notification[]): Notification[] {
	let places = MAX_VISIBLE_TOASTS;
	return items.filter((notification) => notification.action || places-- > 0);
}

export class NotificationState {
	// Everything not yet closed, the queue included; `shown` is what is on screen.
	items = $state.raw<Notification[]>([]);
	shown = $derived(visibleToasts(this.items));
	alerts = $derived(this.shown.filter((notification) => notification.type === 'error'));
	statuses = $derived(this.shown.filter((notification) => notification.type !== 'error'));

	// Low-severity news with no surface: held for the live region of the notification area, which
	// is hidden from sight. Nothing is shown, so nothing can cover a control.
	announcement = $state.raw<Announcement | null>(null);

	// Timers are never rendered: a plain Map is enough, reactivity would only add cost.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#timers = new Map<string, DismissTimer>();
	// Callbacks are not part of the item: the state only needs to read what is shown.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#closeCallbacks = new Map<string, (reason: CloseReason) => void>();
	#lastId = 0;
	#lastAnnouncementId = 0;
	#announcementTimeout: ReturnType<typeof setTimeout> | undefined;

	add(message: string, type: NotificationType = 'info', options: ToastOptions = {}) {
		const { duration = DEFAULT_DURATION, reference, action, onclose } = options;
		const id = `notif-${++this.#lastId}`;
		this.items = [
			...this.items,
			{ id, message, type, duration, ...(reference && { reference }), ...(action && { action }) }
		];
		if (onclose) this.#closeCallbacks.set(id, onclose);
		this.#startTimersOfShown();
		return id;
	}

	// The action runs once, then the toast leaves; if it throws, the toast leaves all the same
	// and the error goes on to the caller.
	runAction(id: string) {
		const action = this.items.find((notification) => notification.id === id)?.action;
		if (!action) return;
		try {
			action.run();
		} finally {
			this.remove(id, 'action');
		}
	}

	announce(message: string) {
		clearTimeout(this.#announcementTimeout);
		this.announcement = { id: ++this.#lastAnnouncementId, message };
		this.#announcementTimeout = setTimeout(() => (this.announcement = null), ANNOUNCEMENT_LIFETIME);
	}

	// The area that reads the announcement is leaving: its timer must not write later.
	clearAnnouncement() {
		clearTimeout(this.#announcementTimeout);
		this.announcement = null;
	}

	// A persistent error has no end of its own. The same one is not shown twice at once (a list that
	// retries would pile them up); two answers with different references stay apart.
	notifyError(message: string, { reference, persistent = false }: ErrorOptions = {}) {
		if (!persistent) {
			return this.add(message, 'error', { duration: ERROR_NOTIFICATION_DURATION, reference });
		}
		const shown = this.items.find(
			(notification) =>
				notification.type === 'error' &&
				notification.duration === PERSISTENT &&
				notification.message === message &&
				notification.reference === reference
		);
		return shown?.id ?? this.add(message, 'error', { duration: PERSISTENT, reference });
	}

	// The confirmation is a status toast, announced politely; the reference stays selectable
	// where the clipboard is refused.
	async copyReference(reference: string) {
		try {
			await navigator.clipboard.writeText(reference);
			this.add(m.reference_copied(), 'success');
		} catch {
			this.add(m.reference_copy_failed(), 'warning');
		}
	}

	// Pausing keeps the time left, so a toast read with the mouse or the keyboard
	// stays long enough (WCAG 2.2.1).
	pause(id: string) {
		const timer = this.#timers.get(id);
		if (!timer?.timeout) return;
		clearTimeout(timer.timeout);
		this.#timers.set(id, {
			timeout: null,
			remaining: Math.max(0, timer.remaining - (Date.now() - timer.startedAt)),
			startedAt: 0
		});
	}

	resume(id: string) {
		const timer = this.#timers.get(id);
		if (!timer || timer.timeout) return;
		this.#startTimer(id, timer.remaining);
	}

	// The toast has left when its callback runs, so that the callback can notify in turn.
	remove(id: string, reason: CloseReason = 'dismissed') {
		const timer = this.#timers.get(id);
		if (timer?.timeout) clearTimeout(timer.timeout);
		this.#timers.delete(id);
		this.items = this.items.filter((notification) => notification.id !== id);
		this.#startTimersOfShown();
		const onclose = this.#closeCallbacks.get(id);
		this.#closeCallbacks.delete(id);
		onclose?.(reason);
	}

	// A toast that waits has no timer: it must not expire before anyone has seen it.
	#startTimersOfShown() {
		for (const { id, duration } of visibleToasts(this.items)) {
			if (duration && !this.#timers.has(id)) this.#startTimer(id, duration);
		}
	}

	#startTimer(id: string, remaining: number) {
		const timeout = setTimeout(() => this.remove(id, 'expired'), remaining);
		this.#timers.set(id, { timeout, remaining, startedAt: Date.now() });
	}
}
