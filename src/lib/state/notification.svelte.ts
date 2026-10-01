export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
	id: string;
	message: string;
	type: NotificationType;
	duration?: number;
}

export const ERROR_NOTIFICATION_DURATION = 6000;

interface DismissTimer {
	timeout: ReturnType<typeof setTimeout> | null;
	remaining: number;
	startedAt: number;
}

export class NotificationState {
	items = $state.raw<Notification[]>([]);
	alerts = $derived(this.items.filter((notification) => notification.type === 'error'));
	statuses = $derived(this.items.filter((notification) => notification.type !== 'error'));

	// Timers are never rendered: a plain Map is enough, reactivity would only add cost.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#timers = new Map<string, DismissTimer>();
	#lastId = 0;

	add(message: string, type: NotificationType = 'info', duration = 3000) {
		const id = `notif-${++this.#lastId}`;
		this.items = [...this.items, { id, message, type, duration }];
		if (duration) this.#startTimer(id, duration);
		return id;
	}

	notifyError(message: string) {
		return this.add(message, 'error', ERROR_NOTIFICATION_DURATION);
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
