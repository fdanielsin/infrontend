import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiResult, type Task } from '$lib/api/client';
import { AppState } from '$lib/state/app-state.svelte';

vi.mock('$lib/api/client', () => ({
	api: { getUserTasks: vi.fn(), createTask: vi.fn() }
}));

const forAda: Task = { id: 10, title: 'For Ada', description: '', user_id: 1, completed: false };
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

	it('is not added to the list of the user selected meanwhile (sad path)', async () => {
		// GIVEN: Ada's list is loaded, and a creation for Ada is in flight.
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [] });
		await app.tasks.load(1, () => true);
		const creation = deferred<ApiResult<Task>>();
		vi.mocked(api.createTask).mockReturnValueOnce(creation.promise);
		const adding = app.tasks.add('For Ada', '', 1);

		// WHEN: Nora is selected and her list loads, then Ada's creation answers.
		app.tasks.clear();
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [forNora] });
		await app.tasks.load(2, () => true);
		creation.resolve({ success: true, data: forAda });
		const created = await adding;

		// THEN: The task exists (for Ada) but Nora's list is untouched, with no error.
		expect(created).toEqual(forAda);
		expect(app.tasks.tasks).toEqual([forNora]);
		expect(app.tasks.status.error).toBeNull();
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

	it('is added while no list was loaded yet: the owner is unknown (boundary)', async () => {
		vi.mocked(api.createTask).mockResolvedValueOnce({ success: true, data: forAda });

		await app.tasks.add('For Ada', '', 1);

		expect(app.tasks.tasks).toEqual([forAda]);
	});

	it('a creation that answers before the other list is loaded is replaced by that list (limit)', async () => {
		// GIVEN: A creation for Ada in flight, then Nora selected: her list is still loading.
		vi.mocked(api.getUserTasks).mockResolvedValueOnce({ success: true, data: [] });
		await app.tasks.load(1, () => true);
		const creation = deferred<ApiResult<Task>>();
		vi.mocked(api.createTask).mockReturnValueOnce(creation.promise);
		const adding = app.tasks.add('For Ada', '', 1);
		app.tasks.clear();
		const nora = deferred<ApiResult<Task[]>>();
		vi.mocked(api.getUserTasks).mockReturnValueOnce(nora.promise);
		const loading = app.tasks.load(2, () => true);

		// WHEN: Ada's creation answers first, then Nora's list.
		creation.resolve({ success: true, data: forAda });
		await adding;
		nora.resolve({ success: true, data: [forNora] });
		await loading;

		// THEN: Only Nora's tasks are listed.
		expect(app.tasks.tasks).toEqual([forNora]);
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
