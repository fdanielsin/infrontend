import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({ api: { getUsers: vi.fn() } }));

describe('request reference in the error toast', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	it('carries the reference of a 5xx failure (happy path)', async () => {
		vi.mocked(api.getUsers).mockResolvedValue({
			success: false,
			error: 'boom',
			status: 500,
			requestId: 'req-1'
		});

		await app.users.fetch();

		expect(app.notifications.items).toEqual([
			expect.objectContaining({ type: 'error', reference: 'req-1' })
		]);
	});

	it('carries none when the failure has no reference (boundary)', async () => {
		vi.mocked(api.getUsers).mockResolvedValue({ success: false, error: 'boom', status: 500 });

		await app.users.fetch();

		expect(app.notifications.items[0]).not.toHaveProperty('reference');
	});
});
