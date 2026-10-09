import type { Task } from '$lib/api/client';
import type { TaskOrder } from '$lib/state/task-order';

// The list of orders belongs to the state that remembers the choice (state does not import features).
export {
	DEFAULT_TASK_ORDER,
	TASK_ORDERS,
	isTaskOrder,
	type TaskOrder
} from '$lib/state/task-order';

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
