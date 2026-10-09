import { createContext } from 'svelte';
import type { Locale } from '$lib/paraglide/runtime';
import { AvailabilityState } from './availability.svelte';
import { LocaleState } from './locale.svelte';
import { NotificationState } from './notification.svelte';
import { TaskOrderState } from './task-order.svelte';
import { TaskState } from './tasks.svelte';
import { UserState } from './users.svelte';

export class AppState {
	readonly locale = new LocaleState();
	readonly notifications = new NotificationState();
	readonly availability = new AvailabilityState(this.notifications);
	readonly taskOrder = new TaskOrderState();
	readonly tasks = new TaskState(this.notifications);
	readonly users = new UserState(this.tasks, this.notifications);

	// Toasts already shown stay in the old language: they expire by themselves.
	changeLocale(locale: Locale) {
		this.locale.set(locale);
	}
}

export const [getAppState, setAppState] = createContext<AppState>();
