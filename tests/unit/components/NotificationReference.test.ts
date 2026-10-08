import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { AppState } from '$lib/state/app-state.svelte';
import Notification from '$lib/ui/Notification.svelte';
import { renderWithApp } from '../support/render-with-app';

const REFERENCE = 'a3622cb2-4f3c-47f6-a67f-ec5a359e45fb';

function stubClipboard(writeText: (text: string) => Promise<void> | void) {
	vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
}

describe('notification reference', () => {
	let app: AppState;

	beforeEach(() => {
		app = new AppState();
		// jsdom has no layout: the stack measures 120 px, and a ResizeObserver that reports at once.
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
		vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(120);
		HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('shows the reference of an error with a copy button (happy path)', () => {
		app.notifications.notifyError('Internal server error', { reference: REFERENCE });

		const view = renderWithApp(app, Notification);

		expect(view.getByText(`Reference: ${REFERENCE}`)).toBeTruthy();
		expect(view.getByRole('button', { name: `Copy reference ${REFERENCE}` })).toBeTruthy();
	});

	it('shows neither reference nor copy button when there is none (boundary)', () => {
		app.notifications.notifyError('Invalid data');

		const view = renderWithApp(app, Notification);

		expect(view.queryByText(/Reference/)).toBeNull();
		expect(view.queryByRole('button', { name: /Copy/ })).toBeNull();
		expect(view.getAllByRole('button')).toHaveLength(1);
	});

	it('has two stops in an error with a reference: copy, then dismiss, in that order (happy path)', () => {
		app.notifications.notifyError('Internal server error', { reference: REFERENCE });

		const view = renderWithApp(app, Notification);

		const names = view.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
		expect(names).toEqual([`Copy reference ${REFERENCE}`, 'Dismiss notification']);
	});

	it('copies the reference and confirms in the status region (happy path)', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		stubClipboard(writeText);
		app.notifications.notifyError('Internal server error', { reference: REFERENCE });
		const view = renderWithApp(app, Notification);

		await fireEvent.click(view.getByRole('button', { name: /Copy reference/ }));

		expect(writeText).toHaveBeenCalledWith(REFERENCE);
		const status = await view.findByText('Reference copied');
		expect(status.closest('[role="status"]')).not.toBeNull();
	});

	it('says the copy is impossible when the clipboard refuses, without an exception (sad path)', async () => {
		stubClipboard(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
		app.notifications.notifyError('Internal server error', { reference: REFERENCE });
		const view = renderWithApp(app, Notification);

		await fireEvent.click(view.getByRole('button', { name: /Copy reference/ }));

		const status = await view.findByText('Could not copy the reference');
		expect(status.closest('[role="status"]')).not.toBeNull();
		expect(view.queryByText('Reference copied')).toBeNull();
	});

	it('says the copy is impossible when there is no clipboard (exception)', async () => {
		vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
		app.notifications.notifyError('Internal server error', { reference: REFERENCE });
		const view = renderWithApp(app, Notification);

		await fireEvent.click(view.getByRole('button', { name: /Copy reference/ }));

		expect(await view.findByText('Could not copy the reference')).toBeTruthy();
	});

	it('keeps the reference selectable as a whole (limit)', () => {
		app.notifications.notifyError('Internal server error', { reference: REFERENCE });

		const view = renderWithApp(app, Notification);

		expect(view.getByText(`Reference: ${REFERENCE}`).className).toContain('select-all');
	});

	it('gives the focus to the dismiss button of the next toast, not to its copy button (boundary)', async () => {
		app.notifications.notifyError('First', { reference: REFERENCE });
		app.notifications.notifyError('Second', { reference: 'second-ref' });
		const view = renderWithApp(app, Notification);
		const [firstDismiss, secondDismiss] = view.getAllByRole('button', {
			name: 'Dismiss notification'
		});
		firstDismiss?.focus();

		await fireEvent.click(firstDismiss as HTMLElement);

		await waitFor(() => expect(document.activeElement).toBe(secondDismiss));
	});

	it('keeps the reference on a long text without leaving the toast (limit)', () => {
		const long = 'a'.repeat(64);
		app.notifications.notifyError('Internal server error', { reference: long });

		const view = renderWithApp(app, Notification);

		expect(view.getByText(`Reference: ${long}`).className).toContain('break-all');
	});
});
