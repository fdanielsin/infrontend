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

const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
const grace = { id: 2, name: 'Grace', email: 'grace@example.com' };
const card = (element: HTMLElement) => element.closest('[class*="shadow-card"]');

describe('UserList', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
		app.users.users = [ada, grace];
		vi.mocked(api.getUser).mockImplementation((id: number) =>
			Promise.resolve({ success: true, data: id === ada.id ? ada : grace })
		);
		vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });
	});
	afterEach(cleanup);

	it('makes the button the whole row, with no padding left on the item (happy path)', () => {
		// GIVEN / WHEN: Two listed users.
		const view = renderWithApp(app, UserForm);
		const button = view.getByRole('button', { name: /Ada/ });
		const item = button.closest('li') as HTMLElement;

		// THEN: The button is the only child of the row and carries the padding and the full width.
		expect(item.children).toHaveLength(1);
		expect(item.firstElementChild).toBe(button);
		expect(item.classList.contains('p-3')).toBe(false);
		expect(button.classList.contains('w-full')).toBe(true);
		expect(button.classList.contains('p-3')).toBe(true);
		expect(button.classList.contains('min-h-11')).toBe(true);
		expect(button.classList.contains('hover:bg-surface-hover')).toBe(true);
	});

	it('selects a user from a click on any part of the row (happy path)', async () => {
		// GIVEN: A listed user.
		const view = renderWithApp(app, UserForm);
		const button = view.getByRole('button', { name: /Grace/ });

		// WHEN: The email line, inside the row, is clicked.
		await fireEvent.click(view.getByText('grace@example.com'));

		// THEN: The user is selected.
		await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));
		expect(api.getUser).toHaveBeenCalledWith(grace.id);
	});

	it('shows a chevron on a free row and a check on the selected one, never both (happy path)', async () => {
		// GIVEN: Two unselected users.
		const view = renderWithApp(app, UserForm);
		const adaButton = view.getByRole('button', { name: /Ada/ });
		const graceButton = view.getByRole('button', { name: /Grace/ });
		const icon = (button: HTMLElement) =>
			[...button.querySelectorAll('svg[data-icon]')].map((svg) => svg.getAttribute('data-icon'));
		expect(icon(adaButton)).toEqual(['nav-arrow-right']);
		expect(icon(graceButton)).toEqual(['nav-arrow-right']);

		// WHEN: Ada is selected.
		await fireEvent.click(adaButton);

		// THEN: Her row shows the check, the other keeps the chevron; icons are hidden from the tree.
		await waitFor(() => expect(icon(adaButton)).toEqual(['check']));
		expect(icon(graceButton)).toEqual(['nav-arrow-right']);
		expect(adaButton.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	});

	it('draws the selection with a fill and a bar, never with the focus ring (happy path)', async () => {
		// GIVEN / WHEN: A selected user.
		const view = renderWithApp(app, UserForm);
		const button = view.getByRole('button', { name: /Ada/ });
		await fireEvent.click(button);
		await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));

		// THEN: The row has no ring, no raw hue, and the item itself is not boxed inside.
		for (const name of ['ring-2', 'ring-primary', 'ring-inset', 'bg-blue-100']) {
			expect(button.classList.contains(name)).toBe(false);
		}
		expect(button.classList.contains('bg-surface-selected')).toBe(true);
		expect(button.classList.contains('border-l-4')).toBe(true);
	});

	it('keeps the selection in the tree for assistive technology after a failed selection (sad path)', async () => {
		// GIVEN: An API that refuses the user.
		vi.mocked(api.getUser).mockResolvedValue({ success: false, error: 'Boom' });
		const view = renderWithApp(app, UserForm);
		const button = view.getByRole('button', { name: /Ada/ });

		// WHEN: The row is clicked.
		await fireEvent.click(button);

		// THEN: Nothing is marked as selected.
		await waitFor(() => expect(api.getUser).toHaveBeenCalled());
		expect(button.getAttribute('aria-pressed')).toBe('false');
		expect(button.querySelector('[data-icon="check"]')).toBeNull();
	});

	it('puts the list in its own card, apart from the form (happy path)', () => {
		// GIVEN / WHEN: The form and the list.
		const view = renderWithApp(app, UserForm);
		const heading = view.getByRole('heading', { name: 'Users (2)' });
		const form = view.getByLabelText('Name').closest('form') as HTMLElement;

		// THEN: Two distinct cards, the list's one after the form's.
		expect(card(heading)).not.toBeNull();
		expect(card(heading)).not.toBe(card(form));
		expect(
			(card(form) as HTMLElement).compareDocumentPosition(card(heading) as HTMLElement) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});

	it('lists 50 users with very long names and addresses without a nested list (limit)', () => {
		// GIVEN: Fifty users, the first with unbreakable values at the maximum length.
		const many = Array.from({ length: 50 }, (_, index) => ({
			id: index + 1,
			name: index === 0 ? 'n'.repeat(100) : `User ${index}`,
			email: index === 0 ? `${'e'.repeat(242)}@a.co` : `user${index}@example.com`
		}));
		app.users.users = many;

		// WHEN: The list is rendered.
		const view = renderWithApp(app, UserForm);

		// THEN: Every user is a row of its own and the long text can wrap anywhere.
		expect(view.getAllByRole('listitem')).toHaveLength(50);
		expect(view.getByText('n'.repeat(100)).classList.contains('wrap-anywhere')).toBe(true);
	});

	it('shows a hint under the empty list (limit)', () => {
		// GIVEN / WHEN: No user.
		app.users.users = [];
		app.users.loadState = 'loaded';
		const view = renderWithApp(app, UserForm);

		// THEN: The existing text stays and tells the next step.
		expect(view.getByText('No users yet')).toBeTruthy();
		expect(view.getByText('Create the first one with the form above.')).toBeTruthy();
		expect(view.container.querySelector('[data-icon="group"]')?.getAttribute('aria-hidden')).toBe(
			'true'
		);
	});
});
