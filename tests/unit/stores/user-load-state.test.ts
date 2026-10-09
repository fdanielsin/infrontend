import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({
	api: { getUsers: vi.fn(), createUser: vi.fn(), getUser: vi.fn(), getUserTasks: vi.fn() }
}));

const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };

// What the list may claim: nothing is known before the first answer, and "no users" only follows
// an answer that said so.
describe('user list load state', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	it('goes idle, loading, loaded, with the users (happy path)', async () => {
		// GIVEN: An API that answers with one user.
		let answer!: (value: { success: true; data: (typeof ada)[] }) => void;
		vi.mocked(api.getUsers).mockReturnValue(new Promise((resolve) => (answer = resolve)));
		expect(app.users.loadState).toBe('idle');

		// WHEN: The fetch starts, then the answer arrives.
		const pending = app.users.fetch();
		expect(app.users.loadState).toBe('loading');
		answer({ success: true, data: [ada] });
		await pending;

		// THEN: The list is loaded.
		expect(app.users.loadState).toBe('loaded');
		expect(app.users.users).toEqual([ada]);
	});

	it('is loaded when the answer is an empty list (boundary: 0 users)', async () => {
		// GIVEN / WHEN: An API with no user.
		vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [] });
		await app.users.fetch();

		// THEN: Empty is a known state.
		expect(app.users.loadState).toBe('loaded');
		expect(app.users.users).toEqual([]);
	});

	it.each([
		['a server error', { success: false as const, error: 'x', status: 500 }],
		['a timeout', { success: false as const, error: 'x', kind: 'timeout' as const }],
		[
			'a malformed answer',
			{ success: false as const, error: 'x', kind: 'invalid_response' as const }
		]
	])('is failed after %s (error)', async (_name, failure) => {
		// GIVEN: An API that fails.
		vi.mocked(api.getUsers).mockResolvedValue(failure);

		// WHEN: The users are fetched.
		await app.users.fetch();

		// THEN: The state says failed, not loaded.
		expect(app.users.loadState).toBe('failed');
	});

	it('is failed when the call throws (exception)', async () => {
		// GIVEN: A client that throws.
		vi.mocked(api.getUsers).mockRejectedValue(new Error('boom'));

		// WHEN / THEN: The state says failed.
		await app.users.fetch();
		expect(app.users.loadState).toBe('failed');
	});

	it('goes back to loaded after a retry that works (limit)', async () => {
		// GIVEN: A first fetch that failed.
		vi.mocked(api.getUsers).mockResolvedValueOnce({ success: false, error: 'x', status: 500 });
		await app.users.fetch();
		expect(app.users.loadState).toBe('failed');

		// WHEN: The retry works.
		vi.mocked(api.getUsers).mockResolvedValueOnce({ success: true, data: [ada] });
		await app.users.fetch();

		// THEN: The list is loaded again.
		expect(app.users.loadState).toBe('loaded');
		expect(app.users.users).toEqual([ada]);
	});

	it('keeps the users already shown when a later fetch fails (limit)', async () => {
		// GIVEN: A loaded list.
		vi.mocked(api.getUsers).mockResolvedValueOnce({ success: true, data: [ada] });
		await app.users.fetch();

		// WHEN: Another fetch fails.
		vi.mocked(api.getUsers).mockResolvedValueOnce({ success: false, error: 'x', status: 500 });
		await app.users.fetch();

		// THEN: What was known stays; the state tells the last attempt failed.
		expect(app.users.users).toEqual([ada]);
		expect(app.users.loadState).toBe('failed');
	});
});
