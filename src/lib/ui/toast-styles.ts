import type { NotificationType } from '$lib/state/notification.svelte';

// Whole class names, so Tailwind finds them. Read by `ToastItem` and by the contrast test.
export const TOAST_BACKGROUNDS: Record<NotificationType, string> = {
	success: 'bg-success',
	error: 'bg-danger',
	info: 'bg-info',
	warning: 'bg-warning'
};
