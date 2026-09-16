// src/lib/stores/notification.ts
import { writable } from 'svelte/store';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
	id: string;
	message: string;
	type: NotificationType;
	duration?: number;
}

export const notifications = writable<Notification[]>([]);

let id = 0;

export function addNotification(message: string, type: NotificationType = 'info', duration = 3000) {
	const notifId = `notif-${++id}`;
	const notification: Notification = { id: notifId, message, type, duration };

	notifications.update(n => [...n, notification]);

	if (duration) {
		setTimeout(() => {
			removeNotification(notifId);
		}, duration);
	}

	return notifId;
}

export function removeNotification(id: string) {
	notifications.update(n => n.filter(notif => notif.id !== id));
}
