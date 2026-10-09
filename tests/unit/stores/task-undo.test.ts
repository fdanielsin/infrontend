import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiResult } from '$lib/api/client';
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

const first = { id: 10, title: 'Review', description: 'Code', user_id: 1, completed: false };
const second = { id: 11, title: 'Deploy', description: '', user_id: 1, completed: true };
const third = { id: 12, title: 'Plan', description: '', user_id: 1, completed: false };
const gone = {
	success: false as const,
	error: 'Task not found',
	status: 404,
	code: 'TASK_NOT_FOUND'
};

describe('undoable task deletion', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(api.deleteTask).mockResolvedValue({ success: true });
		app = new AppState();
		app.tasks.clear(1);
		app.tasks.tasks = [first, second, third];
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const toast = () => app.notifications.items[0];

	describe('removing', () => {
		it('hides the task at once, sends nothing and offers to undo (happy path)', () => {
			// WHEN: A task is removed.
			app.tasks.remove(second.id);

			// THEN: It is out of the list, no request left, and a 6 s toast names it with an Undo action.
			expect(app.tasks.tasks).toEqual([first, third]);
			expect(api.deleteTask).not.toHaveBeenCalled();
			expect(app.notifications.items).toEqual([
				expect.objectContaining({
					message: 'Task deleted: Deploy',
					type: 'success',
					duration: 6000
				})
			]);
			expect(toast()?.action?.label).toBe('Undo');
		});

		it('ignores an id that is not listed (boundary)', () => {
			// WHEN: An unknown id is removed.
			app.tasks.remove(999);

			// THEN: Nothing changes and nothing is announced.
			expect(app.tasks.tasks).toEqual([first, second, third]);
			expect(app.notifications.items).toEqual([]);
		});

		it('ignores a task already waiting to be deleted (boundary)', () => {
			// WHEN: The same task is removed twice.
			app.tasks.remove(second.id);
			app.tasks.remove(second.id);

			// THEN: One toast only.
			expect(app.notifications.items).toHaveLength(1);
		});

		it('keeps a title with special characters whole in the toast (limit)', () => {
			// GIVEN: A title with markup and a very long word.
			const title = `<b>${'x'.repeat(300)}</b> & "quotes"`;
			app.tasks.tasks = [{ ...first, title }];

			// WHEN: It is removed.
			app.tasks.remove(first.id);

			// THEN: The message carries it unchanged.
			expect(toast()?.message).toBe(`Task deleted: ${title}`);
		});
	});

	describe('undoing', () => {
		it('puts the task back where it was, without any request (happy path)', () => {
			// GIVEN: The middle task is removed.
			app.tasks.remove(second.id);

			// WHEN: Undo is pressed.
			app.notifications.runAction(toast()!.id);

			// THEN: It is back in the middle, the toast is gone, and nothing is ever sent.
			expect(app.tasks.tasks).toEqual([first, second, third]);
			expect(app.notifications.items).toEqual([]);
			expect(api.deleteTask).not.toHaveBeenCalled();
		});

		it('tells the caller once the task is back, so that it can place the focus (happy path)', () => {
			// GIVEN: A removal with a callback.
			const restored = vi.fn(() => expect(app.tasks.tasks).toContain(second));
			app.tasks.remove(second.id, { onundo: restored });

			// WHEN: Undo is pressed.
			app.notifications.runAction(toast()!.id);

			// THEN: The callback ran once, with the task already listed.
			expect(restored).toHaveBeenCalledTimes(1);
			expect(restored).toHaveBeenCalledWith(second.id);
		});

		it('never deletes a task that was undone, even when its time would have run out (boundary)', async () => {
			// GIVEN: A removal undone.
			vi.useFakeTimers();
			app.tasks.remove(second.id);
			app.notifications.runAction(toast()!.id);

			// WHEN: The 6 s pass.
			await vi.advanceTimersByTimeAsync(7000);
			await app.tasks.commitPending();

			// THEN: Nothing was sent.
			expect(api.deleteTask).not.toHaveBeenCalled();
		});

		it('puts back each of two removed tasks at its own place (limit)', () => {
			// GIVEN: Two removals.
			app.tasks.remove(first.id);
			app.tasks.remove(third.id);

			// WHEN: Both are undone, the later one first.
			const [firstToast, thirdToast] = app.notifications.items;
			app.notifications.runAction(thirdToast!.id);
			app.notifications.runAction(firstToast!.id);

			// THEN: The list is as before.
			expect(app.tasks.tasks).toEqual([first, second, third]);
		});

		it('puts the task last when the list became shorter than its old place (boundary)', () => {
			// GIVEN: The last task is removed, then the list is replaced by a shorter one.
			app.tasks.remove(third.id);
			app.tasks.tasks = [first];

			// WHEN: Undo is pressed.
			app.notifications.runAction(toast()!.id);

			// THEN: It is appended.
			expect(app.tasks.tasks).toEqual([first, third]);
		});
	});

	describe('leaving without undo', () => {
		it.each(['expired', 'dismissed'] as const)(
			'tells the caller once, before the request, when the toast is %s (happy path)',
			(reason) => {
				// GIVEN: A removal with a callback that notes whether the request had left.
				const requestSent: boolean[] = [];
				const left = vi.fn(() => requestSent.push(vi.mocked(api.deleteTask).mock.calls.length > 0));
				app.tasks.remove(second.id, { onleave: left });

				// WHEN: The toast leaves.
				app.notifications.remove(toast()!.id, reason);

				// THEN: Called once, ahead of the DELETE.
				expect(left).toHaveBeenCalledTimes(1);
				expect(requestSent).toEqual([false]);
			}
		);

		it('is not called when the deletion is undone (boundary)', () => {
			const left = vi.fn();
			app.tasks.remove(second.id, { onleave: left });

			app.notifications.runAction(toast()!.id);

			expect(left).not.toHaveBeenCalled();
		});
	});

	describe('committing', () => {
		it.each([
			['expired', 'expired'],
			['dismissed', 'dismissed']
		] as const)(
			'sends the DELETE once when the toast is %s (happy path)',
			async (_name, reason) => {
				// GIVEN: A removal.
				app.tasks.remove(second.id);

				// WHEN: The toast leaves.
				app.notifications.remove(toast()!.id, reason);
				await app.tasks.commitPending();

				// THEN: The request left once, and the list stays without the task.
				expect(api.deleteTask).toHaveBeenCalledTimes(1);
				expect(api.deleteTask).toHaveBeenCalledWith(second.id);
				expect(app.tasks.tasks).toEqual([first, third]);
				expect(app.notifications.items.filter((toast) => toast.type === 'error')).toEqual([]);
			}
		);

		it('sends the DELETE when the 6 s run out (happy path)', async () => {
			// GIVEN: A removal.
			vi.useFakeTimers();
			app.tasks.remove(second.id);

			// WHEN: Less than 6 s pass, then the rest.
			await vi.advanceTimersByTimeAsync(5900);
			expect(api.deleteTask).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(200);

			// THEN: The request has left.
			expect(api.deleteTask).toHaveBeenCalledWith(second.id);
		});

		it('is idempotent: committing again sends nothing more (boundary)', async () => {
			// GIVEN: A removal whose toast expired.
			app.tasks.remove(second.id);
			app.notifications.remove(toast()!.id, 'expired');

			// WHEN: Everything pending is committed twice more.
			await app.tasks.commitPending();
			await app.tasks.commitPending();

			// THEN: One request in all.
			expect(api.deleteTask).toHaveBeenCalledTimes(1);
		});

		it('keeps the task out silently when the server says it is already gone (limit)', async () => {
			// GIVEN: The server no longer knows the task.
			vi.mocked(api.deleteTask).mockResolvedValue(gone);
			app.tasks.remove(second.id);

			// WHEN: The deletion is committed.
			await app.tasks.commitPending();

			// THEN: Success in disguise: no error, no information, the list without the task.
			expect(app.tasks.tasks).toEqual([first, third]);
			expect(app.notifications.items.filter((toast) => toast.type === 'error')).toEqual([]);
			expect(app.notifications.items).toEqual([]);
		});

		it.each([
			[
				'a refusal',
				() => vi.mocked(api.deleteTask).mockResolvedValue({ success: false, error: 'HTTP 500' }),
				'HTTP 500'
			],
			[
				'an empty refusal',
				() => vi.mocked(api.deleteTask).mockResolvedValue({ success: false, error: '' }),
				"We couldn't delete the task."
			],
			[
				'a thrown error',
				() => vi.mocked(api.deleteTask).mockRejectedValue(new Error('Network down')),
				'Network down'
			]
		] as const)(
			'puts the row back at its place and shows the error after %s (sad path, exception)',
			async (_name, arrange, message) => {
				// GIVEN: A server that fails.
				arrange();
				app.tasks.remove(second.id);

				// WHEN: The deletion is committed.
				await app.tasks.commitPending();

				// THEN: The row is back where it was and the error is shown.
				expect(app.tasks.tasks).toEqual([first, second, third]);
				expect(lastToast(app)).toBe(message);
				expect(app.notifications.items).toEqual([
					expect.objectContaining({ message, type: 'error' })
				]);
			}
		);

		it('never switches loading on, so the forms stay usable (limit)', async () => {
			// GIVEN: A slow server.
			let answer!: (value: ApiResult<void>) => void;
			vi.mocked(api.deleteTask).mockReturnValue(new Promise((resolve) => (answer = resolve)));
			app.tasks.remove(second.id);

			// WHEN: The deletion is in flight.
			const committing = app.tasks.commitPending();

			// THEN: loading stays off.
			expect(app.tasks.status.loading).toBe(false);
			answer({ success: true });
			await committing;
			expect(app.tasks.status.loading).toBe(false);
		});
	});

	describe('changing user', () => {
		it('sends the pending deletions at once and closes their toasts (happy path)', async () => {
			// GIVEN: A removal waiting.
			app.tasks.remove(second.id);

			// WHEN: Another user is selected.
			app.tasks.clear(2);
			await vi.waitFor(() => expect(api.deleteTask).toHaveBeenCalledWith(second.id));

			// THEN: The request left once and the toast is gone.
			expect(api.deleteTask).toHaveBeenCalledTimes(1);
			expect(app.notifications.items).toEqual([]);
		});

		it('does not put a refused row into the list of the other user (sad path)', async () => {
			// GIVEN: A removal that the server will refuse.
			vi.mocked(api.deleteTask).mockResolvedValue({ success: false, error: 'HTTP 500' });
			app.tasks.remove(second.id);

			// WHEN: Another user is selected and the refusal arrives.
			app.tasks.clear(2);
			await vi.waitFor(() => expect(lastToast(app)).toBe('HTTP 500'));

			// THEN: The other user's list stays empty.
			expect(app.tasks.tasks).toEqual([]);
		});
	});

	describe('reloading a list while a deletion is in flight', () => {
		const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
		const grace = { id: 2, name: 'Grace', email: 'grace@example.com' };

		async function inFlightThenBackToFirstUser() {
			vi.mocked(api.getUser).mockImplementation((id) =>
				Promise.resolve({
					success: true,
					data: id === 1 ? ada : grace
				})
			);
			vi.mocked(api.getUserTasks).mockImplementation((id) =>
				Promise.resolve({ success: true, data: id === 1 ? [first, second, third] : [] })
			);
			let answer!: (value: ApiResult<void>) => void;
			vi.mocked(api.deleteTask).mockReturnValue(new Promise((resolve) => (answer = resolve)));
			await app.users.select(1);
			app.tasks.remove(second.id);
			await app.users.select(2);
			await app.users.select(1);
			return answer;
		}

		it('does not show a task whose deletion is on its way (sad path)', async () => {
			// GIVEN: A deletion sent by a change of user and not answered yet, and the first user
			// selected again: the server still lists the task.
			const answer = await inFlightThenBackToFirstUser();

			// THEN: The reloaded list leaves it out, also once the server confirms.
			expect(app.tasks.tasks).toEqual([first, third]);
			answer({ success: true });
			await vi.waitFor(() => expect(api.deleteTask).toHaveBeenCalledTimes(1));
			await Promise.resolve();
			expect(app.tasks.tasks).toEqual([first, third]);
		});

		it('shows the task again, at its place, if the server finally refuses (exception)', async () => {
			// GIVEN: The same situation.
			const answer = await inFlightThenBackToFirstUser();

			// WHEN: The server refuses.
			answer({ success: false, error: 'HTTP 500' });

			// THEN: The task is listed again.
			await vi.waitFor(() => expect(app.tasks.tasks).toEqual([first, second, third]));
		});
	});

	describe('after a refused deletion', () => {
		it('lets a reloaded list show the restored task (exception)', async () => {
			// GIVEN: A deletion the server refused: the row is back.
			vi.mocked(api.getUserTasks).mockResolvedValue({
				success: true,
				data: [first, second, third]
			});
			vi.mocked(api.deleteTask).mockResolvedValue({ success: false, error: 'HTTP 500' });
			app.tasks.remove(second.id);
			await app.tasks.commitPending();
			expect(app.tasks.tasks).toEqual([first, second, third]);

			// WHEN: The list is loaded again and the server still lists the task.
			await app.tasks.load(1, () => true);

			// THEN: The task stays displayed: a finished request no longer hides it.
			expect(app.tasks.tasks).toEqual([first, second, third]);
		});
	});

	describe('leaving the page', () => {
		it('sends the pending deletions with keepalive, once, whatever the number of events (happy path)', async () => {
			// GIVEN: A removal waiting.
			app.tasks.remove(second.id);

			// WHEN: The page is hidden, then unloaded.
			await app.tasks.commitPending({ keepalive: true });
			await app.tasks.commitPending({ keepalive: true });

			// THEN: One request, marked keepalive, and the toast is gone.
			expect(api.deleteTask).toHaveBeenCalledTimes(1);
			expect(api.deleteTask).toHaveBeenCalledWith(second.id, { keepalive: true });
			expect(app.notifications.items).toEqual([]);
		});

		it('sends nothing when nothing is pending (boundary)', async () => {
			await app.tasks.commitPending({ keepalive: true });
			expect(api.deleteTask).not.toHaveBeenCalled();
		});

		it('sends every pending deletion (limit)', async () => {
			// GIVEN: Two removals.
			app.tasks.remove(first.id);
			app.tasks.remove(third.id);

			// WHEN: The page is hidden.
			await app.tasks.commitPending({ keepalive: true });

			// THEN: Both left.
			expect(api.deleteTask).toHaveBeenCalledTimes(2);
		});
	});
});
