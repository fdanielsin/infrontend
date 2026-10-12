import { describe, expect, it } from 'vitest';
import type { Task } from '$lib/api/client';
import {
	DEFAULT_TASK_ORDER,
	TASK_ORDERS,
	isTaskOrder,
	sortTasks
} from '$lib/features/tasks/sort-tasks';

const task = (id: number, title: string, completed = false): Task => ({
	id,
	title,
	description: '',
	user_id: 1,
	completed
});
const ids = (tasks: Task[]) => tasks.map((item) => item.id);
const titles = (tasks: Task[]) => tasks.map((item) => item.title);

describe('sort tasks', () => {
	describe('creation order', () => {
		it('is the id ascending whatever the input order (happy path)', () => {
			const input = [task(30, 'a'), task(10, 'c'), task(20, 'b')];

			expect(ids(sortTasks(input, 'created', 'en'))).toEqual([10, 20, 30]);
		});

		it('orders ids 0, 1 and very large ones as numbers, not as text (boundary)', () => {
			const input = [
				task(9_007_199_254_740_000, 'z'),
				task(10, 'y'),
				task(2, 'x'),
				task(1, 'w'),
				task(0, 'v')
			];

			expect(ids(sortTasks(input, 'created', 'en'))).toEqual([0, 1, 2, 10, 9_007_199_254_740_000]);
		});
	});

	describe('title order', () => {
		it('puts "Task 2" before "Task 10" (limit)', () => {
			const input = [task(1, 'Task 10'), task(2, 'Task 2'), task(3, 'Task 1')];

			expect(titles(sortTasks(input, 'title', 'en'))).toEqual(['Task 1', 'Task 2', 'Task 10']);
		});

		it('ignores the case: "a", "A" and "á" are equal and keep the creation order (boundary)', () => {
			const input = [task(2, 'á'), task(1, 'A'), task(3, 'a'), task(4, 'b')];

			expect(ids(sortTasks(input, 'title', 'fr'))).toEqual([1, 2, 3, 4]);
		});

		it('breaks a tie by id, never by the order of the input (boundary)', () => {
			const input = [task(5, 'same'), task(2, 'same'), task(9, 'same')];

			expect(ids(sortTasks(input, 'title', 'en'))).toEqual([2, 5, 9]);
		});

		it('sorts the accents of French with the base letter: "é" between "e" and "f" (limit)', () => {
			const input = [task(1, 'fête'), task(2, 'élan'), task(3, 'eau'), task(4, 'zèbre')];

			expect(titles(sortTasks(input, 'title', 'fr'))).toEqual(['eau', 'élan', 'fête', 'zèbre']);
		});

		it('follows the language of the page: "ñ" is a letter after "n" in Spanish only (limit)', () => {
			const input = [task(1, 'Ñu'), task(2, 'Nz'), task(3, 'Nube'), task(4, 'Oso')];

			expect(titles(sortTasks(input, 'title', 'es'))).toEqual(['Nube', 'Nz', 'Ñu', 'Oso']);
			expect(ids(sortTasks(input, 'title', 'en'))).toEqual([1, 3, 2, 4]);
		});

		it('sorts "ä" with "a" in German: only the next letter decides (limit)', () => {
			const input = [task(1, 'Äc'), task(2, 'Ab'), task(3, 'Ad')];

			expect(titles(sortTasks(input, 'title', 'de'))).toEqual(['Ab', 'Äc', 'Ad']);
		});

		it('sorts emoji and symbols before the letters, in a stable way (limit)', () => {
			const input = [task(1, 'b'), task(2, '😀 smile'), task(3, 'a'), task(4, '😀 smile')];

			expect(ids(sortTasks(input, 'title', 'en'))).toEqual([2, 4, 3, 1]);
		});

		it('handles empty titles and very long titles (limit)', () => {
			const long = 'x'.repeat(10_000);
			const input = [task(1, long), task(2, ''), task(3, long + 'y'), task(4, '')];

			expect(ids(sortTasks(input, 'title', 'en'))).toEqual([2, 4, 1, 3]);
		});

		it('breaks a tie of spacing-only titles by id (boundary)', () => {
			const input = [task(2, ''), task(1, '')];

			expect(ids(sortTasks(input, 'title', 'en'))).toEqual([1, 2]);
		});
	});

	describe('status order', () => {
		it('puts the open tasks first, then the done ones, by id inside each group (happy path)', () => {
			const input = [
				task(4, 'd', true),
				task(3, 'c', false),
				task(2, 'b', true),
				task(1, 'a', false)
			];

			expect(ids(sortTasks(input, 'status', 'en'))).toEqual([1, 3, 2, 4]);
		});

		it('does not look at the title (boundary)', () => {
			const input = [task(2, 'a', false), task(1, 'z', false)];

			expect(ids(sortTasks(input, 'status', 'en'))).toEqual([1, 2]);
		});

		it('keeps only done tasks, or only open ones, in creation order (boundary)', () => {
			expect(ids(sortTasks([task(2, 'b', true), task(1, 'a', true)], 'status', 'en'))).toEqual([
				1, 2
			]);
			expect(ids(sortTasks([task(2, 'b'), task(1, 'a')], 'status', 'en'))).toEqual([1, 2]);
		});
	});

	describe('every order', () => {
		it.each(TASK_ORDERS)('returns an empty list for no task, in %s (limit)', (order) => {
			expect(sortTasks([], order, 'en')).toEqual([]);
		});

		it.each(TASK_ORDERS)('returns the only task as it is, in %s (boundary)', (order) => {
			const only = task(7, 'only');

			expect(sortTasks([only], order, 'en')).toEqual([only]);
		});

		it.each(TASK_ORDERS)('never changes its input, in %s (limit)', (order) => {
			const input = [task(3, 'c', true), task(1, 'b'), task(2, 'a')];
			const copy = structuredClone(input);

			const result = sortTasks(input, order, 'en');

			expect(input).toEqual(copy);
			expect(result).not.toBe(input);
		});
	});

	describe('order names', () => {
		it('defaults to the creation order (boundary)', () => {
			expect(DEFAULT_TASK_ORDER).toBe('created');
		});

		it.each(TASK_ORDERS)('knows %s (happy path)', (order) => {
			expect(isTaskOrder(order)).toBe(true);
		});

		it.each([['Created'], [''], ['name'], [null], [undefined], [1], [{}], [['title']]])(
			'rejects %j (sad path)',
			(value) => {
				expect(isTaskOrder(value)).toBe(false);
			}
		);
	});
});
