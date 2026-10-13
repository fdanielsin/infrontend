import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiFailure, type Task, type User } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({
	api: {
		getUsers: vi.fn(),
		createUser: vi.fn(),
		getUser: vi.fn(),
		updateUser: vi.fn(),
		deleteUser: vi.fn(),
		getUserTasks: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		deleteTask: vi.fn(),
		getStats: vi.fn()
	}
}));

const ada: User = { id: 1, name: 'Ada', email: 'ada@example.com' };
const bob: User = { id: 2, name: 'Bob', email: 'bob@example.com' };
const cleo: User = { id: 3, name: 'Cleo', email: 'cleo@example.com' };
const adaTask: Task = { id: 10, title: 'Review', description: '', user_id: 1, completed: false };
const gone: ApiFailure = {
	success: false,
	error: 'User not found',
	status: 404,
	code: 'USER_NOT_FOUND'
};
const NO_ROUTE: ApiFailure = {
	success: false,
	error: 'No route',
	status: 404,
	code: 'ROUTE_NOT_FOUND'
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('deleting a user', () => {
	let app: AppState;

	const names = () => app.users.users.map((user) => user.name);
	const toasts = () => app.notifications.items.map((toast) => toast.message);
	const toastOf = (name: string) =>
		app.notifications.items.find((toast) => toast.message.includes(name))!;
	const undo = (name: string) => app.notifications.runAction(toastOf(name).id);

	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetAllMocks();
		vi.mocked(api.deleteUser).mockResolvedValue({ success: true });
		vi.mocked(api.deleteTask).mockResolvedValue({ success: true });
		app = new AppState();
		app.users.users = [ada, bob, cleo];
	});

	afterEach(() => {
		app.destroy();
		vi.useRealTimers();
	});

	describe('the wait (USER-R19)', () => {
		it('takes the user out of the list at once, names them in a 6 s toast with Undo and sends nothing (happy path)', () => {
			expect(app.users.remove(ada.id)).toBe(true);

			expect(names()).toEqual(['Bob', 'Cleo']);
			expect(toasts()).toEqual(['User and their tasks deleted: Ada']);
			expect(toastOf('Ada')).toMatchObject({ type: 'success', duration: 6000 });
			expect(toastOf('Ada').action?.label).toBe('Undo');
			expect(api.deleteUser).not.toHaveBeenCalled();
		});

		it('unselects the selected user and empties the panel (happy path)', () => {
			app.users.selected = ada;
			app.tasks.clear(ada.id);
			app.tasks.tasks = [adaTask];

			app.users.remove(ada.id);

			expect(app.users.selected).toBeNull();
			expect(app.tasks.tasks).toEqual([]);
		});

		it('keeps another user selected (boundary)', () => {
			app.users.selected = bob;

			app.users.remove(ada.id);

			expect(app.users.selected).toBe(bob);
		});

		it('does nothing for an unknown user (limit)', () => {
			expect(app.users.remove(99)).toBe(false);
			expect(app.notifications.items).toEqual([]);
		});

		it('shows its toast even with three persistent errors on screen (limit)', () => {
			for (const text of ['one', 'two', 'three']) {
				app.notifications.notifyError(text, { persistent: true });
			}

			app.users.remove(ada.id);

			expect(app.notifications.shown.map((toast) => toast.message)).toContain(
				'User and their tasks deleted: Ada'
			);
		});
	});

	describe('Undo', () => {
		it('puts the user back without selecting them and never sends anything, even much later (happy path)', async () => {
			app.users.selected = ada;
			app.users.remove(ada.id);

			undo('Ada');
			await vi.advanceTimersByTimeAsync(60_000);

			expect(names()).toEqual(['Ada', 'Bob', 'Cleo']);
			expect(app.users.selected).toBeNull();
			expect(api.deleteUser).not.toHaveBeenCalled();
		});

		it('keeps the order of the list whatever the order of the Undo (USER-R21)', () => {
			vi.setSystemTime(0);
			app.users.remove(ada.id);
			vi.setSystemTime(1000);
			app.users.remove(bob.id);

			undo('Bob');
			undo('Ada');

			expect(names()).toEqual(['Ada', 'Bob', 'Cleo']);
		});

		it('calls the hook so the screen can place the focus (happy path)', () => {
			const onundo = vi.fn();
			app.users.remove(bob.id, { onundo });

			undo('Bob');

			expect(onundo).toHaveBeenCalledExactlyOnceWith(bob.id);
		});
	});

	describe('the tasks of the user (USER-R19)', () => {
		beforeEach(() => {
			app.users.selected = ada;
			app.tasks.clear(ada.id);
			app.tasks.tasks = [adaTask];
			app.tasks.remove(adaTask.id);
		});

		it('follow the user: Undo sends no task deletion and nothing at all (critère 22)', async () => {
			app.users.remove(ada.id);
			undo('Ada');
			await vi.advanceTimersByTimeAsync(60_000);

			expect(api.deleteTask).not.toHaveBeenCalled();
			expect(api.deleteUser).not.toHaveBeenCalled();
		});

		it('are not sent when the user expires: only the user deletion goes (critère 23)', async () => {
			app.users.remove(ada.id);
			await vi.advanceTimersByTimeAsync(6000);

			expect(api.deleteUser).toHaveBeenCalledExactlyOnceWith(ada.id);
			expect(api.deleteTask).not.toHaveBeenCalled();
			expect(app.notifications.items).toEqual([]);
		});
	});

	describe('the request (USER-R20)', () => {
		it('goes once, when the window ends, without keepalive (happy path)', async () => {
			app.users.remove(ada.id);
			await vi.advanceTimersByTimeAsync(5999);
			expect(api.deleteUser).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(60_000);

			expect(api.deleteUser).toHaveBeenCalledExactlyOnceWith(ada.id);
		});

		it('goes at once, once, when the toast is closed (critère 33)', async () => {
			app.users.remove(ada.id);

			app.notifications.remove(toastOf('Ada').id, 'dismissed');
			await vi.advanceTimersByTimeAsync(60_000);

			expect(api.deleteUser).toHaveBeenCalledTimes(1);
		});

		it('counts USER_NOT_FOUND as done: the user stays out, no error (critère 34)', async () => {
			vi.mocked(api.deleteUser).mockResolvedValue(gone);
			app.users.remove(ada.id);

			await vi.advanceTimersByTimeAsync(6000);

			expect(names()).toEqual(['Bob', 'Cleo']);
			expect(app.notifications.items).toEqual([]);
		});

		it.each([
			['ROUTE_NOT_FOUND', NO_ROUTE],
			['405', { success: false, error: 'No', status: 405, code: 'METHOD_NOT_ALLOWED' }],
			['400', { success: false, error: 'No', status: 400, code: 'INVALID_ID' }],
			['500', { success: false, error: 'Boom', status: 500, code: 'INTERNAL_ERROR' }],
			['a timeout', { success: false, error: 'Request timed out', kind: 'timeout' }]
		] as const)(
			'puts the user back with an error when the answer is %s (critère 35)',
			async (_name, failure) => {
				vi.mocked(api.deleteUser).mockResolvedValue(failure);
				app.users.remove(ada.id);

				await vi.advanceTimersByTimeAsync(6000);

				expect(names()).toEqual(['Ada', 'Bob', 'Cleo']);
				expect(toasts()).toEqual(["We couldn't delete the user."]);
				expect(app.notifications.items.at(-1)?.type).toBe('error');
			}
		);

		it('says the same thing whatever the code, since the user is back in the list (critère 35)', async () => {
			vi.mocked(api.deleteUser).mockResolvedValue(NO_ROUTE);
			app.users.remove(ada.id);

			await vi.advanceTimersByTimeAsync(6000);

			expect(toasts()).not.toContain('Resource not found');
			expect(toasts()).toEqual(["We couldn't delete the user."]);
		});

		it('words a refusal with no message of its own as "We couldn\'t delete the user." (critère 35)', async () => {
			vi.mocked(api.deleteUser).mockResolvedValue({ success: false, error: '', status: 502 });
			app.users.remove(ada.id);

			await vi.advanceTimersByTimeAsync(6000);

			expect(toasts()).toEqual(["We couldn't delete the user."]);
		});

		it('is not repeated after a page leave followed by the end of the window (boundary)', async () => {
			app.users.remove(ada.id);

			await app.users.commitPending({ keepalive: true });
			await vi.advanceTimersByTimeAsync(60_000);

			expect(api.deleteUser).toHaveBeenCalledExactlyOnceWith(ada.id, { keepalive: true });
		});

		it('sends the waiting user deletion before the stats are read, and waits for its answer (critère 38)', async () => {
			app.tasks.clear(bob.id);
			app.tasks.tasks = [{ ...adaTask, id: 11, user_id: 2 }];
			app.tasks.remove(11);
			app.users.remove(ada.id);
			const order: string[] = [];
			vi.mocked(api.deleteUser).mockImplementation(() => {
				order.push('user');
				return Promise.resolve({ success: true });
			});
			vi.mocked(api.deleteTask).mockImplementation(() => {
				order.push('task');
				return Promise.resolve({ success: true });
			});

			await app.commitPending();

			expect(order.sort()).toEqual(['task', 'user']);
			expect(app.notifications.items).toEqual([]);
		});
	});

	describe('a page that is hidden (USER-R20, critère 31)', () => {
		it('holds the window and goes on with the time left on return (happy path)', async () => {
			app.users.remove(ada.id);
			await vi.advanceTimersByTimeAsync(2000);

			await app.users.onHidden();
			await vi.advanceTimersByTimeAsync(60_000);
			expect(api.deleteUser).not.toHaveBeenCalled();
			expect(names()).toEqual(['Bob', 'Cleo']);

			app.users.onVisible();
			await vi.advanceTimersByTimeAsync(3999);
			expect(api.deleteUser).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(api.deleteUser).toHaveBeenCalledTimes(1);
		});
	});

	describe('while it waits (USER-R21)', () => {
		it('ignores a second click on the same user, with a single toast (happy path)', () => {
			app.users.remove(ada.id);

			expect(app.users.remove(ada.id)).toBe(false);
			expect(app.notifications.items).toHaveLength(1);
		});

		it('ignores the other Delete for 500 ms, then takes them (critère 41)', () => {
			vi.setSystemTime(10_000);
			app.users.remove(ada.id);

			vi.setSystemTime(10_499);
			expect(app.users.remove(bob.id)).toBe(false);
			expect(names()).toEqual(['Bob', 'Cleo']);

			vi.setSystemTime(10_500);
			expect(app.users.remove(bob.id)).toBe(true);
			expect(names()).toEqual(['Cleo']);
		});

		it('keeps a waiting or sent user out of a reloaded list, whenever the answer comes (critère 39)', async () => {
			app.users.remove(ada.id);
			vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [ada, bob, cleo] });
			await app.users.fetch();
			expect(names()).toEqual(['Bob', 'Cleo']);

			const sent = deferred<{ success: true }>();
			vi.mocked(api.deleteUser).mockReturnValue(sent.promise);
			await vi.advanceTimersByTimeAsync(6000);
			await app.users.fetch();
			expect(names()).toEqual(['Bob', 'Cleo']);

			sent.resolve({ success: true });
			await vi.advanceTimersByTimeAsync(0);
			vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [bob, cleo] });
			await app.users.fetch();
			expect(names()).toEqual(['Bob', 'Cleo']);
		});
	});

	describe('a user with the same email created meanwhile (USER-R16, critère 37)', () => {
		const twin = { name: 'Ada again', email: 'ada@example.com' };

		it('sends the deletion first and the creation after its answer (happy path)', async () => {
			const order: string[] = [];
			vi.mocked(api.deleteUser).mockImplementation(() => {
				order.push('delete');
				return Promise.resolve({ success: true });
			});
			vi.mocked(api.createUser).mockImplementation((body) => {
				order.push('create');
				return Promise.resolve({ success: true, data: { id: 4, ...body } });
			});
			app.users.remove(ada.id);

			const outcome = await app.users.add(twin.name, 'ADA@example.com ');

			expect(order).toEqual(['delete', 'create']);
			expect(outcome.status).toBe('created');
			expect(toasts()).not.toContain('User and their tasks deleted: Ada');
		});

		it('does not create when the deletion failed: the old user is back (limit)', async () => {
			vi.mocked(api.deleteUser).mockResolvedValue({ success: false, error: 'Boom', status: 500 });
			app.users.remove(ada.id);

			const outcome = await app.users.add(twin.name, twin.email);

			expect(outcome.status).toBe('failed');
			expect(api.createUser).not.toHaveBeenCalled();
			expect(names()).toContain('Ada');
		});

		it('sends no deletion for an unrelated email (boundary)', async () => {
			vi.mocked(api.createUser).mockResolvedValue({
				success: true,
				data: { id: 4, name: 'Dan', email: 'dan@example.com' }
			});
			app.users.remove(ada.id);

			await app.users.add('Dan', 'dan@example.com');

			expect(api.deleteUser).not.toHaveBeenCalled();
		});
	});
});

describe('a user already deleted elsewhere (USER-R23, USER-R24)', () => {
	let app: AppState;

	const names = () => app.users.users.map((user) => user.name);
	const toasts = () => app.notifications.items.map((toast) => toast.message);

	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetAllMocks();
		vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });
		app = new AppState();
		app.users.users = [ada, bob];
	});

	afterEach(() => {
		app.destroy();
		vi.useRealTimers();
	});

	describe('selecting', () => {
		it('drops the user, unselects and says so with no error (critère 46)', async () => {
			vi.mocked(api.getUser).mockResolvedValue(gone);

			await app.users.select(ada.id);

			expect(names()).toEqual(['Bob']);
			expect(app.users.selected).toBeNull();
			expect(toasts()).toEqual(['User already deleted']);
			expect(app.notifications.items[0]?.type).toBe('info');
			expect(app.users.gone).toMatchObject({ id: ada.id, from: 'list' });
		});

		it('says it once when two requests meet the same 404 (critère 48)', async () => {
			vi.mocked(api.getUser).mockResolvedValue(gone);

			await Promise.all([app.users.select(ada.id), app.users.select(ada.id)]);

			expect(toasts()).toEqual(['User already deleted']);
		});

		it('keeps the user and reports an error for ROUTE_NOT_FOUND (critère 48)', async () => {
			vi.mocked(api.getUser).mockResolvedValue(NO_ROUTE);

			await app.users.select(ada.id);

			expect(names()).toEqual(['Ada', 'Bob']);
			expect(app.notifications.items[0]?.type).toBe('error');
		});

		it('is not reselected by a answer that comes after the user was deleted on screen (critère 49)', async () => {
			const answer = deferred<{ success: true; data: User }>();
			vi.mocked(api.getUser).mockReturnValue(answer.promise);
			const selecting = app.users.select(ada.id);

			app.users.remove(ada.id);
			answer.resolve({ success: true, data: ada });
			await selecting;

			expect(app.users.selected).toBeNull();
			expect(app.tasks.tasks).toEqual([]);
			expect(api.getUserTasks).not.toHaveBeenCalled();
		});

		it('ignores the tasks that arrive after the user was deleted on screen (critère 49)', async () => {
			const tasks = deferred<{ success: true; data: Task[] }>();
			vi.mocked(api.getUser).mockResolvedValue({ success: true, data: ada });
			vi.mocked(api.getUserTasks).mockReturnValue(tasks.promise);
			const selecting = app.users.select(ada.id);
			await vi.advanceTimersByTimeAsync(0);

			app.users.remove(ada.id);
			tasks.resolve({ success: true, data: [adaTask] });
			await selecting;

			expect(app.users.selected).toBeNull();
			expect(app.tasks.tasks).toEqual([]);
		});
	});

	describe('renaming', () => {
		it('sends the name alone and shows it in the list and the selection, with no toast (critère 42)', async () => {
			app.users.selected = ada;
			vi.mocked(api.updateUser).mockResolvedValue({
				success: true,
				data: { ...ada, name: 'Ada L.' }
			});

			await expect(app.users.rename(ada.id, 'Ada L.')).resolves.toBe('renamed');

			expect(api.updateUser).toHaveBeenCalledExactlyOnceWith(ada.id, { name: 'Ada L.' });
			expect(names()).toEqual(['Ada L.', 'Bob']);
			expect(app.users.selected?.name).toBe('Ada L.');
			expect(app.notifications.items).toEqual([]);
		});

		it('does not touch the selection of another user (boundary)', async () => {
			app.users.selected = bob;
			vi.mocked(api.updateUser).mockResolvedValue({
				success: true,
				data: { ...ada, name: 'Ada L.' }
			});

			await app.users.rename(ada.id, 'Ada L.');

			expect(app.users.selected).toBe(bob);
		});

		it('drops a user found deleted, and says so (critère 48)', async () => {
			vi.mocked(api.updateUser).mockResolvedValue(gone);

			await expect(app.users.rename(ada.id, 'Ada L.')).resolves.toBe('gone');

			expect(names()).toEqual(['Bob']);
			expect(toasts()).toEqual(['User already deleted']);
			expect(app.users.gone).toMatchObject({ id: ada.id, from: 'list' });
		});

		it('reports an error and changes nothing for another refusal (critère 45)', async () => {
			vi.mocked(api.updateUser).mockResolvedValue({
				success: false,
				error: 'Boom',
				status: 500,
				code: 'INTERNAL_ERROR'
			});

			await expect(app.users.rename(ada.id, 'Ada L.')).resolves.toBe('failed');

			expect(names()).toEqual(['Ada', 'Bob']);
			expect(app.notifications.items[0]?.type).toBe('error');
		});

		it('ignores the answer that comes after the user was deleted on screen (critère 50)', async () => {
			const answer = deferred<{ success: true; data: User }>();
			vi.mocked(api.updateUser).mockReturnValue(answer.promise);
			const renaming = app.users.rename(ada.id, 'Ada L.');

			app.users.remove(ada.id);
			answer.resolve({ success: true, data: { ...ada, name: 'Ada L.' } });

			await expect(renaming).resolves.toBe('ignored');
			app.notifications.runAction(app.notifications.items[0]!.id);
			expect(names()).toEqual(['Ada', 'Bob']);
		});
	});

	describe('adding a task', () => {
		beforeEach(() => {
			app.users.selected = ada;
			app.tasks.clear(ada.id);
		});

		it('drops the user, empties the panel and says so, with no error (critère 47)', async () => {
			vi.mocked(api.createTask).mockResolvedValue(gone);

			await expect(app.tasks.add('T', 'D', ada.id)).resolves.toBeUndefined();

			expect(names()).toEqual(['Bob']);
			expect(app.users.selected).toBeNull();
			expect(app.tasks.tasks).toEqual([]);
			expect(toasts()).toEqual(['User already deleted']);
			expect(app.users.gone).toMatchObject({ id: ada.id, from: 'panel' });
		});

		it('adds no task when the answer comes after the user was deleted on screen (critère 50)', async () => {
			const answer = deferred<{ success: true; data: Task }>();
			vi.mocked(api.createTask).mockReturnValue(answer.promise);
			const adding = app.tasks.add('T', 'D', ada.id);

			app.users.remove(ada.id);
			answer.resolve({ success: true, data: adaTask });
			await adding;

			expect(app.tasks.tasks).toEqual([]);
		});

		it('keeps a user who was not the selected one (boundary)', async () => {
			vi.mocked(api.createTask).mockResolvedValue(gone);

			await app.tasks.add('T', 'D', bob.id);

			expect(app.users.selected).toBe(ada);
			expect(names()).toEqual(['Ada']);
		});
	});
});
