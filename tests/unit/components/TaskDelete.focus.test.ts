import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import { renderWithApp } from '../support/render-with-app';
import TaskFormWithToasts from '../support/TaskFormWithToasts.svelte';

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
const review = { id: 10, title: 'Review', description: '', user_id: 1, completed: false };
const deploy = { id: 11, title: 'Deploy', description: '', user_id: 1, completed: true };

async function settle() {
	await tick();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await tick();
}

describe('focus around the Undo toast', () => {
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
		vi.mocked(api.deleteTask).mockResolvedValue({ success: true });
		app = new AppState();
		app.tasks.clear(1);
		app.tasks.tasks = [review, deploy];
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	async function deleteReview() {
		const view = renderWithApp(app, TaskFormWithToasts, { user });
		const button = view.getByRole('button', { name: 'Delete Review' });
		button.focus();
		await fireEvent.click(button);
		await settle();
		return view;
	}

	it('puts the focus on the Undo button after a deletion, so the keyboard has time (happy path)', async () => {
		const view = await deleteReview();

		const undo = view.getByRole('button', { name: 'Undo' });
		expect(document.activeElement).toBe(undo);
	});

	it('keeps the deletion waiting as long as the focus stays on Undo (limit, WCAG 2.2.1)', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		const view = await deleteReview();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(view.getByRole('button', { name: 'Undo' })).toBeTruthy();
		expect(api.deleteTask).not.toHaveBeenCalled();
	});

	it('gives the focus back to the list heading when the toast is closed (happy path)', async () => {
		const view = await deleteReview();

		await fireEvent.click(view.getByRole('button', { name: 'Dismiss notification' }));
		await settle();

		expect(document.activeElement).toBe(view.getByRole('heading', { name: 'All done' }));
		expect(api.deleteTask).toHaveBeenCalledTimes(1);
	});

	it('gives the focus to the heading when the deletion is refused and the toast leaves (sad path)', async () => {
		vi.mocked(api.deleteTask).mockResolvedValue({ success: false, error: 'Server error' });
		const view = await deleteReview();

		await fireEvent.click(view.getByRole('button', { name: 'Dismiss notification' }));
		await settle();

		expect(document.activeElement).toBe(view.getByRole('heading', { name: '1 to do of 2' }));
	});

	it('puts the focus on the restored checkbox after Undo (happy path)', async () => {
		const view = await deleteReview();

		await fireEvent.click(view.getByRole('button', { name: 'Undo' }));
		await settle();

		expect(document.activeElement).toBe(view.getByRole('checkbox', { name: 'Review' }));
	});

	it('gives the focus to the heading when it is already on <body> as the toast ends (boundary)', async () => {
		const view = await deleteReview();
		(document.activeElement as HTMLElement).blur();
		expect(document.activeElement).toBe(document.body);

		app.notifications.remove(app.notifications.items[0]!.id, 'expired');
		await settle();

		expect(document.activeElement).toBe(view.getByRole('heading', { name: 'All done' }));
	});

	it('does not take the focus back when it has moved elsewhere before the toast ends (limit)', async () => {
		const view = await deleteReview();
		const edit = view.getByRole('button', { name: 'Edit Deploy' });
		edit.focus();

		app.notifications.remove(app.notifications.items[0]!.id, 'expired');
		await settle();

		expect(document.activeElement).toBe(edit);
	});

	it('draws the undo icon before the label, hidden from assistive technology (happy path)', async () => {
		const view = await deleteReview();

		const undo = view.getByRole('button', { name: 'Undo' });
		const icon = undo.querySelector('svg');
		expect(icon?.getAttribute('data-icon')).toBe('undo');
		expect(icon?.getAttribute('aria-hidden')).toBe('true');
		expect(undo.textContent?.trim()).toBe('Undo');
	});

	it('names the Undo button for a screen reader (happy path)', async () => {
		const view = await deleteReview();

		expect(view.getByRole('button', { name: 'Undo' }).textContent?.trim()).toBe('Undo');
		expect(view.getByRole('status').textContent).toContain('Task deleted: Review');
	});
});
