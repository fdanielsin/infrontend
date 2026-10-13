import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import { watchPageLifecycle } from '$lib/state/page-lifecycle';

vi.mock('$lib/api/client', () => ({ api: { deleteTask: vi.fn() } }));

const task = { id: 1, title: 'T', description: '', user_id: 1, completed: false };

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
});
