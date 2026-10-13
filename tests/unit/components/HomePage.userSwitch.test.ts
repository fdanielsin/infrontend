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
const nora = { id: 2, name: 'Nora Stone', email: 'nora@example.com' };
const noraTask: Task = {
	id: 20,
	title: 'Plan',
	description: 'Plan the week',
	user_id: 2,
	completed: false
};

// A task form is about one user: nothing typed or reported for one may follow to the other, or a
// task could be created for the wrong person.
describe('home page: changing the selected user', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(api.ready).mockResolvedValue({ success: true, data: { status: 'ready' } });
		vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [ada, nora] });
		vi.mocked(api.getUser).mockImplementation((id: number) =>
			Promise.resolve({ success: true, data: id === 1 ? ada : nora })
		);
		vi.mocked(api.getUserTasks).mockImplementation((id: number) =>
			Promise.resolve({ success: true, data: id === 2 ? [noraTask] : [] })
		);
		app = new AppState();
	});

	afterEach(() => {
		app.availability.destroy();
		cleanup();
	});

	function open() {
		const view = renderWithApp(app, HomePage);
		const select = async (name: string) => {
			await fireEvent.click(await view.findByRole('button', { name: new RegExp(`^${name}`) }));
			await view.findByRole('heading', { name: `Tasks for ${name}` });
		};
		return { view, select };
	}

	it('clears the "Title is required" error when another user is selected (sad path)', async () => {
		// GIVEN: An error shown on the form of the first user.
		const { view, select } = open();
		await select('Ada Lovelace');
		await fireEvent.submit(view.getByLabelText('Task Title').closest('form')!);
		expect(await view.findByText('Title is required')).toBeTruthy();

		// WHEN: Another user is selected, then the first one again.
		await select('Nora Stone');
		expect(view.queryByText('Title is required')).toBeNull();
		await select('Ada Lovelace');

		// THEN: The error did not come back.
		expect(view.queryByText('Title is required')).toBeNull();
	});

	it('does not carry a typed draft to the other user (boundary)', async () => {
		// GIVEN: A draft title and description typed for the first user.
		const { view, select } = open();
		await select('Ada Lovelace');
		await fireEvent.input(view.getByLabelText('Task Title'), { target: { value: 'Draft' } });
		await fireEvent.input(view.getByLabelText('Description (optional)'), {
			target: { value: 'Notes' }
		});

		// WHEN: Another user is selected.
		await select('Nora Stone');

		// THEN: The form is empty, so nothing typed for Ada can be created for Nora.
		expect((view.getByLabelText('Task Title') as HTMLInputElement).value).toBe('');
		expect((view.getByLabelText('Description (optional)') as HTMLTextAreaElement).value).toBe('');
	});

	it('closes a task edition in progress when another user is selected (limit)', async () => {
		// GIVEN: A task of the second user in edition.
		const { view, select } = open();
		await select('Nora Stone');
		await fireEvent.click(await view.findByRole('button', { name: 'Edit Plan' }));
		expect(view.getByLabelText('Task Title', { selector: '#edit-title-20' })).toBeTruthy();

		// WHEN: The first user is selected, then the second again.
		await select('Ada Lovelace');
		await select('Nora Stone');

		// THEN: The task is listed normally, not in edition.
		await waitFor(() => expect(view.getByRole('button', { name: 'Edit Plan' })).toBeTruthy());
	});

	it('keeps the form of the same user while the list is reloaded (exception)', async () => {
		// GIVEN: A draft typed for the selected user.
		const { view, select } = open();
		await select('Ada Lovelace');
		await fireEvent.input(view.getByLabelText('Task Title'), { target: { value: 'Draft' } });

		// WHEN: The list of users is fetched again (the service came back): same selection.
		await app.users.fetch();

		// THEN: The draft is still there.
		expect((view.getByLabelText('Task Title') as HTMLInputElement).value).toBe('Draft');
	});

	it('a task being created for the first user lands with the first user, not the second (exception)', async () => {
		// GIVEN: A task title typed for Ada, and the creation held back by the server.
		const { view, select } = open();
		await select('Ada Lovelace');
		let answer!: (result: ApiResult<Task>) => void;
		vi.mocked(api.createTask).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
		await fireEvent.input(view.getByLabelText('Task Title'), { target: { value: 'For Ada' } });
		await fireEvent.submit(view.getByLabelText('Task Title').closest('form')!);
		await waitFor(() => expect(api.createTask).toHaveBeenCalledTimes(1));

		// WHEN: Nora is selected before the answer, then the answer comes.
		await select('Nora Stone');
		answer({
			success: true,
			data: { id: 30, title: 'For Ada', description: '', user_id: 1, completed: false }
		});
		await waitFor(() => expect(app.tasks.status.loading).toBe(false));

		// THEN: The request carried Ada's id, Nora's list does not show it, and no error shows.
		expect(vi.mocked(api.createTask).mock.calls[0]?.[0]).toMatchObject({ user_id: 1 });
		expect(view.queryByText('For Ada')).toBeNull();
		expect(view.getByText('Plan')).toBeTruthy();
		expect(app.notifications.items.filter((toast) => toast.type === 'error')).toEqual([]);
	});
});
