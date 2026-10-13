import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFailure, ApiResult } from '$lib/api/client';
import { NotificationState } from '$lib/state/notification.svelte';
import { RequestStatus } from '$lib/state/request-status.svelte';
import { UndoableDeletes, type WhenHidden } from '$lib/state/undoable-deletes';

interface Thing {
	id: number;
	name: string;
}

const ada: Thing = { id: 1, name: 'Ada' };
const bob: Thing = { id: 2, name: 'Bob' };
const gone: ApiFailure = { success: false, error: 'Gone', status: 404, code: 'USER_NOT_FOUND' };
const broken: ApiFailure = { success: false, error: 'Boom', status: 500 };

describe('generic undoable deletions', () => {
	let notifications: NotificationState;
	let send: ReturnType<
		typeof vi.fn<(id: number, o: { keepalive: boolean }) => Promise<ApiResult<void>>>
	>;
	let restored: Array<[Thing, number]>;
	let deletes: UndoableDeletes<Thing>;

	function build(whenHidden: WhenHidden = 'send') {
		deletes = new UndoableDeletes<Thing>({
			notifications,
			status: new RequestStatus(notifications),
			send,
			isGone: (failure) => failure.code === 'USER_NOT_FOUND',
			message: (thing) => `Deleted ${thing.name}`,
			undoLabel: () => 'Undo it',
			failureMessage: () => 'Could not delete',
			putBack: (thing, index) => restored.push([thing, index]),
			whenHidden
		});
	}

	beforeEach(() => {
		notifications = new NotificationState();
		send = vi.fn().mockResolvedValue({ success: true });
		restored = [];
		build();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const toastOf = (name: string) =>
		notifications.items.find((toast) => toast.message === `Deleted ${name}`)!;

	describe('waiting', () => {
		it('offers Undo for 6 s, sends nothing and remembers the item (happy path)', () => {
			expect(deletes.remove(ada, 0)).toBe(true);

			expect(send).not.toHaveBeenCalled();
			expect(deletes.has(ada.id)).toBe(true);
			expect(toastOf('Ada')).toMatchObject({ type: 'success', duration: 6000 });
			expect(toastOf('Ada').action?.label).toBe('Undo it');
		});

		it('refuses an item already waiting, without a second toast (boundary)', () => {
			deletes.remove(ada, 0);

			expect(deletes.remove(ada, 0)).toBe(false);
			expect(notifications.items).toHaveLength(1);
		});

		it('keeps several deletions waiting at once, each with its own toast (happy path)', () => {
			deletes.remove(ada, 0);
			deletes.remove(bob, 1);

			expect(notifications.items.map((toast) => toast.message)).toEqual([
				'Deleted Ada',
				'Deleted Bob'
			]);
			expect(deletes.has(ada.id) && deletes.has(bob.id)).toBe(true);
		});

		it('uses the duration it was given (boundary)', () => {
			deletes = new UndoableDeletes<Thing>({
				notifications,
				status: new RequestStatus(notifications),
				send,
				isGone: () => false,
				message: (thing) => `Deleted ${thing.name}`,
				undoLabel: () => 'Undo it',
				failureMessage: () => 'x',
				putBack: () => {},
				whenHidden: 'send',
				duration: 1234
			});
			deletes.remove(ada, 0);
			expect(toastOf('Ada').duration).toBe(1234);
		});
	});

	describe('undoing', () => {
		it('puts the item back at its index, calls back, and sends nothing (happy path)', async () => {
			const onundo = vi.fn();
			deletes.remove(ada, 3, { onundo });

			notifications.runAction(toastOf('Ada').id);
			await deletes.commitPending();

			expect(restored).toEqual([[ada, 3]]);
			expect(onundo).toHaveBeenCalledExactlyOnceWith(ada.id);
			expect(send).not.toHaveBeenCalled();
			expect(deletes.has(ada.id)).toBe(false);
		});

		it('undoes one deletion and leaves the other waiting (limit)', () => {
			deletes.remove(ada, 0);
			deletes.remove(bob, 1);

			notifications.runAction(toastOf('Bob').id);

			expect(restored).toEqual([[bob, 1]]);
			expect(deletes.has(ada.id)).toBe(true);
		});

		it('does not call onleave when undone (boundary)', () => {
			const onleave = vi.fn();
			deletes.remove(ada, 0, { onleave });
			notifications.runAction(toastOf('Ada').id);
			expect(onleave).not.toHaveBeenCalled();
		});
	});

	describe('sending', () => {
		it.each(['expired', 'dismissed'] as const)(
			'sends once, after onleave, when the toast is %s (happy path)',
			async (reason) => {
				const order: string[] = [];
				send.mockImplementation(() => {
					order.push('send');
					return Promise.resolve({ success: true });
				});
				deletes.remove(ada, 0, { onleave: () => order.push('leave') });

				notifications.remove(toastOf('Ada').id, reason);
				await deletes.commitPending();
				await deletes.commitPending();

				expect(order).toEqual(['leave', 'send']);
				expect(send).toHaveBeenCalledExactlyOnceWith(ada.id, { keepalive: false });
			}
		);

		it('sends when the 6 s run out and not before (boundary)', async () => {
			vi.useFakeTimers();
			deletes.remove(ada, 0);

			await vi.advanceTimersByTimeAsync(5900);
			expect(send).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(200);
			expect(send).toHaveBeenCalledTimes(1);
		});

		it('counts the typed not-found answer as a success: no toast, no put back (limit)', async () => {
			send.mockResolvedValue(gone);
			deletes.remove(ada, 0);

			await deletes.commitPending();

			expect(restored).toEqual([]);
			expect(notifications.items).toEqual([]);
		});

		it('puts the item back and reports once on any other failure (sad path)', async () => {
			send.mockResolvedValue(broken);
			deletes.remove(ada, 2);

			await deletes.commitPending();

			expect(restored).toEqual([[ada, 2]]);
			expect(notifications.items.map((toast) => toast.type)).toEqual(['error']);
		});

		it('puts the item back when the request throws (sad path)', async () => {
			send.mockRejectedValue(new Error('network'));
			deletes.remove(ada, 0);
			await deletes.commitPending();
			expect(restored).toEqual([[ada, 0]]);
		});

		it('sends with keepalive and closes every toast, once, whatever the calls (limit)', async () => {
			deletes.remove(ada, 0);
			deletes.remove(bob, 1);

			await Promise.all([
				deletes.commitPending({ keepalive: true }),
				deletes.commitPending({ keepalive: true })
			]);

			expect(send).toHaveBeenCalledTimes(2);
			expect(send).toHaveBeenCalledWith(ada.id, { keepalive: true });
			expect(send).toHaveBeenCalledWith(bob.id, { keepalive: true });
			expect(notifications.items).toEqual([]);
		});

		it('sends nothing when nothing is waiting (boundary)', async () => {
			await deletes.commitPending();
			expect(send).not.toHaveBeenCalled();
		});

		it('sends only what `where` accepts and leaves the rest waiting (limit)', async () => {
			deletes.remove(ada, 0);
			deletes.remove(bob, 1);

			await deletes.commitPending({ where: (thing) => thing.name === 'Bob' });

			expect(send).toHaveBeenCalledExactlyOnceWith(bob.id, { keepalive: false });
			expect(deletes.has(ada.id)).toBe(true);
			expect(toastOf('Ada')).toBeDefined();
			expect(notifications.items).toHaveLength(1);
		});

		it('never switches the status loading on (limit)', async () => {
			const status = new RequestStatus(notifications);
			const seen: boolean[] = [];
			send.mockImplementation(() => {
				seen.push(status.loading);
				return Promise.resolve({ success: true });
			});
			deletes = new UndoableDeletes<Thing>({
				notifications,
				status,
				send,
				isGone: () => false,
				message: (thing) => thing.name,
				undoLabel: () => 'Undo',
				failureMessage: () => 'x',
				putBack: () => {},
				whenHidden: 'send'
			});
			deletes.remove(ada, 0);
			await deletes.commitPending();
			expect(seen).toEqual([false]);
		});
	});

	describe('in flight', () => {
		it('knows a deletion sent and not answered, until the answer (happy path)', async () => {
			let answer!: (result: ApiResult<void>) => void;
			send.mockReturnValue(new Promise((resolve) => (answer = resolve)));
			deletes.remove(ada, 0);

			const sending = deletes.commitPending();
			expect(deletes.has(ada.id)).toBe(false);
			expect(deletes.isInFlight(ada.id)).toBe(true);
			answer({ success: true });
			await sending;

			expect(deletes.isInFlight(ada.id)).toBe(false);
		});

		it('stops being in flight after a failure too (sad path)', async () => {
			send.mockResolvedValue(broken);
			deletes.remove(ada, 0);
			await deletes.commitPending();
			expect(deletes.isInFlight(ada.id)).toBe(false);
		});
	});

	describe('a hidden page', () => {
		it('sends at once with keepalive for a type that sends (happy path)', async () => {
			deletes.remove(ada, 0);

			await deletes.onHidden();

			expect(send).toHaveBeenCalledExactlyOnceWith(ada.id, { keepalive: true });
			expect(notifications.items).toEqual([]);
		});

		it('closes the toast with the reason "dismissed" when it sends (limit)', async () => {
			const remove = vi.spyOn(notifications, 'remove');
			deletes.remove(ada, 0);
			const id = toastOf('Ada').id;

			await deletes.commitPending();

			expect(remove).toHaveBeenCalledWith(id, 'dismissed');
		});

		it('never resumes a toast for a type that sends (boundary)', () => {
			const resume = vi.spyOn(notifications, 'resume');
			deletes.remove(ada, 0);
			deletes.onVisible();
			expect(resume).not.toHaveBeenCalled();
		});

		it('does nothing when the page becomes visible again for a type that sends (boundary)', async () => {
			vi.useFakeTimers();
			deletes.remove(ada, 0);
			deletes.onVisible();
			await vi.advanceTimersByTimeAsync(5900);
			expect(send).not.toHaveBeenCalled();
		});

		describe('for a type that pauses', () => {
			beforeEach(() => build('pause'));

			it('sends nothing and holds the window, which goes on with its time left (happy path)', async () => {
				vi.useFakeTimers();
				deletes.remove(ada, 0);
				await vi.advanceTimersByTimeAsync(4000);

				await deletes.onHidden();
				await vi.advanceTimersByTimeAsync(60_000);
				expect(send).not.toHaveBeenCalled();
				expect(notifications.items).toHaveLength(1);

				deletes.onVisible();
				await vi.advanceTimersByTimeAsync(1900);
				expect(send).not.toHaveBeenCalled();
				await vi.advanceTimersByTimeAsync(200);
				expect(send).toHaveBeenCalledExactlyOnceWith(ada.id, { keepalive: false });
			});

			it('pauses every waiting deletion, not only the first (limit)', async () => {
				vi.useFakeTimers();
				deletes.remove(ada, 0);
				deletes.remove(bob, 1);

				await deletes.onHidden();
				await vi.advanceTimersByTimeAsync(60_000);

				expect(send).not.toHaveBeenCalled();
			});

			it('still sends on leaving the page, with keepalive (limit)', async () => {
				deletes.remove(ada, 0);
				await deletes.onHidden();

				await deletes.commitPending({ keepalive: true });

				expect(send).toHaveBeenCalledExactlyOnceWith(ada.id, { keepalive: true });
			});
		});
	});
});
