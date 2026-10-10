import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiResult, type Task, type User } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({
	api: { getUser: vi.fn(), getUserTasks: vi.fn(), createTask: vi.fn() }
}));

const ada: User = { id: 1, name: 'Ada', email: 'ada@example.com' };
const nora: User = { id: 2, name: 'Nora', email: 'nora@example.com' };
const created: Task = { id: 10, title: 'New', description: '', user_id: 1, completed: false };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

// The server stores a task, then the answer to its creation reaches the browser AFTER the reload
// of the same user's list (which already lists it): the list must hold the task once.
describe('a task created while the same user is selected again', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	async function selectAdaWithNoTask() {
		vi.mocked(api.getUser).mockResolvedValueOnce({ success: true, data: ada });
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [] });
		await app.users.select(1);
	}

	const ids = () => app.tasks.tasks.map((task) => task.id);

	it('lists the task once when Ada is clicked again while the creation is in flight (sad path)', async () => {
		// GIVEN: Ada is selected, with no task, and "Add Task" was pressed (the answer is slow).
		await selectAdaWithNoTask();
		const creation = deferred<ApiResult<Task>>();
		vi.mocked(api.createTask).mockReturnValueOnce(creation.promise);
		const adding = app.tasks.add('New', '', 1);

		// WHEN: Ada's row is clicked again; the server already has the task, so the reload lists it.
		vi.mocked(api.getUser).mockResolvedValueOnce({ success: true, data: ada });
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [created] });
		await app.users.select(1);
		expect(ids()).toEqual([10]);
		// ... and only then the slow answer to the creation arrives.
		creation.resolve({ success: true, data: created });
		await adding;

		// THEN: The task is in the list once.
		expect(ids()).toEqual([10]);
	});

	it('lists the task once when Nora then Ada are selected while the creation is in flight (sad path)', async () => {
		// GIVEN: Ada is selected, with no task, and "Add Task" was pressed.
		await selectAdaWithNoTask();
		const creation = deferred<ApiResult<Task>>();
		vi.mocked(api.createTask).mockReturnValueOnce(creation.promise);
		const adding = app.tasks.add('New', '', 1);

		// WHEN: Nora is selected, then Ada again (her reload lists the new task), then the answer comes.
		vi.mocked(api.getUser).mockResolvedValueOnce({ success: true, data: nora });
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [] });
		await app.users.select(2);
		vi.mocked(api.getUser).mockResolvedValueOnce({ success: true, data: ada });
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [created] });
		await app.users.select(1);
		creation.resolve({ success: true, data: created });
		await adding;

		// THEN: The task is in Ada's list once.
		expect(ids()).toEqual([10]);
	});

	it('keeps two different tasks that look alike: only the id tells them apart (limit)', async () => {
		// GIVEN: Ada's list holds a task titled "New", and another "New" is added.
		const earlier: Task = { ...created, id: 9 };
		vi.mocked(api.getUser).mockResolvedValueOnce({ success: true, data: ada });
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [earlier] });
		await app.users.select(1);
		vi.mocked(api.createTask).mockResolvedValueOnce({ success: true, data: created });

		// WHEN: The creation is answered.
		await app.tasks.add('New', '', 1);

		// THEN: Both are listed, in creation order.
		expect(ids()).toEqual([9, 10]);
	});

	it('control: the answer arriving BEFORE the reload gives one task too (happy path)', async () => {
		await selectAdaWithNoTask();
		const creation = deferred<ApiResult<Task>>();
		vi.mocked(api.createTask).mockReturnValueOnce(creation.promise);
		const adding = app.tasks.add('New', '', 1);

		creation.resolve({ success: true, data: created });
		await adding;
		vi.mocked(api.getUser).mockResolvedValueOnce({ success: true, data: ada });
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [created] });
		await app.users.select(1);

		expect(ids()).toEqual([10]);
	});
});
