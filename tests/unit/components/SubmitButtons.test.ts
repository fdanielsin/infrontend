import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { api, type ApiResult, type Task, type User } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import TaskForm from '$lib/features/tasks/TaskForm.svelte';
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

const ada: User = { id: 1, name: 'Ada', email: 'ada@example.com' };
const review: Task = { id: 10, title: 'Review', description: 'Code', user_id: 1, completed: false };

let app: AppState;

beforeEach(() => {
	vi.resetAllMocks();
	app = new AppState();
	app.tasks.clear(1);
	app.tasks.tasks = [review];
});
afterEach(cleanup);

const busy = (button: HTMLElement) => button.getAttribute('aria-busy');
const isDisabled = (button: HTMLElement) => (button as HTMLButtonElement).disabled;

function userForm() {
	const view = renderWithApp(app, UserForm);
	const name = view.getByLabelText('Name') as HTMLInputElement;
	const email = view.getByLabelText('Email') as HTMLInputElement;
	const form = name.closest('form')!;
	return { ...view, name, email, form };
}

function taskForm() {
	const view = renderWithApp(app, TaskForm, { user: ada });
	const title = view.getByLabelText('Task Title') as HTMLInputElement;
	return { ...view, title, form: title.closest('form')! };
}

describe('Create User button', () => {
	it('stays enabled and busy during a slow request, keeps its focus, then settles (happy path)', async () => {
		let answer!: (value: ApiResult<User>) => void;
		vi.mocked(api.createUser).mockReturnValue(new Promise((resolve) => (answer = resolve)));
		const view = userForm();
		await fireEvent.input(view.name, { target: { value: 'Ada' } });
		await fireEvent.input(view.email, { target: { value: 'ada@example.com' } });
		const button = view.getByRole('button', { name: 'Create User' });
		button.focus();

		await fireEvent.submit(view.form);

		const sending = view.getByRole('button', { name: 'Creating…' });
		expect(sending).toBe(button);
		expect(isDisabled(sending)).toBe(false);
		expect(busy(sending)).toBe('true');
		expect(document.activeElement).toBe(sending);
		answer({ success: true, data: ada });
		await waitFor(() => expect(busy(view.getByRole('button', { name: 'Create User' }))).toBeNull());
	});

	it('sends a double submit once (limit)', async () => {
		let answer!: (value: ApiResult<User>) => void;
		vi.mocked(api.createUser).mockReturnValue(new Promise((resolve) => (answer = resolve)));
		const view = userForm();
		await fireEvent.input(view.name, { target: { value: 'Ada' } });
		await fireEvent.input(view.email, { target: { value: 'ada@example.com' } });

		await fireEvent.submit(view.form);
		await fireEvent.submit(view.form);
		await fireEvent.click(view.getByRole('button', { name: 'Creating…' }));

		expect(api.createUser).toHaveBeenCalledTimes(1);
		answer({ success: true, data: ada });
	});

	it('allows the next submit once the previous one ended (boundary)', async () => {
		vi.mocked(api.createUser).mockResolvedValue({ success: false, error: 'Refused' });
		const view = userForm();
		await fireEvent.input(view.name, { target: { value: 'Ada' } });
		await fireEvent.input(view.email, { target: { value: 'ada@example.com' } });

		await fireEvent.submit(view.form);
		await waitFor(() => expect(busy(view.getByRole('button', { name: 'Create User' }))).toBeNull());
		await fireEvent.submit(view.form);

		await waitFor(() => expect(api.createUser).toHaveBeenCalledTimes(2));
	});

	it('is neither busy nor disabled while another request of the domain loads (limit)', async () => {
		const view = userForm();

		app.users.status.loading = true;
		await tick();

		const button = view.getByRole('button', { name: 'Create User' });
		expect(isDisabled(button)).toBe(false);
		expect(busy(button)).toBeNull();
	});

	it('stays enabled and sends nothing when the fields are invalid, focusing the first one (error)', async () => {
		const view = userForm();
		const button = view.getByRole('button', { name: 'Create User' });

		await fireEvent.submit(view.form);
		await tick();

		expect(api.createUser).not.toHaveBeenCalled();
		expect(isDisabled(button)).toBe(false);
		expect(busy(button)).toBeNull();
		expect(document.activeElement).toBe(view.name);
	});

	it('leaves the busy state when the request throws (exception)', async () => {
		vi.mocked(api.createUser).mockRejectedValue(new Error('Network down'));
		const view = userForm();
		await fireEvent.input(view.name, { target: { value: 'Ada' } });
		await fireEvent.input(view.email, { target: { value: 'ada@example.com' } });

		await fireEvent.submit(view.form);

		await waitFor(() => expect(busy(view.getByRole('button', { name: 'Create User' }))).toBeNull());
		expect(isDisabled(view.getByRole('button', { name: 'Create User' }))).toBe(false);
	});

	it('lets our own messages speak: the form turns off the browser bubble (limit, visual review 22)', () => {
		const view = userForm();
		expect(view.form.noValidate).toBe(true);
		expect(view.name.required).toBe(true);
		expect(view.email.required).toBe(true);
	});
});

describe('Add Task button', () => {
	it('stays enabled and busy during a slow request, then settles (happy path)', async () => {
		let answer!: (value: ApiResult<Task>) => void;
		vi.mocked(api.createTask).mockReturnValue(new Promise((resolve) => (answer = resolve)));
		const view = taskForm();
		await fireEvent.input(view.title, { target: { value: 'Plan' } });
		const button = view.getByRole('button', { name: 'Add Task' });
		button.focus();

		await fireEvent.submit(view.form);

		const sending = view.getByRole('button', { name: 'Adding…' });
		expect(isDisabled(sending)).toBe(false);
		expect(busy(sending)).toBe('true');
		expect(document.activeElement).toBe(sending);
		answer({ success: true, data: { ...review, id: 11, title: 'Plan' } });
		await waitFor(() => expect(busy(view.getByRole('button', { name: 'Add Task' }))).toBeNull());
	});

	it('sends a double submit once (limit)', async () => {
		vi.mocked(api.createTask).mockReturnValue(new Promise(() => {}));
		const view = taskForm();
		await fireEvent.input(view.title, { target: { value: 'Plan' } });

		await fireEvent.submit(view.form);
		await fireEvent.submit(view.form);

		expect(api.createTask).toHaveBeenCalledTimes(1);
	});

	it('is neither busy nor disabled while the list loads (limit)', async () => {
		const view = taskForm();

		app.tasks.status.loading = true;
		await tick();

		const button = view.getByRole('button', { name: 'Add Task' });
		expect(isDisabled(button)).toBe(false);
		expect(busy(button)).toBeNull();
	});

	it('stays enabled and focuses the title when it is empty (error)', async () => {
		const view = taskForm();

		await fireEvent.submit(view.form);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(api.createTask).not.toHaveBeenCalled();
		expect(isDisabled(view.getByRole('button', { name: 'Add Task' }))).toBe(false);
		expect(document.activeElement).toBe(view.title);
	});

	it('leaves the busy state when the request throws (exception)', async () => {
		vi.mocked(api.createTask).mockRejectedValue(new Error('Network down'));
		const view = taskForm();
		await fireEvent.input(view.title, { target: { value: 'Plan' } });

		await fireEvent.submit(view.form);

		await waitFor(() => expect(busy(view.getByRole('button', { name: 'Add Task' }))).toBeNull());
	});

	it('turns off the browser bubble on the form (limit, visual review 22)', () => {
		expect(taskForm().form.noValidate).toBe(true);
	});
});

describe('Save button of an edit', () => {
	async function openEdit() {
		const view = renderWithApp(app, TaskForm, { user: ada });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		await tick();
		const save = view.getByRole('button', { name: 'Save' });
		const form = save.closest('form')!;
		return { view, save, form };
	}

	it('stays enabled and busy during a slow request, with its label, and sends once (happy path)', async () => {
		let answer!: (value: ApiResult<unknown>) => void;
		vi.mocked(api.updateTask).mockReturnValue(
			new Promise((resolve) => (answer = resolve)) as never
		);
		const { save, form } = await openEdit();
		save.focus();

		await fireEvent.submit(form);
		await fireEvent.submit(form);

		expect(api.updateTask).toHaveBeenCalledTimes(1);
		expect(isDisabled(save)).toBe(false);
		expect(busy(save)).toBe('true');
		expect(save.textContent?.trim()).toBe('Save');
		expect(document.activeElement).toBe(save);
		answer({
			success: true,
			data: { id: 10, title: 'Review', description: 'Code', completed: false }
		});
	});

	it('is not busy while the list loads (limit)', async () => {
		const { save } = await openEdit();

		app.tasks.status.loading = true;
		await tick();

		expect(isDisabled(save)).toBe(false);
		expect(busy(save)).toBeNull();
	});

	it('stays enabled when the title is emptied, and focuses it (error)', async () => {
		const { view, save, form } = await openEdit();
		const title = view.getAllByLabelText('Task Title')[1] as HTMLInputElement;
		await fireEvent.input(title, { target: { value: '' } });

		await fireEvent.submit(form);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(api.updateTask).not.toHaveBeenCalled();
		expect(isDisabled(save)).toBe(false);
		expect(document.activeElement).toBe(title);
	});

	it('leaves the busy state when the request throws (exception)', async () => {
		vi.mocked(api.updateTask).mockRejectedValue(new Error('Network down'));
		const { save, form } = await openEdit();

		await fireEvent.submit(form);

		await waitFor(() => expect(busy(save)).toBeNull());
	});

	it('turns off the browser bubble on the edit form (limit, visual review 22)', async () => {
		const { form } = await openEdit();
		expect(form.noValidate).toBe(true);
	});
});
