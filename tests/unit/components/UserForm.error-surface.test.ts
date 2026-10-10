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
		createTask: vi.fn(),
		updateTask: vi.fn(),
		deleteTask: vi.fn()
	}
}));

const TAKEN = { success: false as const, error: 'x', status: 409, code: 'EMAIL_TAKEN' };
const SERVER_ERROR = { success: false as const, error: 'x', status: 500, code: 'INTERNAL_ERROR' };

function renderForm(app: AppState) {
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

describe('user form: where a request error is shown', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	afterEach(() => {
		cleanup();
	});

	it('shows an email already taken under the email field, with the focus and no toast (happy path)', async () => {
		// GIVEN: An API that refuses the email.
		vi.mocked(api.createUser).mockResolvedValue(TAKEN);
		const { submit, emailInput, findByText } = renderForm(app);

		// WHEN: The form is submitted.
		await submit('Ada', 'ada@example.com');

		// THEN: The message is bound to the field, which has the focus and keeps the typed values.
		const message = await findByText('Email already in use');
		expect(emailInput.getAttribute('aria-invalid')).toBe('true');
		const describedBy = emailInput.getAttribute('aria-describedby') ?? '';
		// The text sits in a span of the error paragraph, which carries the id.
		const errorId = message.closest('p')?.id;
		expect(errorId).toBe('email-error');
		expect(describedBy.split(' ')).toContain(errorId);
		expect(document.activeElement).toBe(emailInput);
		expect(emailInput.value).toBe('ada@example.com');
		expect(app.notifications.items).toEqual([]);
	});

	it('keeps the message, without a check, when the field is left unchanged (error)', async () => {
		// GIVEN: An email refused.
		vi.mocked(api.createUser).mockResolvedValue(TAKEN);
		const { submit, emailInput, findByText, getByText } = renderForm(app);
		await submit('Ada', 'ada@example.com');
		await findByText('Email already in use');

		// WHEN: The field is left without any edit.
		await fireEvent.blur(emailInput);

		// THEN: The refusal stays, and the address the server refused gets no success mark.
		expect(getByText('Email already in use')).toBeTruthy();
		expect(emailInput.getAttribute('aria-invalid')).toBe('true');
		expect(emailInput.parentElement?.querySelector('svg[data-icon="check"]')).toBeNull();
	});

	it('clears the message once the email is edited (limit)', async () => {
		// GIVEN: An email refused.
		vi.mocked(api.createUser).mockResolvedValue(TAKEN);
		const { submit, emailInput, findByText, queryByText } = renderForm(app);
		await submit('Ada', 'ada@example.com');
		await findByText('Email already in use');

		// WHEN: The user types another email.
		await fireEvent.input(emailInput, { target: { value: 'ada2@example.com' } });

		// THEN: The old refusal is gone.
		await waitFor(() => expect(queryByText('Email already in use')).toBeNull());
		expect(emailInput.getAttribute('aria-invalid')).not.toBe('true');
	});

	it('clears the message when the same form is submitted again with a free email (boundary)', async () => {
		// GIVEN: An email refused, then an API that accepts.
		vi.mocked(api.createUser).mockResolvedValueOnce(TAKEN);
		const { submit, findByText, queryByText, emailInput } = renderForm(app);
		await submit('Ada', 'ada@example.com');
		await findByText('Email already in use');
		expect(emailInput.getAttribute('aria-invalid')).toBe('true');
		vi.mocked(api.createUser).mockResolvedValueOnce({
			success: true,
			data: { id: 1, name: 'Ada', email: 'ada2@example.com' }
		});

		// WHEN: It is submitted again.
		await submit('Ada', 'ada2@example.com');

		// THEN: No refusal is left.
		await waitFor(() => expect(queryByText('Email already in use')).toBeNull());
		expect(emailInput.getAttribute('aria-invalid')).not.toBe('true');
	});

	it('shows a server error as a toast only, with no box in the form (error)', async () => {
		// GIVEN: A server error with a reference.
		vi.mocked(api.createUser).mockResolvedValue({ ...SERVER_ERROR, requestId: 'req-1' });
		const { submit, queryByText, emailInput } = renderForm(app);

		// WHEN: The form is submitted.
		await submit('Ada', 'ada@example.com');

		// THEN: One toast carries it; the form holds no alert and no field error; values are kept.
		await waitFor(() => expect(app.notifications.items).toHaveLength(1));
		expect(queryByText(/Something went wrong on our side/)).toBeNull();
		expect(emailInput.getAttribute('aria-invalid')).not.toBe('true');
		expect(emailInput.value).toBe('ada@example.com');
	});

	it('shows a refusal that names no field (VALIDATION_FAILED) as a toast, not under a field (error)', async () => {
		// GIVEN: A 400 the client could not catch.
		vi.mocked(api.createUser).mockResolvedValue({
			success: false,
			error: 'x',
			status: 400,
			code: 'VALIDATION_FAILED'
		});
		const { submit, queryByText, emailInput } = renderForm(app);

		// WHEN / THEN: A toast, no box, no field marked invalid.
		await submit('Ada', 'ada@example.com');
		await waitFor(() => expect(app.notifications.items).toHaveLength(1));
		expect(queryByText('Invalid data')).toBeNull();
		expect(emailInput.getAttribute('aria-invalid')).not.toBe('true');
	});

	it('says "email already in use" in the interface language, whatever the server wrote (limit)', async () => {
		// GIVEN: A refusal whose server message is another text.
		vi.mocked(api.createUser).mockResolvedValue({ ...TAKEN, error: 'Courriel déjà utilisé' });
		const { submit, findByText, queryByText, emailInput } = renderForm(app);

		// WHEN / THEN: The interface text is shown, under the field, not the server's.
		await submit('Ada', 'ada@example.com');
		await findByText('Email already in use');
		expect(emailInput.getAttribute('aria-invalid')).toBe('true');
		expect(queryByText('Courriel déjà utilisé')).toBeNull();
	});

	it('keeps the form usable after a thrown error (exception)', async () => {
		// GIVEN: A client that throws.
		vi.mocked(api.createUser).mockRejectedValue(new Error('boom'));
		const { submit, queryByText, getByRole } = renderForm(app);

		// WHEN: The form is submitted.
		await submit('Ada', 'ada@example.com');

		// THEN: A toast, no box, and the button is enabled again.
		await waitFor(() => expect(app.notifications.items).toHaveLength(1));
		expect(queryByText('boom')).toBeNull();
		expect((getByRole('button', { name: 'Create User' }) as HTMLButtonElement).disabled).toBe(
			false
		);
	});
});
