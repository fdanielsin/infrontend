import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TASK_ORDER_STORAGE_KEY, TaskOrderState } from '$lib/state/task-order.svelte';

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

describe('task order state', () => {
	let storage: Storage;

	beforeEach(() => {
		storage = memoryStorage();
		vi.stubGlobal('localStorage', storage);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('uses the key indrive.task-order (boundary)', () => {
		expect(TASK_ORDER_STORAGE_KEY).toBe('indrive.task-order');
	});

	it('starts with the creation order when nothing is stored (happy path)', () => {
		expect(new TaskOrderState().current).toBe('created');
	});

	it.each(['created', 'title', 'status'] as const)(
		'restores the stored %s (happy path)',
		(order) => {
			storage.setItem('indrive.task-order', order);

			expect(new TaskOrderState().current).toBe(order);
		}
	);

	it.each([['unknown'], [''], ['TITLE'], ['null'], ['{"order":"title"}']])(
		'falls back to the creation order for the stored %j (sad path)',
		(stored) => {
			storage.setItem('indrive.task-order', stored);

			expect(new TaskOrderState().current).toBe('created');
		}
	);

	it('writes every choice (happy path)', () => {
		const state = new TaskOrderState();

		state.set('title');
		expect(storage.getItem('indrive.task-order')).toBe('title');
		state.set('created');
		expect(storage.getItem('indrive.task-order')).toBe('created');
		expect(state.current).toBe('created');
	});

	it('keeps the choice in memory when the storage refuses to write (exception)', () => {
		const state = new TaskOrderState();
		vi.spyOn(storage, 'setItem').mockImplementation(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});

		expect(() => state.set('status')).not.toThrow();
		expect(state.current).toBe('status');
	});

	it('uses the default when the storage refuses to read (exception)', () => {
		vi.spyOn(storage, 'getItem').mockImplementation(() => {
			throw new DOMException('denied', 'SecurityError');
		});

		expect(new TaskOrderState().current).toBe('created');
	});

	it('works without any storage, as on the server (exception)', () => {
		vi.stubGlobal('localStorage', undefined);
		const state = new TaskOrderState();

		expect(state.current).toBe('created');
		expect(() => state.set('title')).not.toThrow();
		expect(state.current).toBe('title');
	});
});
