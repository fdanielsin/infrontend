import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppState } from '$lib/state/app-state.svelte';

// These tests keep the real API client and only replace fetch: they check what
// the stores do with transport failures the client itself does not absorb.
describe('stores with the real API client', () => {
	const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };

	let app: AppState;

	beforeEach(() => {
		app = new AppState();
		app.users.users = [ada];
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('reports a malformed 200 body and keeps the list (exception)', async () => {
		// GIVEN: The backend answers 200 with a body that is not JSON.
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{not json', { status: 200 }));

		// WHEN: Users are fetched.
		await app.users.fetch();

		// THEN: An explicit error is exposed and notified, the list is kept, loading is over.
		expect(app.users.status.error).toBe('Invalid server response');
		expect(app.notifications.items).toEqual([
			expect.objectContaining({ message: 'Invalid server response', type: 'error' })
		]);
		expect(app.users.users).toEqual([ada]);
		expect(app.users.status.loading).toBe(false);
	});

	it('reports an unreachable backend without adding the task (exception)', async () => {
		// GIVEN: The network is down.
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

		// WHEN: A task is added.
		const result = await app.tasks.add('Buy milk', 'Semi-skimmed', ada.id);

		// THEN: Nothing is added and the network error reaches the store.
		expect(result).toBeUndefined();
		expect(app.tasks.tasks).toEqual([]);
		expect(app.tasks.status.error).toBe('Failed to fetch');
		expect(app.tasks.status.loading).toBe(false);
	});

	it('shows the backend message of a refused creation (sad path, F-01)', async () => {
		// GIVEN: The backend refuses a taken email with its error envelope.
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({
					success: false,
					error: 'Email already in use',
					error_code: 'EMAIL_TAKEN'
				}),
				{ status: 409 }
			)
		);

		// WHEN: The user is created.
		await app.users.add('Ada', 'ada@x.io');

		// THEN: The backend message reaches the store and the notification, not "HTTP 409".
		expect(app.users.status.error).toBe('Email already in use');
		expect(app.notifications.items).toEqual([
			expect.objectContaining({ message: 'Email already in use', type: 'error' })
		]);
	});

	it('keeps out a task the server reports gone, through the real client (limit)', async () => {
		// GIVEN: A listed task that the backend no longer knows.
		const task = { id: 10, title: 'Gone', description: '', user_id: ada.id, completed: false };
		app.tasks.tasks = [task];
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				JSON.stringify({ success: false, error: 'Task not found', error_code: 'TASK_NOT_FOUND' }),
				{ status: 404 }
			)
		);

		// WHEN: The task is removed and the deletion is sent.
		app.tasks.remove(task.id);
		await app.tasks.commitPending();

		// THEN: It stays out of the list, without an error nor a notice.
		expect(app.tasks.tasks).toEqual([]);
		expect(app.tasks.status.error).toBeNull();
		expect(app.notifications.items).toEqual([]);
	});
});
