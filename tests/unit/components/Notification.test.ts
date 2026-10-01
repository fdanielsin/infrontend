import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { AppState } from '$lib/state/app-state.svelte';
import Notification from '$lib/ui/Notification.svelte';
import { renderWithApp } from '../support/render-with-app';

function messagesIn(region: HTMLElement) {
	return Array.from(region.querySelectorAll('p')).map((message) => message.textContent?.trim());
}

function toastOf(view: { getByText(text: string): HTMLElement }, message: string) {
	return view.getByText(message).parentElement as HTMLElement;
}
function itemAt<T>(items: T[], index: number): T {
	const item = items[index];
	if (item === undefined) throw new Error(`No item at index ${index}`);
	return item;
}

describe('Notification component', () => {
	let app: AppState;

	beforeEach(() => {
		app = new AppState();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it('shows the notifications of the store (happy path)', async () => {
		// GIVEN: A rendered, empty notification area.
		const { getByRole, getByText } = renderWithApp(app, Notification);
		expect(messagesIn(getByRole('status'))).toEqual([]);
		expect(messagesIn(getByRole('alert'))).toEqual([]);

		// WHEN: A notification is published.
		app.notifications.items = [{ id: 'n1', message: 'Saved', type: 'success' }];

		// THEN: It is displayed.
		await waitFor(() => expect(getByText('Saved')).toBeTruthy());
	});

	it('keeps both live regions in the page while no notification is shown (limit)', () => {
		// GIVEN / WHEN: The area is rendered without any notification.
		const { getAllByRole, getByRole } = renderWithApp(app, Notification);

		// THEN: One status and one alert region already exist, empty, so that a later
		// message is announced by assistive technologies.
		expect(getAllByRole('status')).toHaveLength(1);
		expect(getAllByRole('alert')).toHaveLength(1);
		expect(getByRole('status').children).toHaveLength(0);
		expect(getByRole('alert').children).toHaveLength(0);
	});

	it('stacks several notifications in order (limit)', () => {
		// GIVEN: Three notifications.
		app.notifications.items = [
			{ id: 'n1', message: 'First', type: 'info' },
			{ id: 'n2', message: 'Second', type: 'warning' },
			{ id: 'n3', message: 'Third', type: 'success' }
		];

		// WHEN: The area is rendered.
		const { getByRole } = renderWithApp(app, Notification);

		// THEN: All are shown, in publication order.
		expect(messagesIn(getByRole('status'))).toEqual(['First', 'Second', 'Third']);
	});

	it('announces errors in the alert region and the other types in the status region (boundary)', () => {
		// GIVEN: One notification of each type.
		app.notifications.items = [
			{ id: 'e', message: 'Error', type: 'error' },
			{ id: 's', message: 'Success', type: 'success' },
			{ id: 'i', message: 'Info', type: 'info' },
			{ id: 'w', message: 'Warning', type: 'warning' }
		];

		// WHEN: The area is rendered.
		const { getByRole } = renderWithApp(app, Notification);

		// THEN: Only the error interrupts assistive technologies.
		expect(messagesIn(getByRole('alert'))).toEqual(['Error']);
		expect(messagesIn(getByRole('status'))).toEqual(['Success', 'Info', 'Warning']);
	});

	it('closes only the notification whose dismiss button is pressed (happy path)', async () => {
		// GIVEN: Two notifications without timer.
		const keptId = app.notifications.add('Kept', 'info', 0);
		app.notifications.add('Closed', 'error', 0);
		const view = renderWithApp(app, Notification);

		// WHEN: The dismiss button of the error is pressed.
		await fireEvent.click(
			within(view.getByRole('alert')).getByRole('button', { name: 'Dismiss notification' })
		);

		// THEN: Only that notification is gone.
		expect(app.notifications.items.map((toast) => toast.id)).toEqual([keptId]);
		expect(view.queryByText('Closed')).toBeNull();
		expect(view.getByText('Kept')).toBeTruthy();
	});

	it('pauses a notification while hovered and resumes it with the time left (happy path)', async () => {
		// GIVEN: A 1 s notification, hovered after 400 ms.
		vi.useFakeTimers();
		app.notifications.add('Saved', 'success', 1000);
		const view = renderWithApp(app, Notification);
		vi.advanceTimersByTime(400);
		await fireEvent.mouseEnter(toastOf(view, 'Saved'));

		// WHEN: The pointer stays long after the duration, then leaves.
		vi.advanceTimersByTime(5000);
		await tick();
		expect(view.getByText('Saved')).toBeTruthy();
		await fireEvent.mouseLeave(toastOf(view, 'Saved'));

		// THEN: It disappears after the 600 ms that were left, not before.
		vi.advanceTimersByTime(599);
		await tick();
		expect(view.queryByText('Saved')).not.toBeNull();
		vi.advanceTimersByTime(1);
		await tick();
		expect(view.queryByText('Saved')).toBeNull();
	});

	it('pauses a notification while the keyboard focus is inside it (happy path)', async () => {
		// GIVEN: A 1 s notification and a control outside of it.
		vi.useFakeTimers();
		const outside = document.body.appendChild(document.createElement('button'));
		app.notifications.add('Saved', 'success', 1000);
		const view = renderWithApp(app, Notification);

		// WHEN: Its dismiss button gets the focus for longer than the duration, then loses it.
		view.getByRole('button', { name: 'Dismiss notification' }).focus();
		vi.advanceTimersByTime(5000);
		await tick();
		expect(view.getByText('Saved')).toBeTruthy();
		outside.focus();

		// THEN: The timer resumes with the full time left.
		vi.advanceTimersByTime(999);
		await tick();
		expect(view.queryByText('Saved')).not.toBeNull();
		vi.advanceTimersByTime(1);
		await tick();
		expect(view.queryByText('Saved')).toBeNull();
		outside.remove();
	});

	it('stays paused when the pointer leaves while the focus is still inside (limit)', async () => {
		// GIVEN: A focused and hovered 1 s notification.
		vi.useFakeTimers();
		app.notifications.add('Saved', 'success', 1000);
		const view = renderWithApp(app, Notification);
		view.getByRole('button', { name: 'Dismiss notification' }).focus();
		await fireEvent.mouseEnter(toastOf(view, 'Saved'));

		// WHEN: The pointer leaves while the focus stays.
		await fireEvent.mouseLeave(toastOf(view, 'Saved'));
		vi.advanceTimersByTime(5000);
		await tick();

		// THEN: It is still shown.
		expect(view.getByText('Saved')).toBeTruthy();
	});

	describe('focus after a notification is dismissed from the keyboard (WCAG 2.4.3)', () => {
		let field: HTMLInputElement;
		let main: HTMLElement;

		beforeEach(() => {
			main = document.body.appendChild(document.createElement('main'));
			main.tabIndex = -1;
			field = main.appendChild(document.createElement('input'));
			field.setAttribute('aria-label', 'Task Title');
		});

		afterEach(() => {
			main.remove();
		});

		function dismissButtons(region: HTMLElement) {
			const buttons = within(region).getAllByRole('button', { name: 'Dismiss notification' });
			return { first: itemAt(buttons, 0), second: buttons[1] };
		}

		it('moves to the dismiss button of the next notification of the same region (happy path)', async () => {
			// GIVEN: Two errors and a status; the keyboard user comes from a field to the first error.
			app.notifications.add('First error', 'error', 0);
			app.notifications.add('Second error', 'error', 0);
			app.notifications.add('Saved', 'success', 0);
			const view = renderWithApp(app, Notification);
			field.focus();
			const { first, second: maybeSecond } = dismissButtons(view.getByRole('alert'));
			const second = maybeSecond as HTMLElement;
			first.focus();

			// WHEN: The first error is dismissed.
			await fireEvent.click(first);
			await tick();

			// THEN: The focus lands on the dismiss button of the next error.
			expect(document.activeElement).toBe(second);
		});

		it('prefers the next notification over the previous one when dismissing a middle one (limit)', async () => {
			// GIVEN: Three errors; the focus is on the dismiss button of the middle one.
			app.notifications.add('First error', 'error', 0);
			app.notifications.add('Second error', 'error', 0);
			app.notifications.add('Third error', 'error', 0);
			const view = renderWithApp(app, Notification);
			field.focus();
			const buttons = within(view.getByRole('alert')).getAllByRole('button', {
				name: 'Dismiss notification'
			});
			const [middle, last] = [itemAt(buttons, 1), itemAt(buttons, 2)];
			middle.focus();

			// WHEN: The middle error is dismissed.
			await fireEvent.click(middle);
			await tick();

			// THEN: The focus lands on the dismiss button of the next (third) error.
			expect(document.activeElement).toBe(last);
		});

		it('moves to the dismiss button of the previous notification when the last one is dismissed (boundary)', async () => {
			// GIVEN: Two errors; the focus is on the dismiss button of the last one.
			app.notifications.add('First error', 'error', 0);
			app.notifications.add('Second error', 'error', 0);
			const view = renderWithApp(app, Notification);
			field.focus();
			const { first, second: maybeSecond } = dismissButtons(view.getByRole('alert'));
			const second = maybeSecond as HTMLElement;
			second.focus();

			// WHEN: The last error is dismissed.
			await fireEvent.click(second);
			await tick();

			// THEN: The focus lands on the dismiss button of the previous error.
			expect(document.activeElement).toBe(first);
		});

		it('goes back to the field it came from when the region has no other notification (happy path)', async () => {
			// GIVEN: One error and one status; the keyboard user tabs from a field to the error.
			app.notifications.add('Only error', 'error', 0);
			app.notifications.add('Saved', 'success', 0);
			const view = renderWithApp(app, Notification);
			field.focus();
			const { first: dismiss } = dismissButtons(view.getByRole('alert'));
			dismiss.focus();

			// WHEN: The error is dismissed.
			await fireEvent.click(dismiss);
			await tick();

			// THEN: The focus returns to the field, not to the notification of another region.
			expect(document.activeElement).toBe(field);
		});

		it('remembers the field it came from while moving between notifications (limit)', async () => {
			// GIVEN: The keyboard user tabs from a field through two errors.
			app.notifications.add('First error', 'error', 0);
			app.notifications.add('Second error', 'error', 0);
			const view = renderWithApp(app, Notification);
			field.focus();
			const { first, second: maybeSecond } = dismissButtons(view.getByRole('alert'));
			const second = maybeSecond as HTMLElement;
			first.focus();
			second.focus();

			// WHEN: Both errors are dismissed, the last one first.
			await fireEvent.click(second);
			await tick();
			expect(document.activeElement).toBe(first);
			await fireEvent.click(first);
			await tick();

			// THEN: The focus returns to the field, not to a removed notification.
			expect(document.activeElement).toBe(field);
		});

		it('does not send the focus back to a field left before an earlier visit (limit)', async () => {
			// GIVEN: The user tabbed from the field into the notifications once, then left them
			// for the page body.
			app.notifications.add('First error', 'error', 0);
			app.notifications.add('Saved', 'success', 0);
			const view = renderWithApp(app, Notification);
			field.focus();
			within(view.getByRole('status'))
				.getByRole('button', { name: 'Dismiss notification' })
				.focus();
			(document.activeElement as HTMLElement).blur();

			// WHEN: The focus enters the notifications again from nowhere, and the error is dismissed.
			const { first: dismiss } = dismissButtons(view.getByRole('alert'));
			dismiss.focus();
			await fireEvent.click(dismiss);
			await tick();

			// THEN: The focus goes to the main landmark, not to the field of the earlier visit.
			expect(document.activeElement).toBe(main);
		});

		it('leaves the focus in the field when a toast is closed with a click that did not focus it (sad path)', async () => {
			// GIVEN: The user types in a field while two errors are shown (Safari does not
			// focus a button on click).
			app.notifications.add('First error', 'error', 0);
			app.notifications.add('Second error', 'error', 0);
			const view = renderWithApp(app, Notification);
			field.focus();
			const { first } = dismissButtons(view.getByRole('alert'));

			// WHEN: The first error is closed with the pointer, the focus staying in the field.
			await fireEvent.click(first);
			await tick();

			// THEN: The toast is gone and the focus stays in the field.
			expect(view.queryByText('First error')).toBeNull();
			expect(document.activeElement).toBe(field);
		});

		it('falls back to the main landmark when the previous element is gone (exception)', async () => {
			// GIVEN: The field the user came from is removed while the notification has the focus.
			app.notifications.add('Only error', 'error', 0);
			const view = renderWithApp(app, Notification);
			field.focus();
			const { first: dismiss } = dismissButtons(view.getByRole('alert'));
			dismiss.focus();
			field.remove();

			// WHEN: The error is dismissed.
			await fireEvent.click(dismiss);
			await tick();

			// THEN: The focus goes to the main landmark, never to the body.
			expect(document.activeElement).toBe(main);
		});
	});
});
