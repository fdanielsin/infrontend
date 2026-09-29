import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { api } from '$lib/api/client';
import { userTasks } from '$lib/features/tasks/store';
import { error } from '$lib/stores/request-status';
import TaskForm from '$lib/features/tasks/TaskForm.svelte';

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
const task = {
	id: 10,
	title: 'Review',
	description: 'Review code',
	user_id: 1,
	completed: false
};

describe('TaskForm', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		userTasks.set([task]);
		error.set(null);
	});

	afterEach(() => {
		cleanup();
	});

	it('reverts the checkbox to the real state when the API rejects the toggle (sad path)', async () => {
		// GIVEN: A rendered task list and an API that rejects the toggle request.
		vi.mocked(api.updateTask).mockResolvedValue({ success: false, error: 'Task locked' });
		const { getByRole } = render(TaskForm, { props: { user } });
		const checkbox = getByRole('checkbox', {
			name: /mark review as complete/i
		}) as HTMLInputElement;

		// WHEN: The user clicks the checkbox (the browser flips it natively before
		// the rejection is known).
		await fireEvent.click(checkbox);

		// THEN: Once the rejection is handled, the checkbox reflects the real,
		// unchanged `completed` value instead of keeping the optimistic click.
		await waitFor(() => expect(checkbox.checked).toBe(false));
		expect(getByRole('alert').textContent).toContain('Task locked');
	});
});
