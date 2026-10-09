import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import TaskForm from '$lib/features/tasks/TaskForm.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({
	api: {
		getUsers: vi.fn(),
		createUser: vi.fn(),
		getUser: vi.fn(),
		getUserTasks: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		deleteTask: vi.fn()
	}
}));

const user = { id: 1, name: 'Ada', email: 'ada@example.com' };

describe('task form: where a request error is shown', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	afterEach(() => {
		cleanup();
	});

	it('shows a failed creation as a toast only, keeps the entries and re-enables the button (error)', async () => {
		// GIVEN: A server error with a reference on task creation.
		vi.mocked(api.createTask).mockResolvedValue({
			success: false,
			error: 'x',
			status: 500,
			code: 'INTERNAL_ERROR',
			requestId: 'req-1'
		});
		const view = renderWithApp(app, TaskForm, { user });
		const title = view.getByLabelText('Task Title') as HTMLInputElement;

		// WHEN: The form is submitted.
		await fireEvent.input(title, { target: { value: 'Review' } });
		await fireEvent.submit(title.closest('form') as HTMLFormElement);

		// THEN: One toast carries the error; the form shows no copy, keeps the entry, and is usable.
		await waitFor(() => expect(app.notifications.items).toHaveLength(1));
		expect(view.queryByText(/Something went wrong on our side/)).toBeNull();
		expect(title.value).toBe('Review');
		expect((view.getByRole('button', { name: 'Add Task' }) as HTMLButtonElement).disabled).toBe(
			false
		);
	});
});
