import { createContext } from 'svelte';
import { NotificationState } from './notification.svelte';
import { TaskState } from './tasks.svelte';
import { UserState } from './users.svelte';

export class AppState {
	readonly notifications = new NotificationState();
	readonly tasks = new TaskState(this.notifications);
	readonly users = new UserState(this.tasks, this.notifications);
}

export const [getAppState, setAppState] = createContext<AppState>();
