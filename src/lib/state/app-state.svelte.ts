import { createContext } from 'svelte';
import type { Locale } from '$lib/paraglide/runtime';
import type { ExplicitTheme } from '$lib/theme/theme';
import { AvailabilityState } from './availability.svelte';
import { LocaleState } from './locale.svelte';
import { NotificationState } from './notification.svelte';
import { ThemeState } from './theme.svelte';
import { TaskFilterState } from './task-filter.svelte';
import { TaskOrderState } from './task-order.svelte';
import { TaskState } from './tasks.svelte';
import { UserState } from './users.svelte';

export class AppState {
	readonly locale = new LocaleState();
	readonly theme: ThemeState;
	readonly notifications = new NotificationState();
	readonly availability = new AvailabilityState(this.notifications);
	readonly taskOrder = new TaskOrderState();
	readonly taskFilter = new TaskFilterState();
	readonly tasks = new TaskState(this.notifications);
	readonly users = new UserState(this.tasks, this.notifications);

	// `theme` is the choice the server rendered from the cookie, null for System.
	constructor(theme: ExplicitTheme | null = null) {
		this.theme = new ThemeState(theme);
	}

	// Stops every timer the state owns. Pending deletions are dropped, not sent.
	destroy() {
		this.availability.destroy();
		this.notifications.destroy();
	}

	// Sends every deletion still waiting, users and tasks, and waits for the answers: for what must
	// not read the server's figures before them (STAT-R01).
	async commitPending(options: { keepalive?: boolean } = {}) {
		await Promise.all([this.users.commitPending(options), this.tasks.commitPending(options)]);
	}

	// Toasts already shown stay in the old language: they expire by themselves.
	changeLocale(locale: Locale) {
		this.locale.set(locale);
	}
}

export const [getAppState, setAppState] = createContext<AppState>();
