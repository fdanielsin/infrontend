import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TASK_FILTER_STORAGE_KEY, TaskFilterState } from '$lib/state/task-filter.svelte';

// A plain in-memory storage: the one of the test environment is not reliable across runtimes.
function memoryStorage(): Storage {
	const data = new Map<string, string>();
	return {
		get length() {
			return data.size;
		},
		clear: () => data.clear(),
		getItem: (key) => data.get(key) ?? null,
		key: (index) => [...data.keys()][index] ?? null,
		removeItem: (key) => void data.delete(key),
		setItem: (key, value) => void data.set(key, String(value))
	};
}

describe('task filter state', () => {
	let storage: Storage;

	beforeEach(() => {
		storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('uses the key indrive.task-filter (boundary)', () => {
		expect(TASK_FILTER_STORAGE_KEY).toBe('indrive.task-filter');
	});

	it('starts with "all" when nothing is stored (happy path)', () => {
		expect(new TaskFilterState().current).toBe('all');
	});

	it.each(['all', 'todo', 'done'] as const)('restores the stored %s (happy path)', (filter) => {
		storage.setItem('indrive.task-filter', filter);

		expect(new TaskFilterState().current).toBe(filter);
	});

	it.each([['unknown'], [''], ['TODO'], ['null'], ['{"filter":"done"}']])(
		'falls back to "all" for the stored %j (sad path)',
		(stored) => {
			storage.setItem('indrive.task-filter', stored);

			expect(new TaskFilterState().current).toBe('all');
		}
	);

	it('writes every choice (happy path)', () => {
		const state = new TaskFilterState();

		state.set('done');
		expect(storage.getItem('indrive.task-filter')).toBe('done');
		state.set('all');
		expect(storage.getItem('indrive.task-filter')).toBe('all');
		expect(state.current).toBe('all');
	});

	it('keeps the choice in memory when the storage refuses to write (exception)', () => {
		const state = new TaskFilterState();
		vi.spyOn(storage, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});

		expect(() => state.set('todo')).not.toThrow();
		expect(state.current).toBe('todo');
	});

	it('uses the default when the storage refuses to read (exception)', () => {
		vi.spyOn(storage, 'getItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});

		expect(new TaskFilterState().current).toBe('all');
	});

	it('works without any storage, as on the server (exception)', () => {
		vi.stubGlobal('localStorage', undefined);
		const state = new TaskFilterState();

		expect(state.current).toBe('all');
		expect(() => state.set('done')).not.toThrow();
		expect(state.current).toBe('done');
	});
});
