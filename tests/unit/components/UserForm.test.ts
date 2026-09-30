import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { api, type ApiResponse, type User } from '$lib/api/client';
import { fetchUsers, selectedUser, users } from '$lib/features/users/store';
import { error, loading } from '$lib/stores/request-status';
import UserForm from '$lib/features/users/UserForm.svelte';

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

function renderForm() {
	const view = render(UserForm);
	const nameInput = view.getByLabelText('Name') as HTMLInputElement;
	const emailInput = view.getByLabelText('Email') as HTMLInputElement;
	const form = nameInput.closest('form') as HTMLFormElement;
	async function submit(name: string, email: string) {
		await fireEvent.input(nameInput, { target: { value: name } });
		await fireEvent.input(emailInput, { target: { value: email } });
		await fireEvent.submit(form);
	}
	return { ...view, nameInput, emailInput, submit };
}

describe('UserForm', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		users.set([]);
		selectedUser.set(null);
		loading.set(false);
		error.set(null);
	});

	afterEach(() => {
		cleanup();
	});

	it('creates a user, lists it and clears the fields (happy path)', async () => {
		// GIVEN: An API that accepts the user.
		const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
		vi.mocked(api.createUser).mockResolvedValue({ success: true, data: ada });
		const { submit, getByText, nameInput, emailInput } = renderForm();

		// WHEN: The form is submitted with valid values.
		await submit('Ada', 'ada@example.com');

		// THEN: The user is listed and the fields are emptied.
		await waitFor(() => expect(getByText('ada@example.com')).toBeTruthy());
		expect(api.createUser).toHaveBeenCalledWith({ name: 'Ada', email: 'ada@example.com' });
		expect(nameInput.value).toBe('');
		expect(emailInput.value).toBe('');
	});

	it('current rule: rejects an email without a domain extension, without calling the API (sad path)', async () => {
		// GIVEN: A rendered form.
		const { submit, findByText, emailInput } = renderForm();

		// WHEN: The email passes the browser check (type=email) but not the zod rule.
		await submit('Ada', 'ada@localhost');

		// THEN: The zod message is shown next to the field and nothing is sent.
		expect(await findByText('Invalid email address')).toBeTruthy();
		expect(emailInput.getAttribute('aria-invalid')).toBe('true');
		expect(api.createUser).not.toHaveBeenCalled();
	});

	it('current rule: a 1-character name is refused, 2 characters are accepted (boundary)', async () => {
		// GIVEN: A rendered form and an API that accepts any user.
		vi.mocked(api.createUser).mockResolvedValue({
			success: true,
			data: { id: 1, name: 'Al', email: 'al@example.com' }
		});
		const { submit, findByText, queryByText } = renderForm();

		// WHEN: A 1-character name is submitted.
		await submit('A', 'al@example.com');

		// THEN: It is refused.
		expect(await findByText('Name must be at least 2 characters')).toBeTruthy();
		expect(api.createUser).not.toHaveBeenCalled();

		// WHEN: A 2-character name is submitted.
		await submit('Al', 'al@example.com');

		// THEN: It is sent and the message disappears.
		await waitFor(() => expect(api.createUser).toHaveBeenCalledTimes(1));
		expect(queryByText('Name must be at least 2 characters')).toBeNull();
	});

	it('shows "No users yet" for an empty list (limit)', () => {
		// GIVEN / WHEN: No user is loaded.
		const { getByText } = renderForm();

		// THEN: The empty state and a zero count are shown.
		expect(getByText('No users yet')).toBeTruthy();
		expect(getByText('Users (0)')).toBeTruthy();
	});

	it('renders names with markup or Unicode as plain text (limit)', () => {
		// GIVEN: Users whose names contain HTML and Unicode.
		users.set([
			{ id: 1, name: '<b>Bold</b>', email: 'b@example.com' },
			{ id: 2, name: 'Zoë 🚀 日本語', email: 'z@example.com' }
		]);

		// WHEN: The list is rendered.
		const { getByText, container } = renderForm();

		// THEN: The text is shown as typed, and no element is injected.
		expect(getByText('<b>Bold</b>')).toBeTruthy();
		expect(getByText('Zoë 🚀 日本語')).toBeTruthy();
		expect(container.querySelector('li b')).toBeNull();
	});

	it('disables the submit button while the request is pending (exception)', async () => {
		// GIVEN: An API call that has not answered yet.
		let answer!: (value: ApiResponse<User>) => void;
		vi.mocked(api.createUser).mockReturnValue(new Promise((resolve) => (answer = resolve)));
		const { submit, getByRole } = renderForm();

		// WHEN: The form is submitted.
		await submit('Ada', 'ada@example.com');

		// THEN: The button is disabled until the answer arrives.
		const button = getByRole('button', { name: 'Creating...' }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		answer({ success: true, data: { id: 1, name: 'Ada', email: 'ada@example.com' } });
		await waitFor(() =>
			expect((getByRole('button', { name: 'Create User' }) as HTMLButtonElement).disabled).toBe(
				false
			)
		);
	});

	it('shows an alert when the users cannot be loaded (exception)', async () => {
		// GIVEN: A rendered form and a backend that cannot be reached.
		vi.mocked(api.getUsers).mockRejectedValue(new TypeError('Failed to fetch'));
		const { findByRole, getByText } = renderForm();

		// WHEN: The page loads the users.
		await fetchUsers();

		// THEN: The failure is announced and the list stays empty.
		expect((await findByRole('alert')).textContent).toContain('Failed to fetch');
		expect(getByText('No users yet')).toBeTruthy();
	});
});
