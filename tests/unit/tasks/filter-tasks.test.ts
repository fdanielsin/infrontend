import { describe, expect, it } from 'vitest';
import type { Task } from '$lib/api/client';
import {
	DEFAULT_TASK_FILTER,
	TASK_FILTERS,
	filterTasks,
	isTaskFilter
} from '$lib/features/tasks/filter-tasks';

const task = (id: number, completed: boolean): Task => ({
	id,
	title: `Task ${id}`,
	description: '',
	user_id: 1,
	completed
});
const ids = (tasks: Task[]) => tasks.map((item) => item.id);
const MIXED = [task(1, false), task(2, true), task(3, false), task(4, true)];

describe('filter tasks', () => {
	it('keeps every task for "all", the unfinished for "todo", the finished for "done" (happy path)', () => {
		expect(ids(filterTasks(MIXED, 'all'))).toEqual([1, 2, 3, 4]);
		expect(ids(filterTasks(MIXED, 'todo'))).toEqual([1, 3]);
		expect(ids(filterTasks(MIXED, 'done'))).toEqual([2, 4]);
	});

	it('keeps the order of the input and does not touch it (limit)', () => {
		const input = [task(9, true), task(2, true), task(5, false)];

		expect(ids(filterTasks(input, 'done'))).toEqual([9, 2]);
		expect(ids(input)).toEqual([9, 2, 5]);
		expect(filterTasks(input, 'all')).not.toBe(input);
	});

	it('returns nothing for an empty list, whatever the filter (boundary)', () => {
		for (const filter of TASK_FILTERS) expect(filterTasks([], filter)).toEqual([]);
	});

	it('returns nothing when no task matches, and one task when exactly one does (boundary)', () => {
		expect(filterTasks([task(1, false)], 'done')).toEqual([]);
		expect(ids(filterTasks([task(1, false), task(2, true)], 'done'))).toEqual([2]);
	});

	it('handles a long list (limit)', () => {
		const many = Array.from({ length: 5000 }, (_, index) => task(index, index % 2 === 0));

		expect(filterTasks(many, 'done')).toHaveLength(2500);
		expect(filterTasks(many, 'todo')).toHaveLength(2500);
	});

	it('keeps the task that is being edited, even when it does not match (boundary)', () => {
		expect(ids(filterTasks(MIXED, 'todo', 2))).toEqual([1, 2, 3]);
		expect(ids(filterTasks(MIXED, 'done', 1))).toEqual([1, 2, 4]);
	});

	it('ignores an edited id that is not in the list, or none (sad path)', () => {
		expect(ids(filterTasks(MIXED, 'todo', 99))).toEqual([1, 3]);
		expect(ids(filterTasks(MIXED, 'todo', null))).toEqual([1, 3]);
	});

	it('knows its three filters, "all" being the default (happy path)', () => {
		expect(TASK_FILTERS).toEqual(['all', 'todo', 'done']);
		expect(DEFAULT_TASK_FILTER).toBe('all');
		for (const filter of TASK_FILTERS) expect(isTaskFilter(filter)).toBe(true);
	});

	it.each([['unknown'], [''], ['ALL'], [null], [undefined], [1]])(
		'refuses %j as a filter (sad path)',
		(value) => {
			expect(isTaskFilter(value)).toBe(false);
		}
	);
});
