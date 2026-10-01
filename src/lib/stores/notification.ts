import { writable } from 'svelte/store';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
	id: string;
	message: string;
	type: NotificationType;
	duration?: number;
}

export const notifications = writable<Notification[]>([]);

interface DismissTimer {
	timeout: ReturnType<typeof setTimeout> | null;
	remaining: number;
	startedAt: number;
}

const timers = new Map<string, DismissTimer>();

let id = 0;

function startTimer(notificationId: string, remaining: number) {
	const timeout = setTimeout(() => {
		removeNotification(notificationId);
	}, remaining);
	timers.set(notificationId, { timeout, remaining, startedAt: Date.now() });
}

export function addNotification(message: string, type: NotificationType = 'info', duration = 3000) {
	const notifId = `notif-${++id}`;
	const notification: Notification = { id: notifId, message, type, duration };

	notifications.update((n) => [...n, notification]);

	if (duration) startTimer(notifId, duration);

	return notifId;
}

export const ERROR_NOTIFICATION_DURATION = 6000;

export function notifyError(message: string) {
	return addNotification(message, 'error', ERROR_NOTIFICATION_DURATION);
}

// Pausing keeps the time left, so a toast read with the mouse or the keyboard
// stays long enough (WCAG 2.2.1).
export function pauseNotification(notificationId: string) {
	const timer = timers.get(notificationId);
	if (!timer?.timeout) return;
	clearTimeout(timer.timeout);
	timers.set(notificationId, {
		timeout: null,
		remaining: Math.max(0, timer.remaining - (Date.now() - timer.startedAt)),
		startedAt: 0
	});
}

export function resumeNotification(notificationId: string) {
	const timer = timers.get(notificationId);
	if (!timer || timer.timeout) return;
	startTimer(notificationId, timer.remaining);
}

export function removeNotification(notificationId: string) {
	const timer = timers.get(notificationId);
	if (timer?.timeout) clearTimeout(timer.timeout);
	timers.delete(notificationId);
	notifications.update((n) => n.filter((notif) => notif.id !== notificationId));
}
