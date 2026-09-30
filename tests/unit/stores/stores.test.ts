import { describe, expect, it } from 'vitest';
import * as stores from '$lib/stores';
import { selectedUser, users } from '$lib/features/users/store';
import { userTasks } from '$lib/features/tasks/store';
import { notifications } from '$lib/stores/notification';

describe('stores barrel', () => {
	it('re-exports the feature stores themselves, not copies (happy path)', () => {
		// GIVEN / WHEN: The barrel and the owning modules are imported.

		// THEN: Every re-export is the very same store instance.
		expect(stores.users).toBe(users);
		expect(stores.selectedUser).toBe(selectedUser);
		expect(stores.userTasks).toBe(userTasks);
		expect(stores.notifications).toBe(notifications);
	});

	it('no longer exposes a request status shared by every feature (limit, F-02)', () => {
		// GIVEN / WHEN: The barrel is imported.

		// THEN: loading and error are owned by each feature, not re-exported globally.
		expect(stores).not.toHaveProperty('loading');
		expect(stores).not.toHaveProperty('error');
	});
});
