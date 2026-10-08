import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ANNOUNCEMENT_LIFETIME,
	type CloseReason,
	ERROR_NOTIFICATION_DURATION,
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
});
