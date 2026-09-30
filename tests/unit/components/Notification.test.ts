import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { notifications } from '$lib/stores/notification';
import Notification from '$lib/ui/Notification.svelte';

describe('Notification component', () => {
	beforeEach(() => {
		notifications.set([]);
	});

	afterEach(() => {
		cleanup();
		notifications.set([]);
	});

	it('shows the notifications of the store (happy path)', async () => {
		// GIVEN: A rendered, empty notification area.
		const { container, getByText } = render(Notification);
		expect(container.querySelectorAll('[role]')).toHaveLength(0);

		// WHEN: A notification is published.
		notifications.set([{ id: 'n1', message: 'Saved', type: 'success' }]);

		// THEN: It is displayed.
		await waitFor(() => expect(getByText('Saved')).toBeTruthy());
	});

	it('stacks several notifications in order (limit)', () => {
		// GIVEN: Three notifications.
		notifications.set([
			{ id: 'n1', message: 'First', type: 'info' },
			{ id: 'n2', message: 'Second', type: 'warning' },
			{ id: 'n3', message: 'Third', type: 'success' }
		]);

		// WHEN: The area is rendered.
		const { container } = render(Notification);

		// THEN: All are shown, in publication order.
		const messages = Array.from(container.querySelectorAll('[role]')).map((el) =>
			el.textContent?.trim()
		);
		expect(messages).toEqual(['First', 'Second', 'Third']);
	});

	it('announces errors as alerts and the other types as status (boundary)', () => {
		// GIVEN: One notification of each type.
		notifications.set([
			{ id: 'e', message: 'Error', type: 'error' },
			{ id: 's', message: 'Success', type: 'success' },
			{ id: 'i', message: 'Info', type: 'info' },
			{ id: 'w', message: 'Warning', type: 'warning' }
		]);

		// WHEN: The area is rendered.
		const { getByText } = render(Notification);

		// THEN: Only the error interrupts assistive technologies.
		expect(getByText('Error').getAttribute('role')).toBe('alert');
		for (const message of ['Success', 'Info', 'Warning']) {
			expect(getByText(message).getAttribute('role')).toBe('status');
		}
	});
});
