import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import { AppState } from '$lib/state/app-state.svelte';
import UserForm from '$lib/features/users/UserForm.svelte';
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

const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
const grace = { id: 2, name: 'Grace', email: 'grace@example.com' };
const alan = { id: 3, name: 'Alan', email: 'alan@example.com' };

describe('user list rows', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
		app.users.users = [ada, grace];
	});

	afterEach(() => {
		cleanup();
	});

	it('keeps the element, and so the focus, of a user when the list is reloaded in another order (limit)', async () => {
		// GIVEN: A keyboard user on the row of Grace.
		const view = renderWithApp(app, UserForm);
		const graceRow = view.getByText('grace@example.com').closest('button') as HTMLButtonElement;
		graceRow.focus();

		// WHEN: The list is loaded again (service back) with another user first.
		app.users.users = [alan, ada, grace];
		await tick();

		// THEN: The row of Grace is the same element, still focused (a row follows its user).
		const rows = view.getAllByRole('button', { pressed: false });
		expect(rows.map((row) => row.textContent?.includes('grace@example.com'))).toEqual([
			false,
			false,
			true
		]);
		expect(view.getByText('grace@example.com').closest('button')).toBe(graceRow);
		expect(document.activeElement).toBe(graceRow);
	});
});
