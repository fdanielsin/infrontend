import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiResult, type Task, type User } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({
	api: { getUser: vi.fn(), getUserTasks: vi.fn(), createTask: vi.fn() }
}));

const forAda: Task = { id: 10, title: 'For Ada', description: '', user_id: 1, completed: false };
const ada: User = { id: 1, name: 'Ada', email: 'ada@example.com' };
const nora: User = { id: 2, name: 'Nora', email: 'nora@example.com' };
const forNora: Task = { id: 20, title: 'For Nora', description: '', user_id: 2, completed: false };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

// A creation for one user may answer after another user was selected: the task belongs to the
// first user on the server, and must not appear in the list of the second.
describe('a task created while the selected user changes', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	// Selects a user through the real flow (the user store clears the list, then loads it).
	async function selectAda() {
		vi.mocked(api.getUser).mockResolvedValueOnce({ success: true, data: ada });
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [] });
		await app.users.select(1);
	}

	it('never shows the task in the list of the user selected meanwhile, even for an instant (sad path)', async () => {
		// GIVEN: Ada is selected, and a creation for Ada is in flight.
		await selectAda();
		const creation = deferred<ApiResult<Task>>();
		vi.mocked(api.createTask).mockReturnValueOnce(creation.promise);
		const adding = app.tasks.add('For Ada', '', 1);

		// WHEN: Nora is selected (her user and tasks still loading) and Ada's creation answers.
		const noraUser = deferred<ApiResult<User>>();
		const noraTasks = deferred<ApiResult<Task[]>>();
		vi.mocked(api.getUser).mockReturnValueOnce(noraUser.promise);
		vi.mocked(api.getUserTasks).mockReturnValueOnce(noraTasks.promise);
		const selecting = app.users.select(2);
		const seen: Task[][] = [];
		creation.resolve({ success: true, data: forAda });
		await adding;
		seen.push(app.tasks.tasks);
		noraUser.resolve({ success: true, data: nora });
		await Promise.resolve();
		seen.push(app.tasks.tasks);
		noraTasks.resolve({ success: true, data: [forNora] });
		await selecting;
		seen.push(app.tasks.tasks);

		// THEN: At no moment does Ada's task appear in the list, and it is still created for Ada.
		expect(seen.flat().map((task) => task.title)).not.toContain('For Ada');
		expect(app.tasks.tasks).toEqual([forNora]);
		expect(await adding).toEqual(forAda);
		expect(app.tasks.status.error).toBeNull();
	});

	it('does not leave the task under the other user when his tasks fail to load (exception)', async () => {
		// GIVEN: Ada selected, a creation for Ada in flight, then Nora selected.
		await selectAda();
		const creation = deferred<ApiResult<Task>>();
		vi.mocked(api.createTask).mockReturnValueOnce(creation.promise);
		const adding = app.tasks.add('For Ada', '', 1);
		const noraUser = deferred<ApiResult<User>>();
		vi.mocked(api.getUser).mockReturnValueOnce(noraUser.promise);
		const selecting = app.users.select(2);

		// WHEN: Ada's creation answers, then Nora's user loads and her tasks fail.
		creation.resolve({ success: true, data: forAda });
		await adding;
		noraUser.resolve({ success: true, data: nora });
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({
			success: false,
			error: 'boom',
			status: 500,
			code: 'INTERNAL_ERROR'
		});
		await selecting;

		// THEN: Nora is selected and her list is empty: nothing of Ada's can be edited or deleted.
		expect(app.users.selected?.id).toBe(2);
		expect(app.tasks.tasks).toEqual([]);
	});

	it('does not add the task when the selection of the other user failed (boundary)', async () => {
		// GIVEN: A creation for Ada in flight and the selection of Nora that fails at once.
		await selectAda();
		const creation = deferred<ApiResult<Task>>();
		vi.mocked(api.createTask).mockReturnValueOnce(creation.promise);
		const adding = app.tasks.add('For Ada', '', 1);
		vi.mocked(api.getUser).mockResolvedValueOnce({ success: false, error: 'gone', status: 404 });
		await app.users.select(2);

		// WHEN: Ada's creation answers.
		creation.resolve({ success: true, data: forAda });
		await adding;

		// THEN: The list stays empty: no user is selected, and none of them owns this list.
		expect(app.tasks.tasks).toEqual([]);
	});

	it('is added to the list of its own user (happy path)', async () => {
		// GIVEN: Ada's list is loaded.
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [] });
		await app.tasks.load(1, () => true);
		vi.mocked(api.createTask).mockResolvedValueOnce({ success: true, data: forAda });

		// WHEN: A task is created for Ada.
		await app.tasks.add('For Ada', '', 1);

		// THEN: It is in her list.
		expect(app.tasks.tasks).toEqual([forAda]);
	});

	it('is added when no user was ever selected: there is no list to protect (boundary)', async () => {
		vi.mocked(api.createTask).mockResolvedValueOnce({ success: true, data: forAda });

		await app.tasks.add('For Ada', '', 1);

		expect(app.tasks.tasks).toEqual([forAda]);
	});

	it('reports a failed creation without touching the other list (exception)', async () => {
		// GIVEN: Nora's list is shown while Ada's creation is in flight.
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [forNora] });
		await app.tasks.load(2, () => true);
		vi.mocked(api.createTask).mockRejectedValueOnce(new Error('Failed to fetch'));

		// WHEN: The creation for Ada fails.
		const created = await app.tasks.add('For Ada', '', 1);

		// THEN: Nothing is added.
		expect(created).toBeUndefined();
		expect(app.tasks.tasks).toEqual([forNora]);
	});
});
