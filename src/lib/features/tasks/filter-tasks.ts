import type { Task } from '$lib/api/client';
import type { TaskFilter } from '$lib/state/task-filter';

// The list of filters belongs to the state that remembers the choice (state does not import features).
export {
	DEFAULT_TASK_FILTER,
	TASK_FILTERS,
	isTaskFilter,
	type TaskFilter
} from '$lib/state/task-filter';

export function matchesFilter(task: Task, filter: TaskFilter): boolean {
	return filter === 'all' || (filter === 'done') === task.completed;
}

// A new array, in the order of the input. The task being edited stays listed whatever it is, so
// that changing the filter does not take a draft away from under the user.
export function filterTasks(
	tasks: readonly Task[],
	filter: TaskFilter,
	keptId: number | null = null
): Task[] {
	return tasks.filter((task) => task.id === keptId || matchesFilter(task, filter));
}
