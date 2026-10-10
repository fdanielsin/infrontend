import { DEFAULT_TASK_FILTER, isTaskFilter, type TaskFilter } from './task-filter';

export const TASK_FILTER_STORAGE_KEY = 'indrive.task-filter';

// The choice is a convenience of this browser: when the storage is missing, refused or holds
// anything else than a known filter, every task is shown and nothing is reported.
export class TaskFilterState {
	current = $state<TaskFilter>(DEFAULT_TASK_FILTER);

	constructor() {
		try {
			const stored = localStorage.getItem(TASK_FILTER_STORAGE_KEY);
			if (isTaskFilter(stored)) this.current = stored;
		} catch {
			// No storage on the server, or refused in the browser.
		}
	}

	set(filter: TaskFilter) {
		this.current = filter;
		try {
			localStorage.setItem(TASK_FILTER_STORAGE_KEY, filter);
		} catch {
			// The choice only lasts for this visit.
		}
	}
}
