import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({
	api: { getUsers: vi.fn(), createUser: vi.fn(), getUser: vi.fn(), getUserTasks: vi.fn() }
}));

// A request error has one surface: the toast. The request status keeps no copy of the message.
describe('a request error has a single surface', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	it('does not keep the message in the request status (happy path)', async () => {
		// GIVEN / WHEN: A creation that fails with a server error.
		vi.mocked(api.createUser).mockResolvedValue({
			success: false,
			error: 'x',
			status: 500,
			code: 'INTERNAL_ERROR'
		});
		await app.users.add('Ada', 'ada@example.com');

		// THEN: One toast, and no second copy in the status.
		expect(app.notifications.items).toHaveLength(1);
		expect('error' in app.users.status).toBe(false);
		expect('error' in app.tasks.status).toBe(false);
	});

	it('tells an email already taken apart, and shows no toast for it (boundary)', async () => {
		// GIVEN: An API that refuses the email with a 409.
		vi.mocked(api.createUser).mockResolvedValue({
			success: false,
			error: 'x',
			status: 409,
			code: 'EMAIL_TAKEN'
		});

		// WHEN: A user is added.
		const outcome = await app.users.add('Ada', 'ada@example.com');

		// THEN: The caller learns it, the field will say it; no toast.
		expect(outcome).toEqual({ status: 'email_taken' });
		expect(app.notifications.items).toEqual([]);
	});

	it('returns the user created (happy path)', async () => {
		// GIVEN / WHEN: A creation that works.
		const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
		vi.mocked(api.createUser).mockResolvedValue({ success: true, data: ada });
		const outcome = await app.users.add('Ada', 'ada@example.com');

		// THEN: The outcome carries the user.
		expect(outcome).toEqual({ status: 'created', user: ada });
	});

	it.each([
		['VALIDATION_FAILED', 400],
		['INTERNAL_ERROR', 500]
	] as const)('shows %s as a toast, not under the field (error)', async (code, status) => {
		// GIVEN / WHEN: A refusal that names no field.
		vi.mocked(api.createUser).mockResolvedValue({ success: false, error: 'x', status, code });
		const outcome = await app.users.add('Ada', 'ada@example.com');

		// THEN: A toast, and a generic failure outcome.
		expect(outcome).toEqual({ status: 'failed' });
		expect(app.notifications.items).toHaveLength(1);
	});

	it('shows a timeout as a persistent toast (exception)', async () => {
		// GIVEN / WHEN: The server does not answer.
		vi.mocked(api.createUser).mockResolvedValue({ success: false, error: 'x', kind: 'timeout' });
		const outcome = await app.users.add('Ada', 'ada@example.com');

		// THEN: A failure outcome and one toast that stays.
		expect(outcome).toEqual({ status: 'failed' });
		expect(app.notifications.items).toHaveLength(1);
		expect(app.notifications.items[0]?.duration).toBe(0);
	});
});
