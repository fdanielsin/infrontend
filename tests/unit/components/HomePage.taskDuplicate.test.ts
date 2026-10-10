import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { api, type ApiResult, type Task } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import HomePage from '../../../src/routes/+page.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({
	api: {
		ready: vi.fn(),
		getUsers: vi.fn(),
		getUser: vi.fn(),
		getUserTasks: vi.fn(),
		createTask: vi.fn()
	}
}));

const ada = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' };
const created: Task = { id: 10, title: 'Buy milk', description: '', user_id: 1, completed: false };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

// The user presses "Add Task", and clicks Ada's row again before the (slow) answer arrives.
describe('home page: a task created while the same user is selected again', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(api.ready).mockResolvedValue({ success: true, data: { status: 'ready' } });
		vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [ada] });
		vi.mocked(api.getUser).mockResolvedValue({ success: true, data: ada });
		app = new AppState();
	});

	afterEach(() => {
		app.availability.destroy();
		cleanup();
	});

	it('shows the task once (sad path)', async () => {
		// GIVEN: Ada is selected, with no task, and "Buy milk" is being added (slow answer).
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [] });
		const view = renderWithApp(app, HomePage);
		await fireEvent.click(await view.findByRole('button', { name: /Ada Lovelace/ }));
		await view.findByRole('heading', { name: 'Tasks for Ada Lovelace' });
		const creation = deferred<ApiResult<Task>>();
		vi.mocked(api.createTask).mockReturnValueOnce(creation.promise);
		await fireEvent.input(view.getByLabelText('Task Title'), { target: { value: 'Buy milk' } });
		await fireEvent.click(view.getByRole('button', { name: 'Add Task' }));

		// WHEN: Ada's row is clicked again (the reload already lists the stored task), then the
		// slow answer to the creation arrives.
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [created] });
		await fireEvent.click(view.getByRole('button', { name: /Ada Lovelace/ }));
		await view.findByText('Buy milk');
		creation.resolve({ success: true, data: created });
		await waitFor(() => expect(vi.mocked(api.createTask)).toHaveBeenCalledTimes(1));
		await new Promise((r) => setTimeout(r, 50));

		// THEN: One task in the list (Svelte also throws each_key_duplicate on the second copy), one
		// line, and a list title that counts one task.
		expect(app.tasks.tasks.map((task) => task.id)).toEqual([10]);
		expect(view.queryAllByText('Buy milk')).toHaveLength(1);
		expect(view.getByRole('heading', { level: 3 }).textContent?.trim()).toBe('1 to do of 1');
	});
});
