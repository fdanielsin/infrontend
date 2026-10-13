import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { api, type ApiResult, type User } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import StatsPage from '../../../src/routes/stats/+page.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({
	api: {
		getStats: vi.fn(),
		ready: vi.fn(),
		deleteUser: vi.fn(),
		deleteTask: vi.fn(),
		createUser: vi.fn(),
		getUser: vi.fn(),
		updateUser: vi.fn(),
		getUserTasks: vi.fn()
	}
}));
const ada: User = { id: 1, name: 'Ada', email: 'ada@example.com' };
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('stats page: deletions still waiting (USER-R20, critère 38)', () => {
	let app: AppState;
	beforeEach(() => {
		vi.resetAllMocks();
		vi.useFakeTimers();
		vi.mocked(api.ready).mockResolvedValue({ success: true, data: { status: 'ready' } });
		app = new AppState();
		app.users.users = [ada];
	});
	afterEach(() => {
		cleanup();
		app.destroy();
		vi.useRealTimers();
	});

	it('reads the counters only after the deletion is answered', async () => {
		const sent = deferred<ApiResult<void>>();
		vi.mocked(api.deleteUser).mockReturnValue(sent.promise);
		vi.mocked(api.getStats).mockResolvedValue({ success: true, data: { users: 0, tasks: 0 } });
		app.users.remove(ada.id);
		renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(50);
		expect(api.deleteUser).toHaveBeenCalledTimes(1);
		expect(api.getStats).not.toHaveBeenCalled();
		sent.resolve({ success: true });
		await vi.advanceTimersByTimeAsync(50);
		expect(api.getStats).toHaveBeenCalledTimes(1);
	});
});
