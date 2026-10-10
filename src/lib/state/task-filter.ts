export const TASK_FILTERS = ['all', 'todo', 'done'] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];
export const DEFAULT_TASK_FILTER: TaskFilter = 'all';

export function isTaskFilter(value: unknown): value is TaskFilter {
	return TASK_FILTERS.some((filter) => filter === value);
}
