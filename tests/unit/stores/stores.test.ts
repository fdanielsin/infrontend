import { describe, expect, it } from 'vitest';
import * as stores from '$lib/stores';
import { selectedUser, users } from '$lib/features/users/store';
import { userTasks } from '$lib/features/tasks/store';
import { error, loading } from '$lib/stores/request-status';
import { notifications } from '$lib/stores/notification';

describe('stores barrel', () => {
	it('re-exports the feature stores themselves, not copies (happy path)', () => {
		// GIVEN / WHEN: The barrel and the owning modules are imported.

		// THEN: Every re-export is the very same store instance.
		expect(stores.users).toBe(users);
		expect(stores.selectedUser).toBe(selectedUser);
		expect(stores.userTasks).toBe(userTasks);
		expect(stores.loading).toBe(loading);
		expect(stores.error).toBe(error);
		expect(stores.notifications).toBe(notifications);
	});
});
