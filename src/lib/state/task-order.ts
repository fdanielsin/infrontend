export const TASK_ORDERS = ['created', 'title', 'status'] as const;
export type TaskOrder = (typeof TASK_ORDERS)[number];
export const DEFAULT_TASK_ORDER: TaskOrder = 'created';

export function isTaskOrder(value: unknown): value is TaskOrder {
	return TASK_ORDERS.some((order) => order === value);
}
