import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiFailure, type ApiResult, type User } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({
	api: {
		getStats: vi.fn(),
		ready: vi.fn(),
		deleteUser: vi.fn(),
		deleteTask: vi.fn(),
		createUser: vi.fn(),
		getUser: vi.fn(),
		updateUser: vi.fn(),
		getUserTasks: vi.fn()
	}
}));
const ada: User = { id: 1, name: 'Ada', email: 'ada@example.com' };
const gone: ApiFailure = { success: false, error: 'x', status: 404, code: 'USER_NOT_FOUND' };
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('races of a user with a request still on its way (USER-R20, USER-R23)', () => {
	let app: AppState;
	beforeEach(() => {
		vi.resetAllMocks();
		vi.useFakeTimers();
		app = new AppState();
		app.users.users = [ada];
	});
	afterEach(() => {
		app.destroy();
		vi.useRealTimers();
	});

	it('says "User already deleted" once when a selection and a rename both meet a 404 (critère 48)', async () => {
		const a = deferred<ApiResult<User>>();
		const b = deferred<ApiResult<User>>();
		vi.mocked(api.getUser).mockReturnValue(a.promise);
		vi.mocked(api.updateUser).mockReturnValue(b.promise);
		const p1 = app.users.select(ada.id);
		const p2 = app.users.rename(ada.id, 'New');
		a.resolve(gone);
		b.resolve(gone);
		await Promise.all([p1, p2]);
		expect(app.notifications.items.map((t) => t.message)).toEqual(['User already deleted']);
	});

	it('creates a user with the email of a user whose DELETE is on its way only after its answer (USER-R20)', async () => {
		const sent = deferred<ApiResult<void>>();
		vi.mocked(api.deleteUser).mockReturnValue(sent.promise);
		vi.mocked(api.createUser).mockResolvedValue({
			success: true,
			data: { id: 2, name: 'Ada2', email: 'ada@example.com' }
		});
		app.users.remove(ada.id);
		await vi.advanceTimersByTimeAsync(6000);
		expect(api.deleteUser).toHaveBeenCalledTimes(1);
		const creation = app.users.add('Ada2', 'ada@example.com');
		await vi.advanceTimersByTimeAsync(50);
		expect(api.createUser).not.toHaveBeenCalled();
		sent.resolve({ success: true });
		await creation;
		expect(api.createUser).toHaveBeenCalledTimes(1);
	});

	it('creates nothing when the deletion on its way is refused: the user is back (USER-R20)', async () => {
		const sent = deferred<ApiResult<void>>();
		vi.mocked(api.deleteUser).mockReturnValue(sent.promise);
		app.users.remove(ada.id);
		await vi.advanceTimersByTimeAsync(6000);

		const creation = app.users.add('Ada2', 'ADA@example.com');
		sent.resolve({ success: false, error: 'Boom', status: 500 });

		await expect(creation).resolves.toEqual({ status: 'failed' });
		expect(api.createUser).not.toHaveBeenCalled();
		expect(app.users.users.map((user) => user.name)).toEqual(['Ada']);
	});
});
