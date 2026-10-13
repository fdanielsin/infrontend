import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ANNOUNCEMENT_LIFETIME,
	type CloseReason,
	ERROR_NOTIFICATION_DURATION,
	MAX_VISIBLE_TOASTS,
	NotificationState
} from '$lib/state/notification.svelte';

describe('notification store', () => {
	let notifications: NotificationState;

	beforeEach(() => {
		vi.useFakeTimers();
		notifications = new NotificationState();
	});

	it('adds a notification and removes it after its duration (happy path)', () => {
		// GIVEN: The notification store is empty.
		// WHEN: A timed success notification is added.
		const id = notifications.add('Saved', 'success', { duration: 1000 });

		// THEN: The notification is available until its duration expires.
		expect(notifications.items).toEqual([
			{ id, message: 'Saved', type: 'success', duration: 1000 }
		]);
		vi.advanceTimersByTime(1000);
		expect(notifications.items).toEqual([]);
	});

	it('removes only the requested notification (happy path)', () => {
		// GIVEN: Two notifications are present.
		const firstId = notifications.add('First', 'info', { duration: 0 });
		const secondId = notifications.add('Second', 'warning', { duration: 0 });

		// WHEN: The first notification is removed.
		notifications.remove(firstId);

		// THEN: The second notification remains.
		expect(notifications.items).toEqual([
			{ id: secondId, message: 'Second', type: 'warning', duration: 0 }
		]);
	});

	it('ignores the removal of an unknown id (sad path)', () => {
		// GIVEN: One notification.
		const id = notifications.add('Kept', 'info', { duration: 0 });

		// WHEN: An unknown id is removed.
		notifications.remove('notif-unknown');

		// THEN: The notification is still there.
		expect(notifications.items.map((n) => n.id)).toEqual([id]);
	});

	it('gives each notification a distinct id (limit)', () => {
		// GIVEN / WHEN: Several notifications with the same message are added.
		const ids = [1, 2, 3].map(() => notifications.add('Same', 'info', { duration: 0 }));

		// THEN: Every id is unique and every notification is kept.
		expect(new Set(ids).size).toBe(3);
		expect(notifications.items).toHaveLength(3);
	});

	it('keeps a notification until exactly its duration (boundary)', () => {
		// GIVEN: A notification lasting 1000 ms.
		notifications.add('Saved', 'success', { duration: 1000 });

		// WHEN / THEN: Still shown 1 ms before the deadline, gone at the deadline.
		vi.advanceTimersByTime(999);
		expect(notifications.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(notifications.items).toHaveLength(0);
	});

	it('never removes a notification with duration 0 by itself (boundary)', () => {
		// GIVEN: A notification without duration.
		notifications.add('Sticky', 'warning', { duration: 0 });

		// WHEN: A long time passes.
		vi.advanceTimersByTime(24 * 60 * 60 * 1000);

		// THEN: It is still shown.
		expect(notifications.items).toHaveLength(1);
	});

	it('notifies an error for exactly 6 s (boundary, QM-02)', () => {
		// GIVEN / WHEN: An error is notified.
		const id = notifications.notifyError('Email already in use');

		// THEN: It is an error notification kept until 6000 ms, not one ms more.
		expect(ERROR_NOTIFICATION_DURATION).toBe(6000);
		expect(notifications.items).toEqual([
			{ id, message: 'Email already in use', type: 'error', duration: 6000 }
		]);
		vi.advanceTimersByTime(5999);
		expect(notifications.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(notifications.items).toEqual([]);
	});

	describe('notifyError, persistent or not', () => {
		it('keeps a persistent error until it is closed, however long it takes (happy path, WCAG 2.2.1)', () => {
			// GIVEN / WHEN: A persistent error with its server reference.
			const id = notifications.notifyError('Internal server error', {
				reference: 'req-1',
				persistent: true
			});

			// THEN: No end of its own: duration 0, and nothing happens in a day.
			expect(notifications.items).toEqual([
				{ id, message: 'Internal server error', type: 'error', duration: 0, reference: 'req-1' }
			]);
			vi.advanceTimersByTime(24 * 60 * 60 * 1000);
			expect(notifications.items).toHaveLength(1);
			expect(vi.getTimerCount()).toBe(0);

			// WHEN: The user closes it.
			notifications.remove(id);

			// THEN: It is gone.
			expect(notifications.items).toEqual([]);
		});

		it('still lets a non-persistent error expire at exactly 6 s, with its reference (limit)', () => {
			// GIVEN / WHEN: A transient error with a reference.
			const id = notifications.notifyError('Invalid data', {
				reference: 'req-2',
				persistent: false
			});

			// THEN: 6000 ms like before.
			expect(notifications.items).toEqual([
				{ id, message: 'Invalid data', type: 'error', duration: 6000, reference: 'req-2' }
			]);
			vi.advanceTimersByTime(5999);
			expect(notifications.items).toHaveLength(1);
			vi.advanceTimersByTime(1);
			expect(notifications.items).toEqual([]);
		});

		it('treats an error without options as transient (boundary)', () => {
			// GIVEN / WHEN: The old call, without options.
			notifications.notifyError('Email already in use');
			notifications.notifyError('Email already in use', {});

			// THEN: Both last 6 s, and only the first was kept: it is not persistent.
			expect(notifications.items.map((toast) => toast.duration)).toEqual([6000, 6000]);
		});

		it('pauses and resumes nothing for a persistent error: no timer to stop (boundary)', () => {
			// GIVEN: A persistent error.
			const id = notifications.notifyError('Broken', { persistent: true });

			// WHEN: The pointer enters and leaves it.
			notifications.pause(id);
			notifications.resume(id);

			// THEN: No timer was created, the error is still there.
			expect(vi.getTimerCount()).toBe(0);
			expect(notifications.items).toHaveLength(1);
		});

		it('shows a persistent error once when the same one comes again without a reference (limit)', () => {
			// GIVEN: A network error, kept.
			const first = notifications.notifyError('Failed to fetch', { persistent: true });

			// WHEN: The same message comes three more times (a list that retries).
			const again = [1, 2, 3].map(() =>
				notifications.notifyError('Failed to fetch', { persistent: true })
			);

			// THEN: One toast; each call gives back its id.
			expect(notifications.items.map((toast) => toast.id)).toEqual([first]);
			expect(again).toEqual([first, first, first]);
		});

		it('shows two persistent errors with the same message and different references (limit)', () => {
			// GIVEN / WHEN: Two 500 answers, each with its own reference.
			notifications.notifyError('Internal server error', { reference: 'req-1', persistent: true });
			notifications.notifyError('Internal server error', { reference: 'req-2', persistent: true });

			// THEN: Both stay: a person quoting a reference to support needs each of them.
			expect(notifications.items.map((toast) => toast.reference)).toEqual(['req-1', 'req-2']);
		});

		it('shows two persistent errors with the same reference but another message (limit)', () => {
			// GIVEN / WHEN: Same reference, two messages.
			notifications.notifyError('One', { reference: 'req-1', persistent: true });
			notifications.notifyError('Two', { reference: 'req-1', persistent: true });

			// THEN: Two toasts.
			expect(notifications.items.map((toast) => toast.message)).toEqual(['One', 'Two']);
		});

		it('does not merge a persistent error with one that has a reference and one that has not (boundary)', () => {
			// GIVEN / WHEN: The same message, once without reference, once with.
			notifications.notifyError('Internal server error', { persistent: true });
			notifications.notifyError('Internal server error', { reference: 'req-1', persistent: true });

			// THEN: Two toasts.
			expect(notifications.items).toHaveLength(2);
		});

		it('shows the error again once the first one was closed (limit)', () => {
			// GIVEN: A persistent error, closed by the user.
			const first = notifications.notifyError('Failed to fetch', { persistent: true });
			notifications.remove(first);

			// WHEN: The same error comes again.
			const second = notifications.notifyError('Failed to fetch', { persistent: true });

			// THEN: It is shown again, as a new toast.
			expect(second).not.toBe(first);
			expect(notifications.items.map((toast) => toast.id)).toEqual([second]);
		});

		it('does not merge transient errors: each one lasts its own 6 s (boundary)', () => {
			// GIVEN / WHEN: The same transient error twice.
			notifications.notifyError('Email already in use');
			vi.advanceTimersByTime(3000);
			notifications.notifyError('Email already in use');

			// THEN: Two toasts, the first leaving 3 s before the second.
			expect(notifications.items).toHaveLength(2);
			vi.advanceTimersByTime(3000);
			expect(notifications.items).toHaveLength(1);
		});

		it('does not merge a persistent error with a transient one of the same message (boundary)', () => {
			// GIVEN: A transient error still on screen.
			notifications.notifyError('Failed to fetch');

			// WHEN: The same message arrives as persistent.
			notifications.notifyError('Failed to fetch', { persistent: true });

			// THEN: The persistent one is shown too: the other would leave by itself.
			expect(notifications.items.map((toast) => toast.duration)).toEqual([6000, 0]);
		});

		it('does not merge an error with a persistent info toast of the same text (boundary)', () => {
			// GIVEN: A persistent info toast.
			notifications.add('Failed to fetch', 'info', { duration: 0 });

			// WHEN: The same text arrives as a persistent error.
			notifications.notifyError('Failed to fetch', { persistent: true });

			// THEN: The error is shown: an error is announced as an alert.
			expect(notifications.items.map((toast) => toast.type)).toEqual(['info', 'error']);
		});
	});

	it('defaults to an info notification of 3 s (happy path)', () => {
		// GIVEN / WHEN: A notification is added without type nor duration.
		const id = notifications.add('Hello');

		// THEN: It is an info notification removed after 3000 ms.
		expect(notifications.items).toEqual([{ id, message: 'Hello', type: 'info', duration: 3000 }]);
		vi.advanceTimersByTime(3000);
		expect(notifications.items).toEqual([]);
	});

	describe('pause and resume (WCAG 2.2.1)', () => {
		const ids = () => notifications.items.map((toast) => toast.id);

		it('keeps a paused notification, then removes it after the time left once resumed (happy path)', () => {
			// GIVEN: A 1 s notification paused after 400 ms.
			const id = notifications.add('Saved', 'success', { duration: 1000 });
			vi.advanceTimersByTime(400);
			notifications.pause(id);

			// WHEN: Much more than its duration elapses, then it is resumed.
			vi.advanceTimersByTime(10_000);
			expect(ids()).toEqual([id]);
			notifications.resume(id);

			// THEN: It is removed exactly 600 ms later.
			vi.advanceTimersByTime(599);
			expect(ids()).toEqual([id]);
			vi.advanceTimersByTime(1);
			expect(ids()).toEqual([]);
		});

		describe('several reasons to wait', () => {
			it('goes on only once every reason is released: focus alone does not restart a hidden page (happy path)', () => {
				const id = notifications.add('Undo me', 'success', { duration: 1000 });
				vi.advanceTimersByTime(400);
				notifications.pause(id, 'hover');
				notifications.pause(id, 'hidden');

				// The tab switch blurs the toast: that releases hover/focus, not the hidden page.
				notifications.resume(id, 'hover');
				vi.advanceTimersByTime(10_000);
				expect(ids()).toEqual([id]);

				notifications.resume(id, 'hidden');
				vi.advanceTimersByTime(599);
				expect(ids()).toEqual([id]);
				vi.advanceTimersByTime(1);
				expect(ids()).toEqual([]);
			});

			it('keeps the time left across reasons, without counting the wait twice (boundary)', () => {
				const id = notifications.add('Undo me', 'success', { duration: 1000 });
				vi.advanceTimersByTime(300);
				notifications.pause(id, 'hover');
				vi.advanceTimersByTime(5000);
				notifications.pause(id, 'hidden');
				vi.advanceTimersByTime(5000);
				notifications.resume(id, 'hover');
				notifications.resume(id, 'hidden');

				vi.advanceTimersByTime(699);
				expect(ids()).toEqual([id]);
				vi.advanceTimersByTime(1);
				expect(ids()).toEqual([]);
			});

			it('treats a release of a reason never held as nothing, and a plain pause as hover (limit)', () => {
				const id = notifications.add('Undo me', 'success', { duration: 1000 });
				notifications.pause(id);
				notifications.resume(id, 'hidden');
				vi.advanceTimersByTime(5000);
				expect(ids()).toEqual([id]);

				notifications.resume(id);
				vi.advanceTimersByTime(1000);
				expect(ids()).toEqual([]);
			});

			it('forgets the reasons of a toast that left (limit)', () => {
				const id = notifications.add('Gone', 'success', { duration: 1000 });
				notifications.pause(id, 'hidden');
				notifications.remove(id);

				notifications.resume(id, 'hidden');
				vi.advanceTimersByTime(5000);
				expect(ids()).toEqual([]);
			});
		});

		it('removes a notification paused 1 ms before its end exactly 1 ms after the resume (boundary)', () => {
			// GIVEN: A 1 s notification paused at 999 ms.
			const id = notifications.add('Saved', 'success', { duration: 1000 });
			vi.advanceTimersByTime(999);
			notifications.pause(id);
			vi.advanceTimersByTime(5000);

			// WHEN: It is resumed.
			notifications.resume(id);

			// THEN: It stays 0 ms more, then goes at 1 ms.
			vi.advanceTimersByTime(0);
			expect(ids()).toEqual([id]);
			vi.advanceTimersByTime(1);
			expect(ids()).toEqual([]);
		});

		it('keeps the whole duration when paused and resumed at once (boundary)', () => {
			// GIVEN: A fresh 1 s notification.
			const id = notifications.add('Saved', 'success', { duration: 1000 });

			// WHEN: It is paused and resumed without time elapsing.
			notifications.pause(id);
			notifications.resume(id);

			// THEN: It is removed at 1000 ms, not before.
			vi.advanceTimersByTime(999);
			expect(ids()).toEqual([id]);
			vi.advanceTimersByTime(1);
			expect(ids()).toEqual([]);
		});

		it('does not restart the count when paused twice (limit)', () => {
			// GIVEN: A 1 s notification paused at 400 ms.
			const id = notifications.add('Saved', 'success', { duration: 1000 });
			vi.advanceTimersByTime(400);
			notifications.pause(id);

			// WHEN: It is paused again later, then resumed.
			vi.advanceTimersByTime(3000);
			notifications.pause(id);
			notifications.resume(id);

			// THEN: The 600 ms left are kept.
			vi.advanceTimersByTime(599);
			expect(ids()).toEqual([id]);
			vi.advanceTimersByTime(1);
			expect(ids()).toEqual([]);
		});

		it('ignores a resume of a running notification, which a later pause still stops (limit)', () => {
			// GIVEN: A running 1 s notification resumed without having been paused.
			const id = notifications.add('Saved', 'success', { duration: 1000 });
			vi.advanceTimersByTime(400);
			notifications.resume(id);

			// WHEN: It is paused before its end.
			vi.advanceTimersByTime(100);
			notifications.pause(id);
			vi.advanceTimersByTime(10_000);

			// THEN: No second timer removed it behind the pause.
			expect(ids()).toEqual([id]);
		});

		it('ignores pause and resume of an unknown notification (sad path)', () => {
			// GIVEN: One running notification.
			const id = notifications.add('Saved', 'success', { duration: 1000 });

			// WHEN: An unknown id is paused and resumed.
			notifications.pause('notif-unknown');
			notifications.resume('notif-unknown');

			// THEN: Nothing changes and the real one still ends on time.
			expect(ids()).toEqual([id]);
			vi.advanceTimersByTime(1000);
			expect(ids()).toEqual([]);
		});

		it('never removes a duration-0 notification, even after pause and resume (boundary)', () => {
			// GIVEN: A notification without timer.
			const id = notifications.add('Sticky', 'info', { duration: 0 });

			// WHEN: It is paused and resumed.
			notifications.pause(id);
			notifications.resume(id);
			vi.advanceTimersByTime(60_000);

			// THEN: It is still there and no timer is pending.
			expect(ids()).toEqual([id]);
			expect(vi.getTimerCount()).toBe(0);
		});

		it('keeps a paused notification paused when another toast arrives (boundary)', () => {
			// GIVEN: A 1 s notification paused after 400 ms, the pointer being on it.
			const paused = notifications.add('Read me', 'info', { duration: 1000 });
			vi.advanceTimersByTime(400);
			notifications.pause(paused);

			// WHEN: Another toast arrives, and much more than the duration elapses.
			notifications.add('Other', 'info', { duration: 0 });
			vi.advanceTimersByTime(5000);

			// THEN: The paused one is still there and leaves 600 ms after the resume, not before.
			expect(ids()).toContain(paused);
			notifications.resume(paused);
			vi.advanceTimersByTime(599);
			expect(ids()).toContain(paused);
			vi.advanceTimersByTime(1);
			expect(ids()).not.toContain(paused);
		});

		it('keeps a paused notification paused when another toast leaves (boundary)', () => {
			// GIVEN: A 1 s notification paused after 400 ms, next to another toast.
			const paused = notifications.add('Read me', 'info', { duration: 1000 });
			const other = notifications.add('Other', 'info', { duration: 0 });
			vi.advanceTimersByTime(400);
			notifications.pause(paused);

			// WHEN: The other toast leaves, and much more than the duration elapses.
			notifications.remove(other);
			vi.advanceTimersByTime(5000);

			// THEN: The paused one is still there and leaves 600 ms after the resume, not before.
			expect(ids()).toEqual([paused]);
			notifications.resume(paused);
			vi.advanceTimersByTime(599);
			expect(ids()).toEqual([paused]);
			vi.advanceTimersByTime(1);
			expect(ids()).toEqual([]);
		});

		it('does not bring back a notification dismissed while paused (exception)', () => {
			// GIVEN: A paused notification.
			const id = notifications.add('Saved', 'success', { duration: 1000 });
			notifications.pause(id);

			// WHEN: It is dismissed, then resumed (pointer leaving a removed toast).
			notifications.remove(id);
			notifications.resume(id);

			// THEN: It stays gone and no timer is left behind.
			expect(ids()).toEqual([]);
			expect(vi.getTimerCount()).toBe(0);
		});

		it('cancels the pending timer of a dismissed notification (exception)', () => {
			// GIVEN: A running notification.
			const id = notifications.add('Saved', 'success', { duration: 1000 });

			// WHEN: It is dismissed before its end.
			notifications.remove(id);

			// THEN: No timer is left behind.
			expect(vi.getTimerCount()).toBe(0);
		});
	});

	describe('announce (low severity, screen readers only)', () => {
		it('keeps the message for the live region and shows no toast (happy path)', () => {
			// GIVEN / WHEN: A sort is announced.
			notifications.announce('Tasks sorted by title');

			// THEN: The message is held for the live region; no toast, no timer of a toast.
			expect(notifications.announcement?.message).toBe('Tasks sorted by title');
			expect(notifications.items).toEqual([]);
			expect(notifications.statuses).toEqual([]);
		});

		it('replaces the previous message (happy path)', () => {
			// GIVEN: A first announcement.
			notifications.announce('First');

			// WHEN: A second one follows.
			notifications.announce('Second');

			// THEN: Only the latest is held.
			expect(notifications.announcement?.message).toBe('Second');
		});

		it('gives a repeated message a new identity so that it is read again (limit)', () => {
			// GIVEN: A message announced.
			notifications.announce('Same');
			const first = notifications.announcement;

			// WHEN: The very same text is announced again.
			notifications.announce('Same');

			// THEN: The announcement is a new one, the live region can re-render it.
			expect(notifications.announcement?.message).toBe('Same');
			expect(notifications.announcement?.id).not.toBe(first?.id);
		});

		it('keeps an empty message empty, as a way to say nothing (boundary)', () => {
			// GIVEN / WHEN: An empty message.
			notifications.announce('');

			// THEN: Nothing readable is held.
			expect(notifications.announcement?.message ?? '').toBe('');
		});

		it('forgets the message after ANNOUNCEMENT_LIFETIME, not one ms before (boundary)', () => {
			// GIVEN: An announcement.
			notifications.announce('Gone soon');

			// WHEN / THEN: Still held 1 ms before the deadline, forgotten at the deadline.
			vi.advanceTimersByTime(ANNOUNCEMENT_LIFETIME - 1);
			expect(notifications.announcement?.message).toBe('Gone soon');
			vi.advanceTimersByTime(1);
			expect(notifications.announcement).toBeNull();
		});

		it('restarts the lifetime with a newer message, leaving no second timer (exception)', () => {
			// GIVEN: An announcement half-way through its life, then a newer one.
			notifications.announce('Old');
			vi.advanceTimersByTime(ANNOUNCEMENT_LIFETIME / 2);
			notifications.announce('New');

			// WHEN: The old deadline passes.
			vi.advanceTimersByTime(ANNOUNCEMENT_LIFETIME / 2);

			// THEN: The newer message is still there, and a single timer is pending.
			expect(notifications.announcement?.message).toBe('New');
			expect(vi.getTimerCount()).toBe(1);
			vi.advanceTimersByTime(ANNOUNCEMENT_LIFETIME / 2);
			expect(notifications.announcement).toBeNull();
			expect(vi.getTimerCount()).toBe(0);
		});

		it('does not touch toasts already shown (limit)', () => {
			// GIVEN: A persistent error toast.
			const id = notifications.add('Broken', 'error', { duration: 0 });

			// WHEN: A message is announced.
			notifications.announce('Sorted');

			// THEN: The toast is untouched.
			expect(notifications.items.map((toast) => toast.id)).toEqual([id]);
		});
	});

	describe('options, action and close callback', () => {
		const close = () => vi.fn<(reason: CloseReason) => void>();

		it('takes the duration and the reference from the options (happy path)', () => {
			// GIVEN / WHEN: A toast with both options.
			const id = notifications.add('Saved', 'success', { duration: 1000, reference: 'req-1' });

			// THEN: They are on the item, and the toast leaves at the end of its duration.
			expect(notifications.items).toEqual([
				{ id, message: 'Saved', type: 'success', duration: 1000, reference: 'req-1' }
			]);
			vi.advanceTimersByTime(1000);
			expect(notifications.items).toEqual([]);
		});

		it('keeps the shape of a plain toast: no action, no callback on the item (limit)', () => {
			// GIVEN / WHEN: A toast with a callback but no action.
			const id = notifications.add('Saved', 'info', { onclose: close() });

			// THEN: The callback is the store's business, not part of the item.
			expect(notifications.items).toEqual([{ id, message: 'Saved', type: 'info', duration: 3000 }]);
		});

		it('keeps the action on the item (happy path)', () => {
			// GIVEN / WHEN: A toast with an action.
			const action = { label: 'Undo', run: vi.fn() };
			const id = notifications.add('Task deleted', 'info', { action });

			// THEN: The item carries it for the toast to render; nothing ran.
			expect(notifications.items).toEqual([
				{ id, message: 'Task deleted', type: 'info', duration: 3000, action }
			]);
			expect(action.run).not.toHaveBeenCalled();
		});

		it('runs the action once, removes the toast and closes it with "action" (happy path)', () => {
			// GIVEN: A toast with an action and a close callback.
			const run = vi.fn();
			const onclose = close();
			const id = notifications.add('Task deleted', 'info', {
				action: { label: 'Undo', run },
				onclose
			});

			// WHEN: The action is run.
			notifications.runAction(id);

			// THEN: Action first, then the close with its reason, once; the toast and its timer are gone.
			expect(run).toHaveBeenCalledTimes(1);
			expect(onclose).toHaveBeenCalledTimes(1);
			expect(onclose).toHaveBeenCalledWith('action');
			expect(run.mock.invocationCallOrder[0]).toBeLessThan(
				onclose.mock.invocationCallOrder[0] ?? 0
			);
			expect(notifications.items).toEqual([]);
			expect(vi.getTimerCount()).toBe(0);
		});

		it('closes with "dismissed" when the user removes it (happy path)', () => {
			// GIVEN: A toast with a close callback.
			const onclose = close();
			const id = notifications.add('Task deleted', 'info', { duration: 0, onclose });

			// WHEN: It is removed.
			notifications.remove(id);

			// THEN: The reason is "dismissed".
			expect(onclose).toHaveBeenCalledExactlyOnceWith('dismissed');
		});

		it('closes with "expired" at exactly its duration, not before (boundary)', () => {
			// GIVEN: A 6 s toast with a close callback.
			const onclose = close();
			notifications.add('Task deleted', 'info', { duration: 6000, onclose });

			// WHEN / THEN: Nothing at 5999 ms; "expired" at 6000 ms.
			vi.advanceTimersByTime(5999);
			expect(onclose).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);
			expect(onclose).toHaveBeenCalledExactlyOnceWith('expired');
		});

		it('never closes a toast of duration 0 by itself (boundary)', () => {
			// GIVEN: A toast without end.
			const onclose = close();
			notifications.add('Broken', 'error', { duration: 0, onclose });

			// WHEN: A day passes.
			vi.advanceTimersByTime(24 * 60 * 60 * 1000);

			// THEN: It is still there, nothing was called.
			expect(onclose).not.toHaveBeenCalled();
			expect(notifications.items).toHaveLength(1);
		});

		it('closes once only, whatever comes after (limit)', () => {
			// GIVEN: A toast with an action, a close callback and a timer.
			const run = vi.fn();
			const onclose = close();
			const id = notifications.add('Task deleted', 'info', {
				duration: 1000,
				action: { label: 'Undo', run },
				onclose
			});

			// WHEN: It is dismissed, then removed again, acted on and left to expire.
			notifications.remove(id);
			notifications.remove(id);
			notifications.runAction(id);
			vi.advanceTimersByTime(5000);

			// THEN: One close, and the action never ran.
			expect(onclose).toHaveBeenCalledExactlyOnceWith('dismissed');
			expect(run).not.toHaveBeenCalled();
		});

		it('runs the action once when it is triggered twice (limit)', () => {
			// GIVEN: A toast with an action.
			const run = vi.fn();
			const id = notifications.add('Task deleted', 'info', { action: { label: 'Undo', run } });

			// WHEN: A double click reaches the store.
			notifications.runAction(id);
			notifications.runAction(id);

			// THEN: The action ran once.
			expect(run).toHaveBeenCalledTimes(1);
		});

		it('does not run an action after the toast expired (limit)', () => {
			// GIVEN: A toast with an action, left to expire.
			const run = vi.fn();
			const id = notifications.add('Task deleted', 'info', {
				duration: 1000,
				action: { label: 'Undo', run }
			});
			vi.advanceTimersByTime(1000);

			// WHEN: A late click arrives.
			notifications.runAction(id);

			// THEN: Too late: nothing ran.
			expect(run).not.toHaveBeenCalled();
		});

		it('ignores an unknown id and a toast without action (sad path)', () => {
			// GIVEN: A plain toast.
			const onclose = close();
			const id = notifications.add('Saved', 'success', { duration: 0, onclose });

			// WHEN: Actions are asked of an unknown id and of the plain toast.
			notifications.runAction('notif-unknown');
			notifications.runAction(id);

			// THEN: Nothing happens: the plain toast stays, not closed.
			expect(notifications.items.map((toast) => toast.id)).toEqual([id]);
			expect(onclose).not.toHaveBeenCalled();
		});

		it('closes once as "expired" after a pause and a resume (boundary)', () => {
			// GIVEN: A 1 s toast paused after 400 ms.
			const onclose = close();
			const id = notifications.add('Task deleted', 'info', { duration: 1000, onclose });
			vi.advanceTimersByTime(400);
			notifications.pause(id);
			vi.advanceTimersByTime(60_000);
			expect(onclose).not.toHaveBeenCalled();

			// WHEN: It resumes and the 600 ms left pass.
			notifications.resume(id);
			vi.advanceTimersByTime(600);

			// THEN: One "expired".
			expect(onclose).toHaveBeenCalledExactlyOnceWith('expired');
		});

		it('removes the toast and still closes it when the action throws (exception)', () => {
			// GIVEN: An action that fails.
			const onclose = close();
			const id = notifications.add('Task deleted', 'info', {
				action: {
					label: 'Undo',
					run: () => {
						throw new Error('undo failed');
					}
				},
				onclose
			});

			// WHEN / THEN: The error reaches the caller; the toast is gone and closed with "action".
			expect(() => notifications.runAction(id)).toThrow('undo failed');
			expect(notifications.items).toEqual([]);
			expect(onclose).toHaveBeenCalledExactlyOnceWith('action');
			expect(vi.getTimerCount()).toBe(0);
		});

		it('removes the toast before its close callback runs, even if the callback throws (exception)', () => {
			// GIVEN: A close callback that fails, and a state read from inside it.
			let itemsSeenByCallback: number | undefined;
			const id = notifications.add('Task deleted', 'info', {
				duration: 0,
				onclose: () => {
					itemsSeenByCallback = notifications.items.length;
					throw new Error('commit failed');
				}
			});

			// WHEN / THEN: The error reaches the caller; the toast was already gone.
			expect(() => notifications.remove(id)).toThrow('commit failed');
			expect(itemsSeenByCallback).toBe(0);
			expect(notifications.items).toEqual([]);
		});

		it('lets the close callback add another toast (limit)', () => {
			// GIVEN: A callback that notifies a failure.
			const id = notifications.add('Task deleted', 'info', {
				duration: 0,
				onclose: () => notifications.add('Could not delete', 'error', { duration: 0 })
			});

			// WHEN: The first toast is removed.
			notifications.remove(id);

			// THEN: Only the new toast is left.
			expect(notifications.items.map((toast) => toast.message)).toEqual(['Could not delete']);
		});
	});

	describe('visible cap and queue', () => {
		const persistentError = (n: number) =>
			notifications.notifyError(`Server error ${n}`, { reference: `req-${n}`, persistent: true });
		const shownMessages = () => notifications.shown.map((toast) => toast.message);

		it('shows at most three toasts and queues the next, in order (happy path)', () => {
			// GIVEN / WHEN: Five toasts arrive.
			for (const n of [1, 2, 3, 4, 5]) notifications.add(`Toast ${n}`, 'info', { duration: 0 });

			// THEN: The first three are shown; all five are kept, the others wait.
			expect(MAX_VISIBLE_TOASTS).toBe(3);
			expect(shownMessages()).toEqual(['Toast 1', 'Toast 2', 'Toast 3']);
			expect(notifications.items).toHaveLength(5);
		});

		it('promotes the next toast when one leaves, in arrival order (happy path)', () => {
			const first = notifications.add('Toast 1', 'info', { duration: 0 });
			for (const n of [2, 3, 4, 5]) notifications.add(`Toast ${n}`, 'info', { duration: 0 });

			notifications.remove(first);

			expect(shownMessages()).toEqual(['Toast 2', 'Toast 3', 'Toast 4']);
		});

		it('starts the timer of a queued toast when it is shown, never before (happy path)', () => {
			// GIVEN: Three persistent errors fill the stack; a 1 s info waits behind them.
			const ids = [1, 2, 3].map(persistentError);
			notifications.add('Waiting', 'info', { duration: 1000 });

			// WHEN: Far more than its duration passes while it is queued.
			vi.advanceTimersByTime(5000);

			// THEN: It has not been lost.
			expect(notifications.items.map((toast) => toast.message)).toContain('Waiting');

			// WHEN: A place frees up.
			notifications.remove(ids[0]!);

			// THEN: It is shown for its whole duration, to the millisecond.
			expect(shownMessages()).toContain('Waiting');
			vi.advanceTimersByTime(999);
			expect(shownMessages()).toContain('Waiting');
			vi.advanceTimersByTime(1);
			expect(notifications.items.map((toast) => toast.message)).not.toContain('Waiting');
		});

		it('counts persistent errors in the three places and never evicts them (boundary)', () => {
			for (const n of [1, 2, 3, 4]) persistentError(n);

			expect(shownMessages()).toEqual(['Server error 1', 'Server error 2', 'Server error 3']);
			expect(notifications.items).toHaveLength(4);
		});

		it('does not queue a toast that has an action: the undo window never waits (boundary)', () => {
			// GIVEN: Three persistent errors fill the stack.
			[1, 2, 3].forEach(persistentError);
			const onclose = vi.fn();

			// WHEN: A deletion can be undone.
			notifications.add('Task deleted', 'success', {
				duration: 6000,
				action: { label: 'Undo', run: vi.fn() },
				onclose
			});

			// THEN: It is shown at once and expires on its own 6 s.
			expect(shownMessages()).toContain('Task deleted');
			vi.advanceTimersByTime(5999);
			expect(onclose).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);
			expect(onclose).toHaveBeenCalledWith('expired');
		});

		it('keeps three toasts without action shown next to a toast with an action (boundary)', () => {
			notifications.add('Task deleted', 'success', {
				duration: 0,
				action: { label: 'Undo', run: vi.fn() }
			});
			for (const n of [1, 2, 3, 4]) notifications.add(`Toast ${n}`, 'info', { duration: 0 });

			expect(shownMessages()).toEqual(['Task deleted', 'Toast 1', 'Toast 2', 'Toast 3']);
		});

		it('shows exactly three without queueing, and the fourth makes a queue (boundary)', () => {
			for (const n of [1, 2, 3]) notifications.add(`Toast ${n}`, 'info', { duration: 0 });
			expect(notifications.shown).toHaveLength(3);
			expect(notifications.items).toHaveLength(3);

			notifications.add('Toast 4', 'info', { duration: 0 });
			expect(notifications.shown).toHaveLength(3);
			expect(notifications.items).toHaveLength(4);
		});

		it('shows nothing when there is nothing (limit)', () => {
			expect(notifications.shown).toEqual([]);
		});

		it('keeps a queue without bound, one persistent error only once (limit)', () => {
			for (let n = 0; n < 50; n++) notifications.add(`Toast ${n}`, 'info', { duration: 0 });
			persistentError(1);
			const queued = persistentError(1);
			const again = notifications.notifyError('Server error 1', {
				reference: 'req-1',
				persistent: true
			});

			expect(notifications.shown).toHaveLength(3);
			expect(notifications.items).toHaveLength(51);
			expect(again).toBe(queued);
		});

		it('drops a queued toast on request, with its callback, without promoting anything (sad path)', () => {
			[1, 2, 3].forEach(persistentError);
			const onclose = vi.fn();
			const queued = notifications.add('Queued', 'info', { duration: 0, onclose });
			const before = shownMessages();

			notifications.remove(queued);

			expect(onclose).toHaveBeenCalledWith('dismissed');
			expect(shownMessages()).toEqual(before);
			expect(notifications.items).toHaveLength(3);
		});

		it('ignores the pause and resume of a queued toast, which has no timer yet (exception)', () => {
			[1, 2, 3].forEach(persistentError);
			const queued = notifications.add('Queued', 'info', { duration: 1000 });

			notifications.pause(queued);
			notifications.resume(queued);
			vi.advanceTimersByTime(5000);

			expect(notifications.items.map((toast) => toast.message)).toContain('Queued');
			expect(shownMessages()).not.toContain('Queued');
		});

		it('promotes the next toast even when the close callback throws (exception)', () => {
			const first = notifications.add('Toast 1', 'info', {
				duration: 0,
				onclose: () => {
					throw new Error('callback failed');
				}
			});
			for (const n of [2, 3, 4]) notifications.add(`Toast ${n}`, 'info', { duration: 1000 });

			expect(() => notifications.remove(first)).toThrow('callback failed');

			expect(shownMessages()).toEqual(['Toast 2', 'Toast 3', 'Toast 4']);
			vi.advanceTimersByTime(1000);
			expect(notifications.items).toEqual([]);
		});

		it('splits the shown toasts between status and alert regions, the queue in neither (limit)', () => {
			notifications.add('Info', 'info', { duration: 0 });
			persistentError(1);
			persistentError(2);
			persistentError(3);

			expect(notifications.statuses.map((toast) => toast.message)).toEqual(['Info']);
			expect(notifications.alerts).toHaveLength(2);
		});
	});
});
