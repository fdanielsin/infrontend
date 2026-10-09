import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiResult, type Task, type User } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';
import { lastToast } from '../support/last-toast';

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

const ada: User = { id: 1, name: 'Ada', email: 'ada@example.com' };
const bob: User = { id: 2, name: 'Bob', email: 'bob@example.com' };
const adaTask: Task = {
	id: 10,
	title: 'Review',
	description: 'Review code',
	user_id: 1,
	completed: false
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('users store', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	describe('fetchUsers', () => {
		it('loads users and clears the loading state (happy path)', async () => {
			// GIVEN: The API returns a user collection.
			vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [ada] });

			// WHEN: Users are fetched.
			await app.users.fetch();

			// THEN: The collection is stored without an error.
			expect(app.users.users).toEqual([ada]);
			expect(lastToast(app)).toBeNull();
			expect(app.users.status.loading).toBe(false);
		});

		it('exposes the client error and keeps the list (sad path)', async () => {
			// GIVEN: A loaded list and an API failure.
			app.users.users = [ada];
			vi.mocked(api.getUsers).mockResolvedValue({ success: false, error: 'HTTP 500' });

			// WHEN: Users are fetched again.
			await app.users.fetch();

			// THEN: The error is exposed, the list is unchanged and loading is over.
			expect(lastToast(app)).toBe('HTTP 500');
			expect(app.users.users).toEqual([ada]);
			expect(app.users.status.loading).toBe(false);
		});

		it('exposes the message when the API call throws (exception)', async () => {
			// GIVEN: The API call rejects.
			vi.mocked(api.getUsers).mockRejectedValue(new Error('Network down'));

			// WHEN: Users are fetched.
			await app.users.fetch();

			// THEN: The error is exposed and loading is over.
			expect(lastToast(app)).toBe('Network down');
			expect(app.users.status.loading).toBe(false);
		});
	});

	describe('addUser', () => {
		it('appends and returns the created user (happy path)', async () => {
			// GIVEN: One user already listed and an API that accepts the new one.
			app.users.users = [ada];
			vi.mocked(api.createUser).mockResolvedValue({ success: true, data: bob });

			// WHEN: A user is created.
			const result = await app.users.add('Bob', 'bob@example.com');

			// THEN: The user is returned, appended after the existing one, without error.
			expect(result).toEqual({ status: 'created', user: bob });
			expect(api.createUser).toHaveBeenCalledWith({ name: 'Bob', email: 'bob@example.com' });
			expect(app.users.users).toEqual([ada, bob]);
			expect(lastToast(app)).toBeNull();
			expect(app.users.status.loading).toBe(false);
		});

		it('exposes the client error and adds nothing (sad path)', async () => {
			// GIVEN: The client reports a failure, in the form the real client produces.
			vi.mocked(api.createUser).mockResolvedValue({ success: false, error: 'HTTP 500' });

			// WHEN: A user is created.
			const result = await app.users.add('Ada', 'ada@example.com');

			// THEN: The error is exposed and no user is added.
			expect(result).toEqual({ status: 'failed' });
			expect(app.users.users).toEqual([]);
			expect(lastToast(app)).toBe('HTTP 500');
		});

		it('exposes the message and adds nothing when the API call throws (exception)', async () => {
			// GIVEN: The API call rejects.
			vi.mocked(api.createUser).mockRejectedValue(new Error('Network down'));

			// WHEN: A user is created.
			const result = await app.users.add('Ada', 'ada@example.com');

			// THEN: Nothing is added and the error is exposed.
			expect(result).toEqual({ status: 'failed' });
			expect(app.users.users).toEqual([]);
			expect(lastToast(app)).toBe('Network down');
			expect(app.users.status.loading).toBe(false);
		});
	});

	describe('selectUser', () => {
		it('selects a user and loads its tasks (happy path)', async () => {
			// GIVEN: The API returns a user and its tasks.
			vi.mocked(api.getUser).mockResolvedValue({ success: true, data: ada });
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [adaTask] });

			// WHEN: The user is selected.
			await app.users.select(ada.id);

			// THEN: The selection and tasks are available.
			expect(app.users.selected).toEqual(ada);
			expect(app.tasks.tasks).toEqual([adaTask]);
			expect(app.users.status.loading).toBe(false);
		});

		it('exposes the error and loads no tasks when the user is not found (sad path)', async () => {
			// GIVEN: The API cannot find the user.
			vi.mocked(api.getUser).mockResolvedValue({ success: false, error: 'HTTP 404' });

			// WHEN: The user is selected.
			await app.users.select(99);

			// THEN: Nothing is selected, the tasks are not requested.
			expect(lastToast(app)).toBe('HTTP 404');
			expect(app.users.selected).toBeNull();
			expect(api.getUserTasks).not.toHaveBeenCalled();
			expect(app.users.status.loading).toBe(false);
		});

		it('shows no task of the previous user when the tasks cannot be loaded (sad path, QM-04)', async () => {
			// GIVEN: Ada's tasks are listed, Bob is found but his tasks fail.
			app.tasks.tasks = [adaTask];
			vi.mocked(api.getUser).mockResolvedValue({ success: true, data: bob });
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: false, error: 'HTTP 500' });

			// WHEN: Bob is selected.
			await app.users.select(bob.id);

			// THEN: Bob is selected with an empty list and the tasks error; users keep no error.
			expect(app.users.selected).toEqual(bob);
			expect(app.tasks.tasks).toEqual([]);
			expect(app.notifications.items.map((toast) => toast.message)).toEqual(['HTTP 500']);
		});

		it('clears the previous tasks as soon as another user is selected (limit, QM-04)', async () => {
			// GIVEN: Ada's tasks are listed and Bob's user request is still pending.
			app.tasks.tasks = [adaTask];
			const slowBob = deferred<ApiResult<User>>();
			vi.mocked(api.getUser).mockReturnValue(slowBob.promise);
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });

			// WHEN: Bob is selected.
			const selection = app.users.select(bob.id);

			// THEN: Ada's tasks are gone before any answer, so none can be acted on under Bob.
			expect(app.tasks.tasks).toEqual([]);
			slowBob.resolve({ success: true, data: bob });
			await selection;
		});

		it('selects nobody when the newly chosen user cannot be loaded (sad path, QM-05)', async () => {
			// GIVEN: Ada is selected with her tasks, and Bob cannot be loaded.
			app.users.selected = ada;
			app.tasks.tasks = [adaTask];
			vi.mocked(api.getUser).mockResolvedValue({
				success: false,
				error: 'User not found',
				status: 404
			});

			// WHEN: Bob is selected.
			await app.users.select(bob.id);

			// THEN: No user stays selected with an emptied list; the error is shown.
			expect(app.users.selected).toBeNull();
			expect(app.tasks.tasks).toEqual([]);
			expect(lastToast(app)).toBe('User not found');
			expect(api.getUserTasks).not.toHaveBeenCalled();
		});

		it('deselects the previous user as soon as another one is chosen (limit, QM-05)', async () => {
			// GIVEN: Ada is selected and Bob's request is still pending.
			app.users.selected = ada;
			const slowBob = deferred<ApiResult<User>>();
			vi.mocked(api.getUser).mockReturnValue(slowBob.promise);
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });

			// WHEN: Bob is selected.
			const selection = app.users.select(bob.id);

			// THEN: Ada is no longer selected while Bob loads, then Bob is.
			expect(app.users.selected).toBeNull();
			slowBob.resolve({ success: true, data: bob });
			await selection;
			expect(app.users.selected).toEqual(bob);
		});

		it('ignores the tasks of a previous selection that arrive after the new one (limit)', async () => {
			// GIVEN: Ada is selected and her tasks are still loading.
			const bobTask: Task = { ...adaTask, id: 20, title: 'Deploy', user_id: bob.id };
			const slowAdaTasks = deferred<ApiResult<Task[]>>();
			vi.mocked(api.getUser).mockImplementation((id) =>
				Promise.resolve({ success: true, data: id === ada.id ? ada : bob })
			);
			vi.mocked(api.getUserTasks).mockImplementation((id) =>
				id === ada.id ? slowAdaTasks.promise : Promise.resolve({ success: true, data: [bobTask] })
			);
			const first = app.users.select(ada.id);
			await vi.waitFor(() => expect(api.getUserTasks).toHaveBeenCalledWith(ada.id));

			// WHEN: Bob is selected and loaded, then Ada's tasks arrive.
			await app.users.select(bob.id);
			slowAdaTasks.resolve({ success: true, data: [adaTask] });
			await first;

			// THEN: Bob stays selected with his own tasks only.
			expect(app.users.selected).toEqual(bob);
			expect(app.tasks.tasks).toEqual([bobTask]);
			expect(app.tasks.status.loading).toBe(false);
		});

		it('keeps only the last selection when requests overlap (limit)', async () => {
			// GIVEN: The first selection answers after the second one.
			const slowAda = deferred<ApiResult<User>>();
			vi.mocked(api.getUser).mockImplementation((id) =>
				id === ada.id ? slowAda.promise : Promise.resolve({ success: true, data: bob })
			);
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });

			// WHEN: Ada then Bob are selected, and Ada's answer arrives last.
			const first = app.users.select(ada.id);
			await app.users.select(bob.id);
			slowAda.resolve({ success: true, data: ada });
			await first;

			// THEN: Bob stays selected and Ada's tasks are never requested.
			expect(app.users.selected).toEqual(bob);
			expect(api.getUserTasks).toHaveBeenCalledTimes(1);
			expect(api.getUserTasks).toHaveBeenCalledWith(bob.id);
			expect(app.users.status.loading).toBe(false);
		});

		it('exposes the message when the API call throws (exception)', async () => {
			// GIVEN: The API call rejects.
			vi.mocked(api.getUser).mockRejectedValue(new Error('Network down'));

			// WHEN: The user is selected.
			await app.users.select(ada.id);

			// THEN: The error is exposed and loading is over.
			expect(lastToast(app)).toBe('Network down');
			expect(app.users.selected).toBeNull();
			expect(app.users.status.loading).toBe(false);
		});
	});

	describe('error feedback', () => {
		it('shows no toast for a taken email, which the form says under the field (sad path, F-01)', async () => {
			// GIVEN: The backend refuses a taken email.
			vi.mocked(api.createUser).mockResolvedValue({
				success: false,
				error: 'Email already in use',
				status: 409,
				code: 'EMAIL_TAKEN'
			});

			// WHEN: The user is created.
			await app.users.add('Ada', 'ada@x.io');

			// THEN: No toast: the form says it under the email field.
			expect(lastToast(app)).toBeNull();
		});

		it.each([
			['fetchUsers', () => app.users.fetch(), "We couldn't load the users."],
			[
				'addUser',
				() => app.users.add('Ada', 'ada@x.io'),
				"We couldn't create the user. Your entries are kept."
			],
			['selectUser', () => app.users.select(1), "We couldn't load this user."]
		] as const)(
			'%s shows its own fallback message when the failure has none (limit)',
			async (_name, action, fallback) => {
				// GIVEN: Every API call fails without a message.
				const failure = { success: false as const, error: '' };
				vi.mocked(api.getUsers).mockResolvedValue(failure);
				vi.mocked(api.createUser).mockResolvedValue(failure);
				vi.mocked(api.getUser).mockResolvedValue(failure);

				// WHEN: The action runs.
				await action();

				// THEN: The action's fallback is shown.
				expect(lastToast(app)).toBe(fallback);
			}
		);

		it('shows the tasks fallback when the tasks of a selected user fail without a message (limit)', async () => {
			// GIVEN: The user is found but its tasks fail without a message.
			vi.mocked(api.getUser).mockResolvedValue({ success: true, data: ada });
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: false, error: '' });

			// WHEN: The user is selected.
			await app.users.select(ada.id);

			// THEN: The tasks fallback is shown in the tasks status.
			expect(lastToast(app)).toBe("We couldn't load the tasks.");
		});

		it('publishes the failure as a 6 s error notification (sad path, QM-02)', async () => {
			// GIVEN: The backend refuses the user.
			vi.useFakeTimers();
			vi.mocked(api.createUser).mockResolvedValue({
				success: false,
				error: 'Email already in use',
				status: 409
			});

			// WHEN: The user is created.
			await app.users.add('Ada', 'ada@x.io');

			// THEN: One error notification with the same message, removed after exactly 6000 ms.
			expect(app.notifications.items).toEqual([
				expect.objectContaining({ message: 'Email already in use', type: 'error', duration: 6000 })
			]);
			vi.advanceTimersByTime(5999);
			expect(app.notifications.items).toHaveLength(1);
			vi.advanceTimersByTime(1);
			expect(app.notifications.items).toEqual([]);
			vi.useRealTimers();
		});

		it('publishes no notification on success (happy path, QM-02)', async () => {
			// GIVEN / WHEN: Users are fetched successfully.
			vi.mocked(api.getUsers).mockResolvedValue({ success: true, data: [ada] });
			await app.users.fetch();

			// THEN: Nothing is notified.
			expect(app.notifications.items).toEqual([]);
		});

		it('publishes no notification for a superseded selection (limit, QM-02)', async () => {
			// GIVEN: Ada's selection fails after Bob's selection succeeded.
			const slowAda = deferred<ApiResult<User>>();
			vi.mocked(api.getUser).mockImplementation((id) =>
				id === ada.id ? slowAda.promise : Promise.resolve({ success: true, data: bob })
			);
			vi.mocked(api.getUserTasks).mockResolvedValue({ success: true, data: [] });

			// WHEN: Ada then Bob are selected, and Ada's failure arrives last.
			const first = app.users.select(ada.id);
			await app.users.select(bob.id);
			slowAda.resolve({ success: false, error: 'HTTP 500' });
			await first;

			// THEN: The stale failure is neither shown nor notified.
			expect(lastToast(app)).toBeNull();
			expect(app.notifications.items).toEqual([]);
		});

		it('keeps users and tasks errors and loading apart (sad path, F-02)', async () => {
			// GIVEN: A user creation that fails and is slow.
			const pending = deferred<ApiResult<User>>();
			vi.mocked(api.createUser).mockReturnValue(pending.promise);

			// WHEN: The user is created.
			const creating = app.users.add('Ada', 'ada@x.io');

			// THEN: Only the users status is loading; the error is one toast.
			expect(app.users.status.loading).toBe(true);
			expect(app.tasks.status.loading).toBe(false);
			pending.resolve({ success: false, error: 'Email already in use' });
			await creating;
			expect(app.notifications.items.map((toast) => toast.message)).toEqual([
				'Email already in use'
			]);
		});
	});
});
