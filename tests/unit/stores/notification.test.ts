import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { addNotification, notifications, removeNotification } from '$lib/stores/notification';

describe('notification store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		notifications.set([]);
	});

	it('adds a notification and removes it after its duration (happy path)', () => {
		// GIVEN: The notification store is empty.
		// WHEN: A timed success notification is added.
		const id = addNotification('Saved', 'success', 1000);

		// THEN: The notification is available until its duration expires.
		expect(get(notifications)).toEqual([{ id, message: 'Saved', type: 'success', duration: 1000 }]);
		vi.advanceTimersByTime(1000);
		expect(get(notifications)).toEqual([]);
	});

	it('removes only the requested notification (happy path)', () => {
		// GIVEN: Two notifications are present.
		const firstId = addNotification('First', 'info', 0);
		const secondId = addNotification('Second', 'warning', 0);

		// WHEN: The first notification is removed.
		removeNotification(firstId);

		// THEN: The second notification remains.
		expect(get(notifications)).toEqual([
			{ id: secondId, message: 'Second', type: 'warning', duration: 0 }
		]);
	});

	it('ignores the removal of an unknown id (sad path)', () => {
		// GIVEN: One notification.
		const id = addNotification('Kept', 'info', 0);

		// WHEN: An unknown id is removed.
		removeNotification('notif-unknown');

		// THEN: The notification is still there.
		expect(get(notifications).map((n) => n.id)).toEqual([id]);
	});

	it('gives each notification a distinct id (limit)', () => {
		// GIVEN / WHEN: Several notifications with the same message are added.
		const ids = [1, 2, 3].map(() => addNotification('Same', 'info', 0));

		// THEN: Every id is unique and every notification is kept.
		expect(new Set(ids).size).toBe(3);
		expect(get(notifications)).toHaveLength(3);
	});

	it('keeps a notification until exactly its duration (boundary)', () => {
		// GIVEN: A notification lasting 1000 ms.
		addNotification('Saved', 'success', 1000);

		// WHEN / THEN: Still shown 1 ms before the deadline, gone at the deadline.
		vi.advanceTimersByTime(999);
		expect(get(notifications)).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(get(notifications)).toHaveLength(0);
	});

	it('never removes a notification with duration 0 by itself (boundary)', () => {
		// GIVEN: A notification without duration.
		addNotification('Sticky', 'warning', 0);

		// WHEN: A long time passes.
		vi.advanceTimersByTime(24 * 60 * 60 * 1000);

		// THEN: It is still shown.
		expect(get(notifications)).toHaveLength(1);
	});
});
