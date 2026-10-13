import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { api, type User } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import { renderWithApp } from '../support/render-with-app';
import HomeWithToasts from '../support/HomeWithToasts.svelte';

vi.mock('$lib/api/client', () => ({
	api: {
		ready: vi.fn(),
		getUsers: vi.fn(),
		createUser: vi.fn(),
		getUser: vi.fn(),
		updateUser: vi.fn(),
		deleteUser: vi.fn(),
		getUserTasks: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		deleteTask: vi.fn()
	}
}));

const ada: User = { id: 1, name: 'Ada', email: 'ada@example.com' };
const bob: User = { id: 2, name: 'Bob', email: 'bob@example.com' };
const twin: User = { id: 3, name: 'Ada', email: 'ada.two@example.com' };

async function settle() {
	await tick();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await tick();
}

describe('actions on a user in the list', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(private readonly report: (entries: { target: Element }[]) => void) {}
				observe(target: Element) {
					this.report([{ target }]);
				}
				unobserve() {}
				disconnect() {}
			}
		);
		vi.mocked(api.ready).mockResolvedValue({ success: true, data: { status: 'ready' } });
		vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [ada, bob] });
		vi.mocked(api.getUser).mockImplementation((id: number) =>
			Promise.resolve({ success: true, data: id === ada.id ? ada : bob })
		);
		vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });
		vi.mocked(api.deleteUser).mockResolvedValue({ success: true });
		app = new AppState();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	async function open() {
		const view = renderWithApp(app, HomeWithToasts);
		await view.findByRole('button', { name: 'Edit Ada (ada@example.com)' });
		return view;
	}

	describe('what each row offers (USER-R19, USER-R22)', () => {
		it('has three sibling controls per row, with names that carry the name and the email (happy path)', async () => {
			const view = await open();

			const row = view.getByRole('button', { name: /^Ada/ }).closest('li')!;
			const controls = [...row.querySelectorAll('button')];
			expect(controls.map((control) => control.getAttribute('aria-label') ?? '')).toEqual([
				'',
				'Edit Ada (ada@example.com)',
				'Delete Ada (ada@example.com)'
			]);
			for (const control of controls) expect(control.querySelector('button')).toBeNull();
			expect(controls[0]!.hasAttribute('aria-pressed')).toBe(true);
		});

		it('tells two users of the same name apart (critère 28)', async () => {
			vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [ada, twin] });
			const view = await open();

			expect(view.getByRole('button', { name: 'Delete Ada (ada@example.com)' })).toBeTruthy();
			expect(view.getByRole('button', { name: 'Delete Ada (ada.two@example.com)' })).toBeTruthy();
		});
	});

	describe('deleting (USER-R19)', () => {
		it('takes the row out, lowers the count, shows the toast and sends nothing (critère 19)', async () => {
			const view = await open();
			await fireEvent.click(view.getByRole('button', { name: /^Ada/ }));
			await view.findByRole('heading', { name: 'Tasks for Ada' });

			await fireEvent.click(view.getByRole('button', { name: 'Delete Ada (ada@example.com)' }));
			await settle();

			expect(view.queryByRole('button', { name: /^Ada/ })).toBeNull();
			expect(view.getByRole('heading', { name: 'Users (1)' })).toBeTruthy();
			expect(view.getByRole('heading', { name: 'Select a user to manage tasks' })).toBeTruthy();
			expect(view.getByText('User and their tasks deleted: Ada')).toBeTruthy();
			expect(api.deleteUser).not.toHaveBeenCalled();
		});

		it('puts the focus on Undo, even after a click (critère 24, 25)', async () => {
			const view = await open();
			const button = view.getByRole('button', { name: 'Delete Ada (ada@example.com)' });
			button.focus();

			await fireEvent.click(button);
			await settle();

			expect(document.activeElement).toBe(view.getByRole('button', { name: 'Undo' }));
		});

		it('puts the focus on the selection button of the restored row, not selected, never on Delete (critère 24)', async () => {
			const view = await open();
			await fireEvent.click(view.getByRole('button', { name: 'Delete Ada (ada@example.com)' }));
			await settle();

			await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
			await settle();

			const restored = view.getByRole('button', { name: /^Ada/ });
			expect(document.activeElement).toBe(restored);
			expect(restored.getAttribute('aria-pressed')).toBe('false');
			expect(api.deleteUser).not.toHaveBeenCalled();
		});

		it('puts the focus on the list title when the toast leaves with the focus on it (critère 26)', async () => {
			const view = await open();
			await fireEvent.click(view.getByRole('button', { name: 'Delete Ada (ada@example.com)' }));
			await settle();
			expect(document.activeElement).toBe(view.getByRole('button', { name: 'Undo' }));

			app.notifications.remove(app.notifications.items[0]!.id, 'expired');
			await settle();

			expect(document.activeElement).toBe(view.getByRole('heading', { name: 'Users (1)' }));
		});

		it('ignores the other Delete buttons just after a deletion (critère 41)', async () => {
			const view = await open();
			await fireEvent.click(view.getByRole('button', { name: 'Delete Ada (ada@example.com)' }));
			await settle();

			await fireEvent.click(view.getByRole('button', { name: 'Delete Bob (bob@example.com)' }));

			expect(view.getByRole('button', { name: /^Bob/ })).toBeTruthy();
			expect(app.notifications.items).toHaveLength(1);
		});
	});

	describe('renaming (USER-R22)', () => {
		type View = Awaited<ReturnType<typeof open>>;
		// The create form has a field named Name too: the row's own field is found by its id.
		const nameField = () => document.getElementById('user-name-1') as HTMLInputElement;
		const editButton = (view: View, user = 'Ada (ada@example.com)') =>
			view.getByRole('button', { name: `Edit ${user}` });

		async function startEditing(view: View) {
			await fireEvent.click(editButton(view));
			await settle();
		}

		async function type(view: View, value: string) {
			await fireEvent.input(nameField(), { target: { value } });
		}

		const enter = (view: View, init: KeyboardEventInit = {}) =>
			fireEvent.keyDown(nameField(), { key: 'Enter', ...init });

		it('opens a field with the focus and the text selected; the email stays text (critère 43)', async () => {
			const view = await open();

			await startEditing(view);

			const field = nameField();
			expect(document.activeElement).toBe(field);
			expect(field.value).toBe('Ada');
			expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3]);
			expect(field.closest('li')!.querySelectorAll('input, textarea')).toHaveLength(1);
			expect(view.getByText('ada@example.com').tagName).not.toBe('INPUT');
		});

		it('disables Delete of this row and Edit of the others, and keeps the others selectable (critère 43)', async () => {
			const view = await open();

			await startEditing(view);

			expect(view.getByRole('button', { name: 'Delete Ada (ada@example.com)' })).toHaveProperty(
				'disabled',
				true
			);
			expect(editButton(view, 'Bob (bob@example.com)')).toHaveProperty('disabled', true);
			expect(view.getByRole('button', { name: /^Bob/ })).toHaveProperty('disabled', false);
		});

		it('is no selection button while edited, even selected (USER-R22)', async () => {
			const view = await open();
			await fireEvent.click(view.getByRole('button', { name: /^Ada/ }));
			await view.findByRole('heading', { name: 'Tasks for Ada' });

			await startEditing(view);

			expect(view.queryByRole('button', { name: /^Ada/ })).toBeNull();
			expect(document.querySelector('[aria-pressed]')).not.toBeNull();
		});

		it('saves with Enter: only the name is sent, the list and the task panel follow, no toast, the focus returns to Edit (critère 42)', async () => {
			vi.mocked(api.updateUser).mockResolvedValue({
				success: true,
				data: { ...ada, name: 'Ada L.' }
			});
			const view = await open();
			await fireEvent.click(view.getByRole('button', { name: /^Ada/ }));
			await view.findByRole('heading', { name: 'Tasks for Ada' });
			await startEditing(view);

			await type(view, '  Ada L.  ');
			await fireEvent.submit(nameField().closest('form')!);
			await settle();

			expect(api.updateUser).toHaveBeenCalledExactlyOnceWith(ada.id, { name: 'Ada L.' });
			expect(view.getByRole('heading', { name: 'Tasks for Ada L.' })).toBeTruthy();
			expect(view.getByRole('button', { name: /^Ada L\./ })).toBeTruthy();
			expect(app.notifications.items).toEqual([]);
			expect(document.activeElement).toBe(editButton(view, 'Ada L. (ada@example.com)'));
		});

		it('sends no email and offers no email field (critère 18)', async () => {
			vi.mocked(api.updateUser).mockResolvedValue({
				success: true,
				data: { ...ada, name: 'Ada L.' }
			});
			const view = await open();
			await startEditing(view);

			const row = nameField().closest('li')!;
			expect(row.querySelector('input[type=email], [id*=email]')).toBeNull();
			await type(view, 'Ada L.');
			await fireEvent.submit(nameField().closest('form')!);
			await settle();

			expect(Object.keys(vi.mocked(api.updateUser).mock.calls[0]![1])).toEqual(['name']);
		});

		it('closes on Escape without any request and keeps the old name (critère 43)', async () => {
			const view = await open();
			await startEditing(view);
			await type(view, 'Something else');

			await fireEvent.keyDown(nameField(), { key: 'Escape' });
			await settle();

			expect(api.updateUser).not.toHaveBeenCalled();
			expect(view.getByRole('button', { name: /^Ada/ })).toBeTruthy();
			expect(document.activeElement).toBe(editButton(view));
		});

		it('closes with Cancel without any request (happy path)', async () => {
			const view = await open();
			await startEditing(view);

			await fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
			await settle();

			expect(api.updateUser).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(editButton(view));
		});

		it('sends nothing for a name unchanged after trimming (critère 44)', async () => {
			const view = await open();
			await startEditing(view);

			await type(view, '  Ada ');
			await fireEvent.submit(nameField().closest('form')!);
			await settle();

			expect(api.updateUser).not.toHaveBeenCalled();
			expect(document.getElementById('user-name-1')).toBeNull();
		});

		it('does not submit on the Enter of an input method composition (critère 44)', async () => {
			const view = await open();
			await startEditing(view);
			await type(view, 'Ada L.');

			const composing = await enter(view, { isComposing: true });
			const safari = await enter(view, { keyCode: 229 });

			// A prevented event reports false: neither Enter was left to submit the form.
			expect([composing, safari]).toEqual([false, false]);
			expect(api.updateUser).not.toHaveBeenCalled();
		});

		it('shows the message under the field and keeps the focus there for an empty name (critère 45)', async () => {
			const view = await open();
			await startEditing(view);

			await type(view, '   ');
			await fireEvent.submit(nameField().closest('form')!);
			await settle();

			expect(view.getByText('Name is required')).toBeTruthy();
			expect(document.activeElement).toBe(nameField());
			expect(api.updateUser).not.toHaveBeenCalled();
		});

		it('refuses a name of more than 100 characters without a request (critère 45)', async () => {
			const view = await open();
			await startEditing(view);

			await type(view, 'x'.repeat(101));
			await fireEvent.submit(nameField().closest('form')!);
			await settle();

			expect(api.updateUser).not.toHaveBeenCalled();
			expect(nameField().getAttribute('aria-invalid')).toBe('true');
		});

		it('stays open with the typed name and shows an error when the server refuses (critère 45)', async () => {
			vi.mocked(api.updateUser).mockResolvedValue({
				success: false,
				error: 'Boom',
				status: 500,
				code: 'INTERNAL_ERROR'
			});
			const view = await open();
			await startEditing(view);

			await type(view, 'Ada L.');
			await fireEvent.submit(nameField().closest('form')!);
			await settle();

			expect(nameField().value).toBe('Ada L.');
			expect(app.notifications.items[0]?.type).toBe('error');
		});

		it('ignores a second submit while the first is on its way and marks the button busy (USER-R22)', async () => {
			let answer!: (value: { success: true; data: User }) => void;
			vi.mocked(api.updateUser).mockReturnValue(new Promise((resolve) => (answer = resolve)));
			const view = await open();
			await startEditing(view);
			await type(view, 'Ada L.');

			await fireEvent.submit(nameField().closest('form')!);
			await fireEvent.submit(nameField().closest('form')!);

			expect(api.updateUser).toHaveBeenCalledTimes(1);
			expect(view.getByRole('button', { name: 'Save' }).getAttribute('aria-busy')).toBe('true');
			answer({ success: true, data: { ...ada, name: 'Ada L.' } });
			await settle();
		});

		it('closes the form, drops the row and says so when the user was deleted elsewhere (critère 48)', async () => {
			vi.mocked(api.updateUser).mockResolvedValue({
				success: false,
				error: 'gone',
				status: 404,
				code: 'USER_NOT_FOUND'
			});
			const view = await open();
			await startEditing(view);

			await type(view, 'Ada L.');
			await fireEvent.submit(nameField().closest('form')!);
			await settle();

			await waitFor(() => expect(document.getElementById('user-name-1')).toBeNull());
			expect(view.queryByRole('button', { name: /^Ada/ })).toBeNull();
			expect(view.getByText('User already deleted')).toBeTruthy();
			expect(document.activeElement).toBe(view.getByRole('heading', { name: 'Users (1)' }));
			expect(editButton(view, 'Bob (bob@example.com)')).toHaveProperty('disabled', false);
		});
	});

	describe('a user found deleted elsewhere (USER-R23)', () => {
		it('puts the focus on the title of the task panel when a task is added for him (critère 47)', async () => {
			vi.mocked(api.createTask).mockResolvedValue({
				success: false,
				error: 'gone',
				status: 404,
				code: 'USER_NOT_FOUND'
			});
			const view = await open();
			await fireEvent.click(view.getByRole('button', { name: /^Ada/ }));
			await view.findByRole('heading', { name: 'Tasks for Ada' });

			await fireEvent.input(view.getByLabelText('Task Title'), { target: { value: 'T' } });
			await fireEvent.submit(view.getByLabelText('Task Title').closest('form')!);
			await settle();

			expect(view.queryByRole('button', { name: /^Ada/ })).toBeNull();
			expect(view.getByText('User already deleted')).toBeTruthy();
			expect(document.activeElement).toBe(
				view.getByRole('heading', { name: 'Select a user to manage tasks' })
			);
		});

		it('puts the focus on the list title when selecting him (critère 46)', async () => {
			vi.mocked(api.getUser).mockResolvedValue({
				success: false,
				error: 'gone',
				status: 404,
				code: 'USER_NOT_FOUND'
			});
			const view = await open();

			await fireEvent.click(view.getByRole('button', { name: /^Ada/ }));
			await settle();

			expect(view.getByText('User already deleted')).toBeTruthy();
			expect(document.activeElement).toBe(view.getByRole('heading', { name: 'Users (1)' }));
		});
	});
});
