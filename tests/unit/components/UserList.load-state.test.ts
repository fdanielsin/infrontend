import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import UserForm from '$lib/features/users/UserForm.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({
	api: {
		getUsers: vi.fn(),
		createUser: vi.fn(),
		getUser: vi.fn(),
		getUserTasks: vi.fn(),
		ready: vi.fn()
	}
}));

const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
const FAILURE = { success: false as const, error: 'x', status: 500, code: 'INTERNAL_ERROR' };

// The list never says "no users" nor shows a count of 0 for data that is only not known yet.
describe('user list states', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	afterEach(() => {
		cleanup();
	});

	it('says it is loading, with no count and no "No users yet", before the first answer (happy path)', () => {
		// GIVEN: A request that has not answered.
		vi.mocked(api.getUsers).mockReturnValue(new Promise(() => {}));
		const view = renderWithApp(app, UserForm);

		// WHEN: The fetch starts.
		void app.users.fetch();

		// THEN: Nothing claims there are no users.
		return waitFor(() => {
			expect(view.getByText('Loading users…')).toBeTruthy();
			expect(view.queryByText('No users yet')).toBeNull();
			expect(view.queryByText(/Users \(0\)/)).toBeNull();
		});
	});

	it('says "No users yet" only after a successful empty answer (boundary: 0 users)', async () => {
		// GIVEN: An API with no user.
		vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [] });
		const view = renderWithApp(app, UserForm);

		// WHEN: The list is loaded.
		await app.users.fetch();

		// THEN: The empty state and its count appear.
		await waitFor(() => expect(view.getByText('No users yet')).toBeTruthy());
		expect(view.getByText(/Users \(0\)/)).toBeTruthy();
	});

	it('shows the count once users are loaded (boundary: 1 user)', async () => {
		// GIVEN / WHEN: One user.
		vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [ada] });
		const view = renderWithApp(app, UserForm);
		await app.users.fetch();

		// THEN: The count and the user appear.
		await waitFor(() => expect(view.getByText(/Users \(1\)/)).toBeTruthy());
		expect(view.queryByText('No users yet')).toBeNull();
	});

	it('after a failure outside an outage, says it and offers Retry, never "No users yet" (error)', async () => {
		// GIVEN: A fetch that fails while the service is not known to be down.
		vi.mocked(api.getUsers).mockResolvedValue(FAILURE);
		const view = renderWithApp(app, UserForm);

		// WHEN: The list is fetched.
		await app.users.fetch();

		// THEN: Honest text and a way out.
		await waitFor(() => expect(view.getByText('Users could not be loaded.')).toBeTruthy());
		expect(view.queryByText('No users yet')).toBeNull();
		expect(view.queryByText(/Users \(0\)/)).toBeNull();
		expect(view.getByRole('button', { name: 'Retry' })).toBeTruthy();
	});

	it('Retry loads again, shows the users and puts the focus on the list (limit)', async () => {
		// GIVEN: A failed load.
		vi.mocked(api.getUsers).mockResolvedValueOnce(FAILURE);
		const view = renderWithApp(app, UserForm);
		await app.users.fetch();
		const retry = await view.findByRole('button', { name: 'Retry' });
		vi.mocked(api.getUsers).mockResolvedValueOnce({ success: true, data: [ada] });

		// WHEN: Retry is pressed.
		await fireEvent.click(retry);

		// THEN: The users are listed; the button that left does not drop the focus on the body.
		await waitFor(() => expect(view.getByText('ada@example.com')).toBeTruthy());
		expect(view.queryByRole('button', { name: 'Retry' })).toBeNull();
		expect(document.activeElement).not.toBe(document.body);
	});

	it('gives the focus back to Retry after a second failure (limit)', async () => {
		// GIVEN: A failed load, and a retry that fails again.
		vi.mocked(api.getUsers).mockResolvedValue(FAILURE);
		const view = renderWithApp(app, UserForm);
		await app.users.fetch();
		const retry = await view.findByRole('button', { name: 'Retry' });
		retry.focus();

		// WHEN: Retry is pressed and the answer is a failure again.
		await fireEvent.click(retry);

		// THEN: The button that came back has the focus, not the page.
		await waitFor(() => {
			const again = view.getByRole('button', { name: 'Retry' });
			expect(document.activeElement).toBe(again);
		});
	});

	it('during an outage (banner shown), says the list waits, with no second Retry (exception)', async () => {
		// GIVEN: The service is down, as the banner says, and the fetch failed.
		app.availability.status = 'unavailable';
		vi.mocked(api.getUsers).mockResolvedValue({ ...FAILURE, status: 503 });
		const view = renderWithApp(app, UserForm);

		// WHEN: The list is fetched.
		await app.users.fetch();

		// THEN: A neutral text, no button of the list, never "No users yet".
		await waitFor(() =>
			expect(view.getByText('Users will show as soon as the service is back.')).toBeTruthy()
		);
		expect(view.queryByRole('button', { name: 'Retry' })).toBeNull();
		expect(view.queryByText('No users yet')).toBeNull();
		expect(view.queryByText(/Users \(0\)/)).toBeNull();
	});

	it('keeps the creation form usable while the list is failed (limit)', async () => {
		// GIVEN: A failed load.
		vi.mocked(api.getUsers).mockResolvedValue(FAILURE);
		const view = renderWithApp(app, UserForm);
		await app.users.fetch();

		// THEN: The submit button is enabled.
		const button = view.getByRole('button', { name: 'Create User' }) as HTMLButtonElement;
		expect(button.disabled).toBe(false);
	});
});
