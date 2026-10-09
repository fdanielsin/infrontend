import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { api, type ApiResult, type User } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import UserForm from '$lib/features/users/UserForm.svelte';
import { lastToast } from '../support/last-toast';
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

let app: AppState;

function renderForm() {
	const view = renderWithApp(app, UserForm);
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
		app = new AppState();
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

		// WHEN: The form is novalidate and the field a text field: only the zod rule judges the email.
		await submit('Ada', 'ada@localhost');

		// THEN: The zod message is shown next to the field and nothing is sent.
		expect(await findByText('Invalid email address')).toBeTruthy();
		expect(emailInput.getAttribute('aria-invalid')).toBe('true');
		expect(api.createUser).not.toHaveBeenCalled();
	});

	it('refuses a name of spaces and accepts a 1-character name, as the contract does (boundary)', async () => {
		// GIVEN: A rendered form and an API that accepts any user.
		vi.mocked(api.createUser).mockResolvedValue({
			success: true,
			data: { id: 1, name: 'A', email: 'al@example.com' }
		});
		const { submit, findByText, queryByText } = renderForm();

		// WHEN: A name made of spaces is submitted.
		await submit('   ', 'al@example.com');

		// THEN: It is refused.
		expect(await findByText('Name is required')).toBeTruthy();
		expect(api.createUser).not.toHaveBeenCalled();

		// WHEN: A 1-character name is submitted.
		await submit('A', 'al@example.com');

		// THEN: It is sent and the message disappears.
		await waitFor(() =>
			expect(api.createUser).toHaveBeenCalledWith({ name: 'A', email: 'al@example.com' })
		);
		expect(queryByText('Name is required')).toBeNull();
	});

	it('shows "No users yet" for an empty list (limit)', () => {
		// GIVEN / WHEN: The answer was an empty list.
		app.users.loadState = 'loaded';
		const { getByText } = renderForm();

		// THEN: The empty state and a zero count are shown.
		expect(getByText('No users yet')).toBeTruthy();
		expect(getByText('Users (0)')).toBeTruthy();
	});

	it('renders names with markup or Unicode as plain text (limit)', () => {
		// GIVEN: Users whose names contain HTML and Unicode.
		app.users.users = [
			{ id: 1, name: '<b>Bold</b>', email: 'b@example.com' },
			{ id: 2, name: 'Zoë 🚀 日本語', email: 'z@example.com' }
		];

		// WHEN: The list is rendered.
		const { getByText, container } = renderForm();

		// THEN: The text is shown as typed, and no element is injected.
		expect(getByText('<b>Bold</b>')).toBeTruthy();
		expect(getByText('Zoë 🚀 日本語')).toBeTruthy();
		expect(container.querySelector('li b')).toBeNull();
	});

	it('keeps the submit button enabled but busy while the request is pending (exception)', async () => {
		// GIVEN: An API call that has not answered yet.
		let answer!: (value: ApiResult<User>) => void;
		vi.mocked(api.createUser).mockReturnValue(new Promise((resolve) => (answer = resolve)));
		const { submit, getByRole } = renderForm();

		// WHEN: The form is submitted.
		await submit('Ada', 'ada@example.com');

		// THEN: The button is not disabled (it keeps the focus) but busy until the answer arrives.
		const button = getByRole('button', { name: 'Creating…' }) as HTMLButtonElement;
		expect(button.disabled).toBe(false);
		expect(button.getAttribute('aria-busy')).toBe('true');
		answer({ success: true, data: { id: 1, name: 'Ada', email: 'ada@example.com' } });
		await waitFor(() =>
			expect(getByRole('button', { name: 'Create User' }).getAttribute('aria-busy')).toBeNull()
		);
	});

	it('shows a failed load as such, never as an empty list (exception)', async () => {
		// GIVEN: A rendered form and a backend that cannot be reached.
		vi.mocked(api.getUsers).mockRejectedValue(new TypeError('Failed to fetch'));
		const { findByText, queryByText } = renderForm();

		// WHEN: The page loads the users.
		await app.users.fetch();

		// THEN: The list says it failed; the error detail is the toast's.
		expect(await findByText('Users could not be loaded.')).toBeTruthy();
		expect(queryByText('No users yet')).toBeNull();
		expect(lastToast(app)).toBe('Failed to fetch');
	});

	describe('focus after a failed validation', () => {
		async function submitFromButton(
			view: ReturnType<typeof renderForm>,
			name: string,
			email: string
		) {
			await fireEvent.input(view.nameInput, { target: { value: name } });
			await fireEvent.input(view.emailInput, { target: { value: email } });
			const create = view.getByRole('button', { name: 'Create User' });
			create.focus();
			await fireEvent.submit(create.closest('form') as HTMLFormElement);
			await tick();
		}

		it('focuses the name, described by its error, when only the name is invalid (sad path)', async () => {
			// GIVEN: A rendered form.
			const view = renderForm();

			// WHEN: A name of spaces is submitted from the button.
			await submitFromButton(view, '   ', 'ada@example.com');

			// THEN: The name is focused and described by its error.
			expect(document.activeElement).toBe(view.nameInput);
			expect(view.nameInput.getAttribute('aria-describedby')).toBe('name-error');
			expect(document.getElementById('name-error')?.textContent?.trim()).toBe('Name is required');
			expect(view.emailInput.getAttribute('aria-invalid')).toBe('false');
		});

		it('focuses the email when only the email is invalid (boundary)', async () => {
			// GIVEN: A rendered form.
			const view = renderForm();

			// WHEN: A valid 2-character name and an invalid email are submitted.
			await submitFromButton(view, 'Al', 'ada@localhost');

			// THEN: The email is focused and described by its error.
			expect(document.activeElement).toBe(view.emailInput);
			expect(view.emailInput.getAttribute('aria-describedby')).toBe('email-error');
			expect(view.nameInput.getAttribute('aria-invalid')).toBe('false');
		});

		it('focuses the first field when both are invalid (boundary)', async () => {
			// GIVEN: A rendered form.
			const view = renderForm();

			// WHEN: An invalid name and an invalid email are submitted.
			await submitFromButton(view, '   ', 'not-an-email');

			// THEN: The name, first in the form, is focused; both are marked invalid.
			expect(document.activeElement).toBe(view.nameInput);
			expect(view.nameInput.getAttribute('aria-invalid')).toBe('true');
			expect(view.emailInput.getAttribute('aria-invalid')).toBe('true');
			expect(api.createUser).not.toHaveBeenCalled();
		});

		it('does not move the focus to a field when the form is valid (happy path)', async () => {
			// GIVEN: An API that accepts the user.
			vi.mocked(api.createUser).mockResolvedValue({
				success: true,
				data: { id: 1, name: 'Ada', email: 'ada@example.com' }
			});
			const view = renderForm();

			// WHEN: A valid form is submitted from the button.
			await submitFromButton(view, 'Ada', 'ada@example.com');
			await waitFor(() => expect(api.createUser).toHaveBeenCalledTimes(1));

			// THEN: Neither field takes the focus.
			expect(document.activeElement).not.toBe(view.nameInput);
			expect(document.activeElement).not.toBe(view.emailInput);
		});
	});

	it('marks only the selected user as pressed and highlighted, moving with the selection (happy path)', async () => {
		// GIVEN: Two listed users and an API that returns each of them without tasks.
		const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
		const grace = { id: 2, name: 'Grace', email: 'grace@example.com' };
		app.users.users = [ada, grace];
		vi.mocked(api.getUser).mockImplementation((id: number) =>
			Promise.resolve({ success: true, data: id === ada.id ? ada : grace })
		);
		vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });
		const view = renderForm();
		const adaButton = view.getByRole('button', { name: /Ada/ });
		const graceButton = view.getByRole('button', { name: /Grace/ });
		const highlight = ['bg-surface-selected', 'border-l-4', 'border-primary'];
		const isHighlighted = (button: HTMLElement) =>
			highlight.every((name) => button.classList.contains(name));
		expect(adaButton.getAttribute('aria-pressed')).toBe('false');
		expect(graceButton.getAttribute('aria-pressed')).toBe('false');

		// WHEN: The second user is selected.
		await fireEvent.click(graceButton);

		// THEN: Only that user is pressed and highlighted.
		await waitFor(() => expect(graceButton.getAttribute('aria-pressed')).toBe('true'));
		expect(isHighlighted(graceButton)).toBe(true);
		expect(adaButton.getAttribute('aria-pressed')).toBe('false');
		expect(highlight.some((name) => adaButton.classList.contains(name))).toBe(false);

		// WHEN: The selection moves to the first user.
		await fireEvent.click(adaButton);

		// THEN: The first user is pressed and highlighted, the second one no longer.
		await waitFor(() => expect(adaButton.getAttribute('aria-pressed')).toBe('true'));
		expect(isHighlighted(adaButton)).toBe(true);
		expect(graceButton.getAttribute('aria-pressed')).toBe('false');
		expect(highlight.some((name) => graceButton.classList.contains(name))).toBe(false);
	});

	it('shows only the length message for an email over 254 characters, without sending (limit)', async () => {
		// GIVEN: A 255-character value, which is also not an email.
		const { submit, findByText, queryByText } = renderForm();

		// WHEN: It is submitted.
		await submit('Ada', 'a'.repeat(255));

		// THEN: Only the length message is shown and nothing is sent.
		expect(await findByText('Email must be at most 254 characters')).toBeTruthy();
		expect(queryByText('Invalid email address')).toBeNull();
		expect(api.createUser).not.toHaveBeenCalled();
	});

	it('sends the trimmed name and email (happy path)', async () => {
		// GIVEN: An API that accepts the user.
		const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
		vi.mocked(api.createUser).mockResolvedValue({ success: true, data: ada });
		const { submit } = renderForm();

		// WHEN: Values framed by spaces are submitted.
		await submit('  Ada ', ' ada@example.com ');

		// THEN: The server receives them trimmed.
		await waitFor(() =>
			expect(api.createUser).toHaveBeenCalledWith({ name: 'Ada', email: 'ada@example.com' })
		);
	});
});
