import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({
	api: {
		getUsers: vi.fn(),
		createUser: vi.fn(),
		getUser: vi.fn(),
		getUserTasks: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		deleteTask: vi.fn()
	}
}));

// Replaces the tests of the former `$lib/stores` barrel: the same invariants,
// checked on the application state that now owns every feature.
describe('application state', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('publishes the failures of every feature to one shared notification state (happy path)', async () => {
		// GIVEN: An application state whose users and tasks requests both fail.
		const app = new AppState();
		vi.mocked(api.getUsers).mockResolvedValue({ success: false, error: 'Users down' });
		vi.mocked(api.createTask).mockResolvedValue({ success: false, error: 'Tasks down' });

		// WHEN: Each feature runs its action.
		await app.users.fetch();
		await app.tasks.add('Review', '', 1);

		// THEN: Both failures land in the same notification list, in order.
		expect(app.notifications.items.map((toast) => toast.message)).toEqual([
			'Users down',
			'Tasks down'
		]);
	});

	it('gives each feature its own request status (limit, F-02)', async () => {
		// GIVEN: An application state whose users request fails.
		const app = new AppState();
		vi.mocked(api.getUsers).mockResolvedValue({ success: false, error: 'Users down' });

		// WHEN: The users are fetched.
		await app.users.fetch();

		// THEN: The error stays in the users feature; tasks keep a separate, clean status.
		expect(app.users.status).not.toBe(app.tasks.status);
		expect(app.users.status.error).toBe('Users down');
		expect(app.tasks.status.error).toBeNull();
		expect(app.tasks.status.loading).toBe(false);
	});
});
