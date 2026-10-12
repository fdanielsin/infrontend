import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiResult } from '$lib/api/client';
import { jsonResponse, stubFetch } from '../support/fetch';

// Every success response is checked against the contract (zod schemas generated from
// openapi.yaml): a body that does not match is an `invalid_response` failure, never data.

const user = { id: 1, name: 'Ada', email: 'ada@example.com' };
const task = { id: 10, title: 'Review', description: 'Review code', user_id: 1, completed: false };
const updated = { id: 10, title: 'Review', description: 'Review code', completed: true };
const HEALTH = { status: 'ok', version: '2.0.0', id: '3f2c1e6a-8b4d-4c2a-9e1f-5a6b7c8d9e0f' };

type Call = () => Promise<ApiResult<unknown> | ApiResult<void>>;

// The 7 validated operations, with a conforming `data` and the field each one may lose.
const OPERATIONS: [string, Call, unknown, string][] = [
	['getUsers', () => api.getUsers(), [user], 'id'],
	['getUser', () => api.getUser(1), user, 'id'],
	['createUser', () => api.createUser({ name: 'Ada', email: 'ada@example.com' }), user, 'id'],
	['getUserTasks', () => api.getUserTasks(1), [task], 'id'],
	[
		'createTask',
		() => api.createTask({ user_id: 1, title: 'Review', completed: false }),
		task,
		'id'
	],
	['updateTask', () => api.updateTask(10, { completed: true }), updated, 'completed'],
	['getStats', () => api.getStats(), { users: 3, tasks: 10 }, 'tasks']
];

const answer = (body: unknown) => stubFetch(jsonResponse(body));

const INVALID = {
	success: false,
	error: 'Invalid server response',
	status: 200,
	kind: 'invalid_response'
};

// `data` without `field`, in a single object or in the first element of a list.
function withoutField(data: unknown, field: string) {
	const drop = (item: unknown) => {
		const copy = { ...(item as Record<string, unknown>) };
		delete copy[field];
		return copy;
	};
	return Array.isArray(data) ? [drop(data[0])] : drop(data);
}

describe('validation of the API responses against the contract', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each(OPERATIONS)(
		'%s returns a conforming body as data (happy path)',
		async (_name, call, data) => {
			// GIVEN: A body that matches the contract.
			answer({ success: true, data });

			// WHEN / THEN: It is returned as is.
			await expect(call()).resolves.toEqual({ success: true, data });
		}
	);

	it('deleteTask returns a conforming message envelope (happy path)', async () => {
		// GIVEN / WHEN / THEN: The deletion envelope carries its message.
		answer({ success: true, message: 'Task deleted' });
		await expect(api.deleteTask(10)).resolves.toEqual({ success: true, message: 'Task deleted' });
	});

	it.each(OPERATIONS)(
		'%s refuses a body missing a required field (sad path)',
		async (_name, call, data, field) => {
			// GIVEN: A required field left out (the id; the flag of an update; the tasks counter of statistics).
			answer({ success: true, data: withoutField(data, field) });

			// WHEN / THEN: Invalid response.
			await expect(call()).resolves.toEqual(INVALID);
		}
	);

	it.each(OPERATIONS)('%s refuses data: null (sad path)', async (_name, call) => {
		// GIVEN / WHEN / THEN: A null payload.
		answer({ success: true, data: null });
		await expect(call()).resolves.toEqual(INVALID);
	});

	it.each(OPERATIONS)(
		'%s refuses data of the wrong shape (sad path)',
		async (_name, call, data) => {
			// GIVEN: A list where an object is expected, or an object where a list is expected.
			const list = Array.isArray(data) ? (data as unknown[]) : null;
			answer({ success: true, data: list ? list[0] : [data] });

			// WHEN / THEN: Invalid response.
			await expect(call()).resolves.toEqual(INVALID);
		}
	);

	// The client keeps no check of its own on the envelope: the schemas alone refuse these.
	const ENVELOPES: [string, Call, Record<string, unknown>][] = [
		...OPERATIONS.map(([name, call, data]): [string, Call, Record<string, unknown>] => [
			name,
			call,
			{ data }
		]),
		['deleteTask', () => api.deleteTask(10), { message: 'Task deleted' }],
		['health', () => api.health(), { message: 'ok', data: HEALTH }],
		['ready', () => api.ready(), { message: 'ready', data: { status: 'ready' } }]
	];

	it.each(ENVELOPES)(
		'%s refuses success: false sent with a 2xx status (sad path)',
		async (_n, call, body) => {
			// GIVEN: A complete body, but flagged as a failure.
			answer({ ...body, success: false });

			// WHEN / THEN: Invalid response, not data.
			await expect(call()).resolves.toEqual(INVALID);
		}
	);

	it.each(ENVELOPES)(
		'%s refuses an error envelope sent with a 2xx status (sad path)',
		async (_n, call) => {
			// GIVEN / WHEN / THEN: What the backend sends on a failure, under a 200.
			answer({ success: false, error: 'Boom', error_code: 'INTERNAL_ERROR' });
			await expect(call()).resolves.toEqual(INVALID);
		}
	);

	it.each(ENVELOPES)(
		'%s refuses an envelope without success (sad path)',
		async (_n, call, body) => {
			// GIVEN / WHEN / THEN: The flag is missing.
			answer(body);
			await expect(call()).resolves.toEqual(INVALID);
		}
	);

	it.each(ENVELOPES.filter(([, , body]) => 'data' in body))(
		'%s refuses a success without data (sad path)',
		async (_n, call, body) => {
			// GIVEN / WHEN / THEN: Everything but `data`.
			answer({ ...body, success: true, data: undefined });
			await expect(call()).resolves.toEqual(INVALID);
		}
	);

	it('refuses a deletion without its message, as the contract requires (sad path)', async () => {
		// GIVEN / WHEN / THEN: A bare success envelope for DELETE.
		answer({ success: true });
		await expect(api.deleteTask(10)).resolves.toEqual(INVALID);
	});

	it('accepts an empty list (limit)', async () => {
		// GIVEN / WHEN / THEN: No user yet.
		answer({ success: true, data: [] });
		await expect(api.getUsers()).resolves.toEqual({ success: true, data: [] });
	});

	it('accepts very long text with special characters and emojis (limit)', async () => {
		// GIVEN: A task whose texts are long and full of special characters.
		const odd = {
			...task,
			title: `<b>Révision</b> 🚀 « 東京 » ${'x'.repeat(10_000)}`,
			description: '\u0000\n\t"\''
		};
		answer({ success: true, data: odd });

		// WHEN / THEN: They are kept as sent.
		await expect(
			api.createTask({ user_id: 1, title: 'Review', completed: false })
		).resolves.toEqual({
			success: true,
			data: odd
		});
	});

	it('current rule: accepts extra fields, keeps those inside data, drops the top-level ones (limit)', async () => {
		// GIVEN: A user with a field the contract does not declare, and an extra envelope field.
		answer({ success: true, data: { ...user, role: 'admin' }, extra: 1 });

		// WHEN: Users are fetched.
		const result = await api.getUser(1);

		// THEN: Valid; the envelope keeps only its declared fields, `data` is passed on whole
		// (the generated schema intersects `data: unknown` with the operation's object).
		expect(result).toEqual({ success: true, data: { ...user, role: 'admin' } });
	});

	it.each([0, 4294967295])('accepts the uint32 id %d (boundary)', async (id) => {
		// GIVEN / WHEN / THEN: Both ends of the uint32 range.
		answer({ success: true, data: { ...user, id } });
		await expect(api.getUser(id)).resolves.toEqual({ success: true, data: { ...user, id } });
	});

	it.each(OPERATIONS.filter(([name]) => name !== 'getStats'))(
		'%s refuses a body whose id is a string (sad path)',
		async (_name, call, data) => {
			// GIVEN: An id sent as text, in a single object or in the first element of a list.
			const change = (item: unknown) => ({ ...(item as object), id: '1' });
			answer({ success: true, data: Array.isArray(data) ? [change(data[0])] : change(data) });

			// WHEN / THEN: It is an invalid response, not data.
			await expect(call()).resolves.toEqual(INVALID);
		}
	);

	it.each([4294967296, -1, 1.5])('refuses the id %d, outside uint32 (boundary)', async (id) => {
		// GIVEN / WHEN / THEN: Just past the range, negative, or not an integer.
		answer({ success: true, data: { ...user, id } });
		await expect(api.getUser(1)).resolves.toEqual(INVALID);
	});

	it.each([true, false])('accepts completed: %s (boundary)', async (completed) => {
		// GIVEN / WHEN / THEN: Both values of the flag.
		answer({ success: true, data: { ...task, completed } });
		await expect(
			api.createTask({ user_id: 1, title: 'Review', completed: false })
		).resolves.toEqual({
			success: true,
			data: { ...task, completed }
		});
	});

	it.each(['true', 1, null])('refuses completed: %j (boundary)', async (completed) => {
		// GIVEN / WHEN / THEN: A flag that is not a boolean.
		answer({ success: true, data: { ...updated, completed } });
		await expect(api.updateTask(10, { completed: true })).resolves.toEqual(INVALID);
	});

	it.each([0, 4294967296, 2 ** 53 - 1])(
		'keeps the stats counter %d as a number (boundary)',
		async (count) => {
			// GIVEN: Counters at both ends of the safe integer range.
			answer({ success: true, data: { users: count, tasks: count } });

			// WHEN: Stats are fetched.
			const result = await api.getStats();

			// THEN: Valid, and plain numbers (never bigint).
			expect(result).toEqual({ success: true, data: { users: count, tasks: count } });
			if (result.success) expect(typeof result.data.users).toBe('number');
		}
	);

	it.each([-1, 1.5, '3'])('refuses the stats counter %j (boundary)', async (count) => {
		// GIVEN / WHEN / THEN: A negative count, a fraction or a numeric string.
		answer({ success: true, data: { users: count, tasks: 1 } });
		await expect(api.getStats()).resolves.toEqual(INVALID);
	});

	it('validates the health check: any message language and version are accepted (happy path)', async () => {
		// GIVEN: A health envelope with a French message and a new version.
		const envelope = { success: true, message: 'Le service fonctionne', data: HEALTH };
		answer(envelope);

		// WHEN / THEN: It matches the contract and is returned.
		await expect(api.health()).resolves.toEqual(envelope);
	});

	it.each([
		['an unknown status', { ...HEALTH, status: 'odd' }],
		['an id that is not a uuid', { ...HEALTH, id: 'x' }],
		['no version', { status: 'ok', id: HEALTH.id }]
	])('refuses a health check with %s (sad path)', async (_case, data) => {
		// GIVEN / WHEN / THEN: A health body that does not match the contract.
		answer({ success: true, message: 'Service is healthy', data });
		await expect(api.health()).resolves.toEqual(INVALID);
	});

	it('refuses a health check without its message (sad path)', async () => {
		// GIVEN / WHEN / THEN: The contract requires the message.
		answer({ success: true, data: HEALTH });
		await expect(api.health()).resolves.toEqual(INVALID);
	});
});
