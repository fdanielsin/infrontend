import { m } from '$lib/paraglide/messages';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
	id: string;
	message: string;
	type: NotificationType;
	duration?: number;
	// A server-side reference the user can copy for a support request.
	reference?: string;
}

export const ERROR_NOTIFICATION_DURATION = 6000;
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

export class NotificationState {
	items = $state.raw<Notification[]>([]);
	alerts = $derived(this.items.filter((notification) => notification.type === 'error'));
	statuses = $derived(this.items.filter((notification) => notification.type !== 'error'));

	// Low-severity news with no surface: held for the live region of the notification area, which
	// is hidden from sight. Nothing is shown, so nothing can cover a control.
	announcement = $state.raw<Announcement | null>(null);

	// Timers are never rendered: a plain Map is enough, reactivity would only add cost.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#timers = new Map<string, DismissTimer>();
	#lastId = 0;
	#lastAnnouncementId = 0;
	#announcementTimeout: ReturnType<typeof setTimeout> | undefined;

	add(message: string, type: NotificationType = 'info', duration = 3000, reference?: string) {
		const id = `notif-${++this.#lastId}`;
		this.items = [...this.items, { id, message, type, duration, ...(reference && { reference }) }];
		if (duration) this.#startTimer(id, duration);
		return id;
	}

	announce(message: string) {
		clearTimeout(this.#announcementTimeout);
		this.announcement = { id: ++this.#lastAnnouncementId, message };
		this.#announcementTimeout = setTimeout(() => (this.announcement = null), ANNOUNCEMENT_LIFETIME);
	}

	notifyError(message: string, reference?: string) {
		return this.add(message, 'error', ERROR_NOTIFICATION_DURATION, reference);
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

	remove(id: string) {
		const timer = this.#timers.get(id);
		if (timer?.timeout) clearTimeout(timer.timeout);
		this.#timers.delete(id);
		this.items = this.items.filter((notification) => notification.id !== id);
	}

	#startTimer(id: string, remaining: number) {
		const timeout = setTimeout(() => this.remove(id), remaining);
		this.#timers.set(id, { timeout, remaining, startedAt: Date.now() });
	}
}
