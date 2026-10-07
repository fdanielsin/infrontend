import type { Task } from '$lib/api/client';

export const TASK_ORDERS = ['created', 'title', 'status'] as const;
export type TaskOrder = (typeof TASK_ORDERS)[number];
export const DEFAULT_TASK_ORDER: TaskOrder = 'created';

export function isTaskOrder(value: unknown): value is TaskOrder {
	return TASK_ORDERS.some((order) => order === value);
}

const byId = (a: Task, b: Task) => a.id - b.id;

// A new array: the list of the server is never reordered in place. Ties always fall back to the
// id, so the order is the same on every run.
export function sortTasks(tasks: readonly Task[], order: TaskOrder, locale: string): Task[] {
	const sorted = [...tasks];
	if (order === 'title') {
		const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
		return sorted.sort((a, b) => collator.compare(a.title, b.title) || byId(a, b));
	}
	if (order === 'status') {
		return sorted.sort((a, b) => Number(a.completed) - Number(b.completed) || byId(a, b));
	}
	return sorted.sort(byId);
}
