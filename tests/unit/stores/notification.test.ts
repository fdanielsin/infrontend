import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_NOTIFICATION_DURATION, NotificationState } from '$lib/state/notification.svelte';

describe('notification store', () => {
	let notifications: NotificationState;

	beforeEach(() => {
		vi.useFakeTimers();
		notifications = new NotificationState();
	});

	it('adds a notification and removes it after its duration (happy path)', () => {
		// GIVEN: The notification store is empty.
		// WHEN: A timed success notification is added.
		const id = notifications.add('Saved', 'success', 1000);

		// THEN: The notification is available until its duration expires.
		expect(notifications.items).toEqual([
			{ id, message: 'Saved', type: 'success', duration: 1000 }
		]);
		vi.advanceTimersByTime(1000);
		expect(notifications.items).toEqual([]);
	});

	it('removes only the requested notification (happy path)', () => {
		// GIVEN: Two notifications are present.
		const firstId = notifications.add('First', 'info', 0);
		const secondId = notifications.add('Second', 'warning', 0);

		// WHEN: The first notification is removed.
		notifications.remove(firstId);

		// THEN: The second notification remains.
		expect(notifications.items).toEqual([
			{ id: secondId, message: 'Second', type: 'warning', duration: 0 }
		]);
	});

	it('ignores the removal of an unknown id (sad path)', () => {
		// GIVEN: One notification.
		const id = notifications.add('Kept', 'info', 0);

		// WHEN: An unknown id is removed.
		notifications.remove('notif-unknown');

		// THEN: The notification is still there.
		expect(notifications.items.map((n) => n.id)).toEqual([id]);
	});

	it('gives each notification a distinct id (limit)', () => {
		// GIVEN / WHEN: Several notifications with the same message are added.
		const ids = [1, 2, 3].map(() => notifications.add('Same', 'info', 0));

		// THEN: Every id is unique and every notification is kept.
		expect(new Set(ids).size).toBe(3);
		expect(notifications.items).toHaveLength(3);
	});

	it('keeps a notification until exactly its duration (boundary)', () => {
		// GIVEN: A notification lasting 1000 ms.
		notifications.add('Saved', 'success', 1000);

		// WHEN / THEN: Still shown 1 ms before the deadline, gone at the deadline.
		vi.advanceTimersByTime(999);
		expect(notifications.items).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(notifications.items).toHaveLength(0);
	});

	it('never removes a notification with duration 0 by itself (boundary)', () => {
		// GIVEN: A notification without duration.
		notifications.add('Sticky', 'warning', 0);

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
			const id = notifications.add('Saved', 'success', 1000);
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
			const id = notifications.add('Saved', 'success', 1000);
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
			const id = notifications.add('Saved', 'success', 1000);

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
			const id = notifications.add('Saved', 'success', 1000);
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
			const id = notifications.add('Saved', 'success', 1000);
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
			const id = notifications.add('Saved', 'success', 1000);

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
			const id = notifications.add('Sticky', 'info', 0);

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
			const id = notifications.add('Saved', 'success', 1000);
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
			const id = notifications.add('Saved', 'success', 1000);

			// WHEN: It is dismissed before its end.
			notifications.remove(id);

			// THEN: No timer is left behind.
			expect(vi.getTimerCount()).toBe(0);
		});
	});
});
