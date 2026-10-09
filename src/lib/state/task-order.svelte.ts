import { DEFAULT_TASK_ORDER, isTaskOrder, type TaskOrder } from './task-order';

export const TASK_ORDER_STORAGE_KEY = 'indrive.task-order';

// The choice is a convenience of this browser: when the storage is missing, refused or holds
// anything else than a known order, the default order is used and nothing is reported.
export class TaskOrderState {
	current = $state<TaskOrder>(DEFAULT_TASK_ORDER);

	constructor() {
		try {
			const stored = localStorage.getItem(TASK_ORDER_STORAGE_KEY);
			if (isTaskOrder(stored)) this.current = stored;
		} catch {
			// No storage on the server, or refused in the browser.
		}
	}

	set(order: TaskOrder) {
		this.current = order;
		try {
			localStorage.setItem(TASK_ORDER_STORAGE_KEY, order);
		} catch {
			// The choice only lasts for this visit.
		}
	}
}
