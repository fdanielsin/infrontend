import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import { watchPageLifecycle } from '$lib/state/page-lifecycle';

vi.mock('$lib/api/client', () => ({ api: { deleteTask: vi.fn(), deleteUser: vi.fn() } }));

const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
const bob = { id: 2, name: 'Bob', email: 'bob@example.com' };
// Bob's task: the tasks of a user being deleted follow him and are not sent.
const task = { id: 1, title: 'T', description: '', user_id: 2, completed: false };

function setVisibility(state: 'hidden' | 'visible') {
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
	document.dispatchEvent(new Event('visibilitychange'));
}

describe('what the application does as the page is hidden, shown or left', () => {
	let app: AppState;
	let stop: () => void;

	beforeEach(() => {
		vi.mocked(api.deleteTask).mockReset();
		vi.mocked(api.deleteTask).mockResolvedValue({ success: true });
		app = new AppState();
		app.tasks.clear(1);
		app.tasks.tasks = [task];
		app.tasks.remove(task.id);
		stop = watchPageLifecycle(app);
	});

	afterEach(() => {
		stop();
		app.destroy();
		setVisibility('visible');
	});

	it('sends a waiting task deletion with keepalive as the page is hidden (TASK-R18)', () => {
		setVisibility('hidden');

		expect(api.deleteTask).toHaveBeenCalledExactlyOnceWith(task.id, { keepalive: true });
	});

	it('sends it once when the page is hidden and then left (boundary)', () => {
		setVisibility('hidden');
		window.dispatchEvent(new Event('pagehide'));

		expect(api.deleteTask).toHaveBeenCalledTimes(1);
	});

	it('sends it as the page is left without having been hidden first (limit)', () => {
		window.dispatchEvent(new Event('pagehide'));

		expect(api.deleteTask).toHaveBeenCalledExactlyOnceWith(task.id, { keepalive: true });
	});

	it('sends nothing as the page is shown (boundary)', () => {
		setVisibility('visible');

		expect(api.deleteTask).not.toHaveBeenCalled();
	});

	it('listens no more once stopped (limit)', () => {
		stop();
		setVisibility('hidden');
		window.dispatchEvent(new Event('pagehide'));

		expect(api.deleteTask).not.toHaveBeenCalled();
	});

	// A user waits for the return of the page; a task does not. The mutant "a user is sent when the
	// page is hidden" (whenHidden: 'send') must make these tests fail.
	describe('with a user deletion waiting too (USER-R20, TASK-R18)', () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.mocked(api.deleteUser).mockReset();
			vi.mocked(api.deleteUser).mockResolvedValue({ success: true });
			app.users.users = [ada, bob];
			app.users.remove(ada.id);
		});

		afterEach(() => vi.useRealTimers());

		it('sends the task and holds the user as the page is hidden, for as long as it stays hidden (critère 31)', async () => {
			await vi.advanceTimersByTimeAsync(2000);

			setVisibility('hidden');
			await vi.advanceTimersByTimeAsync(60_000);

			expect(api.deleteTask).toHaveBeenCalledExactlyOnceWith(task.id, { keepalive: true });
			expect(api.deleteUser).not.toHaveBeenCalled();
			expect(app.notifications.items.map((toast) => toast.message)).toEqual([
				'User and their tasks deleted: Ada'
			]);
		});

		it('goes on with the 4 s left when the page returns, then sends the user once (critère 31)', async () => {
			await vi.advanceTimersByTimeAsync(2000);
			setVisibility('hidden');
			await vi.advanceTimersByTimeAsync(60_000);

			setVisibility('visible');
			await vi.advanceTimersByTimeAsync(3999);
			expect(api.deleteUser).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(60_000);

			expect(api.deleteUser).toHaveBeenCalledExactlyOnceWith(ada.id);
		});

		it('sends both once, with keepalive, as the page is really left (critère 36)', async () => {
			setVisibility('hidden');
			window.dispatchEvent(new Event('pagehide'));
			await vi.advanceTimersByTimeAsync(60_000);

			expect(api.deleteUser).toHaveBeenCalledExactlyOnceWith(ada.id, { keepalive: true });
			expect(api.deleteTask).toHaveBeenCalledExactlyOnceWith(task.id, { keepalive: true });
		});
	});
});
