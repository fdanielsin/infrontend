import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { AppState } from '$lib/state/app-state.svelte';
import { ANNOUNCEMENT_LIFETIME } from '$lib/state/notification.svelte';
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

	// jsdom has no layout: the stack measures 120 px, and a ResizeObserver that reports at once.
	const STACK_HEIGHT = 120;

	beforeEach(() => {
		app = new AppState();
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
		vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(STACK_HEIGHT);
		// jsdom has no scrollIntoView.
		HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	const reservedHeight = () =>
		document.documentElement.style.getPropertyValue('--toast-stack-height');

	it('reserves the height of the stack while a notification is shown, and releases it (happy path)', async () => {
		// GIVEN: An empty notification area.
		renderWithApp(app, Notification);

		// THEN: Nothing is reserved.
		await waitFor(() => expect(reservedHeight()).toBe('0px'));

		// WHEN: A notification is published.
		app.notifications.items = [{ id: 'n1', message: 'Saved', type: 'success' }];

		// THEN: The page reserves the room of the stack (WCAG 2.4.11).
		await waitFor(() => expect(reservedHeight()).toBe(`${STACK_HEIGHT}px`));

		// WHEN: The last notification goes.
		app.notifications.items = [];

		// THEN: The room is given back.
		await waitFor(() => expect(reservedHeight()).toBe('0px'));
	});

	it('removes the reservation when the area is destroyed (exception)', async () => {
		// GIVEN: A notification on the screen, and the room reserved for it.
		renderWithApp(app, Notification);
		app.notifications.items = [{ id: 'n1', message: 'Saved', type: 'success' }];
		await waitFor(() => expect(reservedHeight()).toBe(`${STACK_HEIGHT}px`));

		// WHEN: The area is removed from the page.
		cleanup();

		// THEN: No reservation is left on the page.
		expect(reservedHeight()).toBe('');
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
		const keptId = app.notifications.add('Kept', 'info', { duration: 0 });
		app.notifications.add('Closed', 'error', { duration: 0 });
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
		app.notifications.add('Saved', 'success', { duration: 1000 });
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

	it('scrolls a close button reached by keyboard fully into the stack (happy path)', () => {
		// GIVEN: An error toast in the stack.
		app.notifications.add('Database unavailable', 'error', { duration: 0 });
		const view = renderWithApp(app, Notification);

		// WHEN: Its close button gets the focus.
		view.getByRole('button', { name: 'Dismiss notification' }).focus();

		// THEN: The stack scrolls by the missing distance, none when the button already shows.
		expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
	});

	it('has no landmark while no notification is shown, but keeps the live regions (limit)', () => {
		// WHEN: The area is rendered without any notification.
		const view = renderWithApp(app, Notification);

		// THEN: There is no empty landmark, and the status and alert regions are still there.
		expect(view.queryByRole('region')).toBeNull();
		expect(view.getAllByRole('status')).toHaveLength(1);
		expect(view.getAllByRole('alert')).toHaveLength(1);
	});

	it('names the notification region while a notification is shown (happy path)', () => {
		// GIVEN: A notification.
		app.notifications.items = [{ id: 'n1', message: 'Saved', type: 'success' }];

		// WHEN: The notification area is rendered.
		const view = renderWithApp(app, Notification);

		// THEN: The region that scrolls and takes the focus has a name.
		expect(view.getByRole('region', { name: 'Notifications' })).toBeTruthy();
	});

	it('drops the landmark with the last notification and keeps the same live regions (boundary)', async () => {
		// GIVEN: A notification, and the live regions as first rendered.
		app.notifications.items = [{ id: 'n1', message: 'Saved', type: 'success' }];
		const view = renderWithApp(app, Notification);
		const status = view.getByRole('status');
		const alert = view.getByRole('alert');

		// WHEN: The last notification goes.
		app.notifications.items = [];

		// THEN: The landmark is gone; the very same live regions remain in the page.
		await waitFor(() => expect(view.queryByRole('region')).toBeNull());
		expect(view.getByRole('status')).toBe(status);
		expect(view.getByRole('alert')).toBe(alert);
		expect(status.isConnected && alert.isConnected).toBe(true);
	});

	describe('toast with an action', () => {
		const actionButton = (
			view: { getByRole: (role: string, options: { name: string }) => HTMLElement },
			name = 'Undo'
		) => view.getByRole('button', { name });

		it('shows the action as a button named by its label, after the message (happy path)', () => {
			// GIVEN: A toast with an action.
			app.notifications.add('Task deleted', 'info', {
				duration: 0,
				action: { label: 'Undo', run: vi.fn() }
			});

			// WHEN: The area is rendered.
			const view = renderWithApp(app, Notification);

			// THEN: The button is in the toast, between the message and the dismiss button.
			const toast = view.container.querySelector('[data-toast]') as HTMLElement;
			const names = within(toast)
				.getAllByRole('button')
				.map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim());
			expect(names).toEqual(['Undo', 'Dismiss notification']);
			expect(toast.textContent).toContain('Task deleted');
		});

		it('shows no button for a toast without action (limit)', () => {
			// GIVEN / WHEN: A plain toast.
			app.notifications.add('Saved', 'success', { duration: 0 });
			const view = renderWithApp(app, Notification);

			// THEN: Only the dismiss button.
			expect(
				view.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
			).toEqual(['Dismiss notification']);
		});

		it('runs the action once and removes the toast when the button is pressed (happy path)', async () => {
			// GIVEN: A toast with an action and a close callback.
			const run = vi.fn();
			const onclose = vi.fn();
			app.notifications.add('Task deleted', 'info', {
				duration: 0,
				action: { label: 'Undo', run },
				onclose
			});
			const view = renderWithApp(app, Notification);

			// WHEN: The button is pressed.
			await fireEvent.click(actionButton(view));
			await tick();

			// THEN: The action ran once, the close reason is "action", the toast is gone.
			expect(run).toHaveBeenCalledTimes(1);
			expect(onclose).toHaveBeenCalledExactlyOnceWith('action');
			expect(view.queryByText('Task deleted')).toBeNull();
		});

		it('ignores a second press made before the toast left (limit)', async () => {
			// GIVEN: A toast with an action.
			const run = vi.fn();
			app.notifications.add('Task deleted', 'info', {
				duration: 0,
				action: { label: 'Undo', run }
			});
			const view = renderWithApp(app, Notification);
			const button = actionButton(view);

			// WHEN: The button is pressed twice in a row.
			await fireEvent.click(button);
			await fireEvent.click(button);
			await tick();

			// THEN: The action ran once.
			expect(run).toHaveBeenCalledTimes(1);
		});

		it('works on an error toast, which is announced in the alert region (boundary)', async () => {
			// GIVEN: An error toast with a "Retry" action.
			const run = vi.fn();
			app.notifications.add('Could not save', 'error', {
				duration: 0,
				action: { label: 'Retry', run }
			});
			const view = renderWithApp(app, Notification);

			// WHEN: The button is pressed.
			await fireEvent.click(within(view.getByRole('alert')).getByRole('button', { name: 'Retry' }));

			// THEN: The action ran.
			expect(run).toHaveBeenCalledTimes(1);
		});

		it('pauses the timer while its button has the focus, then lets the toast expire (happy path)', () => {
			// GIVEN: A 6 s undo window and the button focused.
			vi.useFakeTimers();
			const onclose = vi.fn();
			app.notifications.add('Task deleted', 'info', {
				duration: 6000,
				action: { label: 'Undo', run: vi.fn() },
				onclose
			});
			const view = renderWithApp(app, Notification);
			actionButton(view).focus();

			// WHEN: A minute passes with the focus on the button.
			vi.advanceTimersByTime(60_000);

			// THEN: The toast waits for the user (WCAG 2.2.1).
			expect(view.getByText('Task deleted')).toBeTruthy();
			expect(onclose).not.toHaveBeenCalled();
		});

		it('lets a very long label break anywhere, so that it cannot widen the toast (limit)', () => {
			// GIVEN: A label without any space.
			app.notifications.add('Task deleted', 'info', {
				duration: 0,
				action: { label: 'U'.repeat(200), run: vi.fn() }
			});

			// WHEN: The area is rendered.
			const view = renderWithApp(app, Notification);

			// THEN: The button breaks anywhere and the grid column may shrink.
			expect(actionButton(view, 'U'.repeat(200)).classList.contains('wrap-anywhere')).toBe(true);
		});

		it('keeps the action when the toast also carries a server reference (limit)', () => {
			// GIVEN: An error with a reference and an action.
			app.notifications.add('Server error', 'error', {
				duration: 0,
				reference: 'req-42',
				action: { label: 'Retry', run: vi.fn() }
			});

			// WHEN: The area is rendered.
			const view = renderWithApp(app, Notification);

			// THEN: Copy and the action are both there, the action after the reference.
			const buttons = view
				.getAllByRole('button')
				.map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim());
			expect(buttons).toEqual(['Copy reference req-42', 'Retry', 'Dismiss notification']);
		});

		it('removes the toast and lets the error out when the action throws (exception)', async () => {
			// GIVEN: A failing action; the errors of the window are collected, not rethrown.
			const failures: unknown[] = [];
			const collect = (event: ErrorEvent) => {
				failures.push(event.error);
				event.preventDefault();
			};
			window.addEventListener('error', collect);
			app.notifications.add('Task deleted', 'info', {
				duration: 0,
				action: {
					label: 'Undo',
					run: () => {
						throw new Error('undo failed');
					}
				}
			});
			const view = renderWithApp(app, Notification);

			// WHEN: The button is pressed.
			await fireEvent.click(actionButton(view));
			await tick();
			window.removeEventListener('error', collect);

			// THEN: The toast is gone, and the error was not swallowed.
			expect(view.queryByText('Task deleted')).toBeNull();
			expect(failures.map((failure) => (failure as Error).message)).toEqual(['undo failed']);
		});

		describe('focus after the action (WCAG 2.4.3)', () => {
			let field: HTMLButtonElement;
			let restored: HTMLButtonElement;

			beforeEach(() => {
				field = document.body.appendChild(document.createElement('button'));
				field.textContent = 'Delete';
				restored = document.body.appendChild(document.createElement('button'));
				restored.textContent = 'Restored row';
			});

			afterEach(() => {
				field.remove();
				restored.remove();
			});

			it('returns to the place the keyboard came from when nothing else took the focus (happy path)', async () => {
				// GIVEN: The keyboard goes from a field to the action button.
				app.notifications.add('Task deleted', 'info', {
					duration: 0,
					action: { label: 'Undo', run: vi.fn() }
				});
				const view = renderWithApp(app, Notification);
				field.focus();
				actionButton(view).focus();

				// WHEN: The action is activated.
				await fireEvent.click(actionButton(view));
				await tick();

				// THEN: The focus is not dropped on the body.
				expect(document.activeElement).toBe(field);
			});

			it('still gives the focus back when the action throws (exception)', async () => {
				// GIVEN: A failing action, the focus on its button, errors of the window collected.
				const collect = (event: ErrorEvent) => event.preventDefault();
				window.addEventListener('error', collect);
				app.notifications.add('Task deleted', 'info', {
					duration: 0,
					action: {
						label: 'Undo',
						run: () => {
							throw new Error('undo failed');
						}
					}
				});
				const view = renderWithApp(app, Notification);
				field.focus();
				actionButton(view).focus();

				// WHEN: The action is activated.
				await fireEvent.click(actionButton(view));
				await tick();
				window.removeEventListener('error', collect);

				// THEN: The toast is gone and the focus is not on the body.
				expect(document.activeElement).toBe(field);
			});

			it('leaves the focus where the action put it (limit)', async () => {
				// GIVEN: An action that focuses the restored row, as an undo does.
				app.notifications.add('Task deleted', 'info', {
					duration: 0,
					action: { label: 'Undo', run: () => restored.focus() }
				});
				const view = renderWithApp(app, Notification);
				field.focus();
				actionButton(view).focus();

				// WHEN: The action is activated.
				await fireEvent.click(actionButton(view));
				await tick();

				// THEN: The focus stays on what the action chose.
				expect(document.activeElement).toBe(restored);
			});

			it('moves to the dismiss button of the next toast when there is one (boundary)', async () => {
				// GIVEN: An action toast followed by another toast, the focus on the action button.
				app.notifications.add('Task deleted', 'info', {
					duration: 0,
					action: { label: 'Undo', run: vi.fn() }
				});
				app.notifications.add('Saved', 'success', { duration: 0 });
				const view = renderWithApp(app, Notification);
				actionButton(view).focus();

				// WHEN: The action is activated.
				await fireEvent.click(actionButton(view));
				await tick();

				// THEN: The focus is on the dismiss button of the remaining toast.
				const remaining = view.getByRole('button', { name: 'Dismiss notification' });
				expect(document.activeElement).toBe(remaining);
			});
		});
	});

	describe('announcements for screen readers', () => {
		const announcementIn = (view: { container: HTMLElement }) =>
			view.container.querySelector<HTMLElement>('[data-announcement]');

		it('renders a polite, atomic, visually hidden live region, empty at first (happy path)', () => {
			// GIVEN / WHEN: The notification area without anything to say.
			const view = renderWithApp(app, Notification);

			// THEN: The region exists already (a region added with its text is not announced).
			const region = announcementIn(view);
			expect(region).not.toBeNull();
			expect(region?.getAttribute('aria-live')).toBe('polite');
			expect(region?.getAttribute('aria-atomic')).toBe('true');
			expect(region?.classList.contains('sr-only')).toBe(true);
			expect(region?.textContent).toBe('');
		});

		it('writes the announcement in the region and shows no toast (happy path)', async () => {
			// GIVEN: The notification area.
			const view = renderWithApp(app, Notification);

			// WHEN: A sort is announced.
			app.notifications.announce('Tasks sorted by title');

			// THEN: The hidden region holds it; no toast, no landmark, nothing reserved.
			await waitFor(() => expect(announcementIn(view)?.textContent).toBe('Tasks sorted by title'));
			expect(view.container.querySelector('[data-toast]')).toBeNull();
			expect(view.queryByRole('region')).toBeNull();
			expect(reservedHeight()).toBe('0px');
		});

		it('keeps the very same region from one announcement to the next (limit)', async () => {
			// GIVEN: A region that has spoken once.
			const view = renderWithApp(app, Notification);
			const region = announcementIn(view);
			app.notifications.announce('First');
			await waitFor(() => expect(region?.textContent).toBe('First'));

			// WHEN: Another message follows.
			app.notifications.announce('Second');

			// THEN: The same element carries it (a new element would not be announced).
			await waitFor(() => expect(region?.textContent).toBe('Second'));
			expect(announcementIn(view)).toBe(region);
		});

		it('renders a repeated message again, as new content (limit)', async () => {
			// GIVEN: A message announced.
			const view = renderWithApp(app, Notification);
			app.notifications.announce('Same');
			await waitFor(() => expect(announcementIn(view)?.textContent).toBe('Same'));
			const firstText = announcementIn(view)?.firstChild;

			// WHEN: The same text is announced again.
			app.notifications.announce('Same');

			// THEN: The text node was replaced, so the live region changed.
			await waitFor(() => expect(announcementIn(view)?.firstChild).not.toBe(firstText));
			expect(announcementIn(view)?.textContent).toBe('Same');
		});

		it('empties the region when the announcement is forgotten (boundary)', async () => {
			// GIVEN: A message announced, and fake time.
			vi.useFakeTimers();
			const view = renderWithApp(app, Notification);
			app.notifications.announce('Gone soon');
			await tick();
			expect(announcementIn(view)?.textContent).toBe('Gone soon');

			// WHEN: Its lifetime ends.
			vi.advanceTimersByTime(ANNOUNCEMENT_LIFETIME);
			await tick();

			// THEN: No stale sentence is left for a reader browsing the page.
			expect(announcementIn(view)?.textContent).toBe('');
		});

		it('forgets the announcement and its timer when the area is removed (exception)', async () => {
			// GIVEN: A message announced, its timer running, and fake time.
			vi.useFakeTimers();
			const view = renderWithApp(app, Notification);
			app.notifications.announce('Left behind');
			await tick();
			expect(vi.getTimerCount()).toBe(1);

			// WHEN: The area leaves the page.
			view.unmount();

			// THEN: No timer is left to write into the state later, and no sentence waits for the
			// next area to read it.
			expect(vi.getTimerCount()).toBe(0);
			expect(app.notifications.announcement).toBeNull();
		});

		it('stays apart from the alert and status regions of the toasts (exception)', async () => {
			// GIVEN: An error toast is shown.
			app.notifications.add('Broken', 'error', { duration: 0 });
			const view = renderWithApp(app, Notification);

			// WHEN: A sort is announced meanwhile.
			app.notifications.announce('Sorted');

			// THEN: The announcement is in none of the toast regions, which keep their one toast.
			await waitFor(() => expect(announcementIn(view)?.textContent).toBe('Sorted'));
			expect(view.getByRole('alert').contains(announcementIn(view))).toBe(false);
			expect(view.getByRole('status').contains(announcementIn(view))).toBe(false);
			expect(messagesIn(view.getByRole('alert'))).toEqual(['Broken']);
			expect(view.getAllByRole('status')).toHaveLength(1);
		});

		it('can be destroyed while it holds a message (exception)', async () => {
			// GIVEN: A region holding a message.
			const view = renderWithApp(app, Notification);
			app.notifications.announce('Sorted');
			await waitFor(() => expect(announcementIn(view)?.textContent).toBe('Sorted'));

			// WHEN / THEN: Destroying it, then announcing again, throws nothing.
			expect(() => view.unmount()).not.toThrow();
			expect(() => app.notifications.announce('Again')).not.toThrow();
		});
	});

	it('pauses a notification while the keyboard focus is inside it (happy path)', async () => {
		// GIVEN: A 1 s notification and a control outside of it.
		vi.useFakeTimers();
		const outside = document.body.appendChild(document.createElement('button'));
		app.notifications.add('Saved', 'success', { duration: 1000 });
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
		app.notifications.add('Saved', 'success', { duration: 1000 });
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
			app.notifications.add('First error', 'error', { duration: 0 });
			app.notifications.add('Second error', 'error', { duration: 0 });
			app.notifications.add('Saved', 'success', { duration: 0 });
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
			app.notifications.add('First error', 'error', { duration: 0 });
			app.notifications.add('Second error', 'error', { duration: 0 });
			app.notifications.add('Third error', 'error', { duration: 0 });
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
			app.notifications.add('First error', 'error', { duration: 0 });
			app.notifications.add('Second error', 'error', { duration: 0 });
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
			app.notifications.add('Only error', 'error', { duration: 0 });
			app.notifications.add('Saved', 'success', { duration: 0 });
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
			app.notifications.add('First error', 'error', { duration: 0 });
			app.notifications.add('Second error', 'error', { duration: 0 });
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
			app.notifications.add('First error', 'error', { duration: 0 });
			app.notifications.add('Saved', 'success', { duration: 0 });
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
			app.notifications.add('First error', 'error', { duration: 0 });
			app.notifications.add('Second error', 'error', { duration: 0 });
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
			app.notifications.add('Only error', 'error', { duration: 0 });
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
