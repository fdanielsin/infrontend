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
});
