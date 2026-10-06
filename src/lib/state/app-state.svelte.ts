import { createContext } from 'svelte';
import type { Locale } from '$lib/paraglide/runtime';
import { AvailabilityState } from './availability.svelte';
import { LocaleState } from './locale.svelte';
import { NotificationState } from './notification.svelte';
import { TaskState } from './tasks.svelte';
import { UserState } from './users.svelte';

export class AppState {
	readonly locale = new LocaleState();
	readonly notifications = new NotificationState();
	readonly availability = new AvailabilityState(this.notifications);
	readonly tasks = new TaskState(this.notifications);
	readonly users = new UserState(this.tasks, this.notifications);

	// Errors already shown stay in the old language: they are cleared, toasts expire by themselves.
	changeLocale(locale: Locale) {
		this.locale.set(locale);
		this.users.status.error = null;
		this.tasks.status.error = null;
	}
}

export const [getAppState, setAppState] = createContext<AppState>();
