import type { NotificationType } from '$lib/state/notification.svelte';

// Whole class names, so Tailwind finds them. Read by `ToastItem` and by the contrast test.
export const TOAST_BACKGROUNDS: Record<NotificationType, string> = {
	success: 'bg-success',
	error: 'bg-danger',
	info: 'bg-info',
	warning: 'bg-warning'
};

// The accent edge of each type, darker than its background so that the type does not rest on hue.
export const TOAST_BORDERS: Record<NotificationType, string> = {
	success: 'border-l-4 border-success-edge',
	error: 'border-l-4 border-danger-edge',
	info: 'border-l-4 border-info-edge',
	warning: 'border-l-4 border-warning-edge'
};

// witness commit (to be reverted)
