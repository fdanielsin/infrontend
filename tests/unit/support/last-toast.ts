import type { AppState } from '$lib/state/app-state.svelte';

// The message of the newest toast: a request error has no other surface.
export function lastToast(app: AppState): string | null {
	return app.notifications.items.at(-1)?.message ?? null;
}
