import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({ api: { deleteTask: vi.fn() } }));

const task = { id: 1, title: 'T', description: '', user_id: 1, completed: false };

describe('AppState.destroy', () => {
	afterEach(() => vi.useRealTimers());

	function withPendingDeletion() {
		vi.useFakeTimers();
		vi.mocked(api.deleteTask).mockReset();
		const app = new AppState();
		app.tasks.clear(1);
		app.tasks.tasks = [task];
		app.tasks.remove(task.id);
		return app;
	}

	it('sends nothing when the undo window ends after the state was torn down (qa86)', async () => {
		const app = withPendingDeletion();

		app.destroy();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(api.deleteTask).not.toHaveBeenCalled();
		expect(app.notifications.items).toEqual([]);
	});

	it('keeps the normal behaviour without destroy: the window ends and the deletion is sent', async () => {
		const app = withPendingDeletion();
		vi.mocked(api.deleteTask).mockResolvedValue({ success: true });

		await vi.advanceTimersByTimeAsync(6000);

		expect(api.deleteTask).toHaveBeenCalledTimes(1);
		expect(app.notifications.items).toEqual([]);
	});
});
