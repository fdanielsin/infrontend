import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type ApiResult } from '$lib/api/client';
import { failureMessage } from '$lib/i18n/errors';
import { overwriteGetLocale, type Locale } from '$lib/paraglide/runtime';

// Every success response is checked against the contract (zod schemas generated from
// openapi.yaml): a body that does not match is an `invalid_response` failure, never data.

const user = { id: 1, name: 'Ada', email: 'ada@example.com' };
const task = { id: 10, title: 'Review', description: 'Review code', user_id: 1, completed: false };
const updated = { id: 10, title: 'Review', description: 'Review code', completed: true };

type Call = () => Promise<ApiResult<unknown>>;

// The 8 validated operations, with a conforming `data` and the field each one may break.
const OPERATIONS: [string, Call, unknown][] = [
	['getUsers', () => api.getUsers(), [user]],
	['getUser', () => api.getUser(1), user],
	['createUser', () => api.createUser({ name: 'Ada', email: 'ada@example.com' }), user],
	['getUserTasks', () => api.getUserTasks(1), [task]],
	['createTask', () => api.createTask({ user_id: 1, title: 'Review', completed: false }), task],
	['updateTask', () => api.updateTask(10, { completed: true }), updated],
	['getStats', () => api.getStats(), { users: 3, tasks: 10 }]
];

function answer(body: unknown, status = 200) {
	vi.spyOn(globalThis, 'fetch').mockResolvedValue(
		new Response(typeof body === 'string' ? body : JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' }
		})
	);
}

function translation(locale: Locale, key: string) {
	const messages = JSON.parse(
		readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
	) as Record<string, string>;
	return messages[key];
}

const invalid = (status = 200) => ({
	success: false,
	error: 'Invalid server response',
	status,
	kind: 'invalid_response'
});

// Replaces, in a single object or in the first element of a list, one field by another value.
function withField(data: unknown, field: string, value: unknown) {
	const change = (item: unknown) => ({ ...(item as object), [field]: value });
	const list: unknown[] | null = Array.isArray(data) ? (data as unknown[]) : null;
	return list ? [change(list[0]), ...list.slice(1)] : change(data);
}

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
		overwriteGetLocale(() => 'en');
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

	it.each(OPERATIONS.filter(([name]) => name !== 'getStats'))(
		'%s refuses a body whose id is a string (sad path)',
		async (_name, call, data) => {
			// GIVEN: An id sent as text.
			answer({ success: true, data: withField(data, 'id', '1') });

			// WHEN / THEN: It is an invalid response, not data.
			await expect(call()).resolves.toEqual(invalid());
		}
	);

	it.each(OPERATIONS)(
		'%s refuses a body missing a required field (sad path)',
		async (name, call, data) => {
			// GIVEN: A required field left out (stats: tasks; others: the first field).
			const field = name === 'getStats' ? 'tasks' : name === 'updateTask' ? 'completed' : 'id';
			answer({ success: true, data: withoutField(data, field) });

			// WHEN / THEN: Invalid response.
			await expect(call()).resolves.toEqual(invalid());
		}
	);

	it.each(OPERATIONS)('%s refuses data: null (sad path)', async (_name, call) => {
		// GIVEN / WHEN / THEN: A null payload.
		answer({ success: true, data: null });
		await expect(call()).resolves.toEqual(invalid());
	});

	it.each(OPERATIONS)(
		'%s refuses data of the wrong shape (sad path)',
		async (_name, call, data) => {
			// GIVEN: A list where an object is expected, or an object where a list is expected.
			const list: unknown[] | null = Array.isArray(data) ? (data as unknown[]) : null;
			answer({ success: true, data: list ? list[0] : [data] });

			// WHEN / THEN: Invalid response.
			await expect(call()).resolves.toEqual(invalid());
		}
	);

	it.each(OPERATIONS)(
		'%s refuses success: false sent with a 200 status (sad path)',
		async (_name, call, data) => {
			// GIVEN / WHEN / THEN: A failure envelope disguised as a success.
			answer({ success: false, data, error: 'x', error_code: 'INTERNAL_ERROR' });
			await expect(call()).resolves.toEqual(invalid());
		}
	);

	it('refuses a deletion without its message, as the contract requires (sad path)', async () => {
		// GIVEN / WHEN / THEN: A bare success envelope for DELETE.
		answer({ success: true });
		await expect(api.deleteTask(10)).resolves.toEqual(invalid());
	});

	it.each(['en', 'fr', 'de', 'es'] as const)(
		'shows an invalid response in %s with its own message (happy path)',
		async (locale) => {
			// GIVEN: An invalid body and the interface language.
			overwriteGetLocale(() => locale);
			answer({ success: true, data: null });

			// WHEN: The failure is worded.
			const result = await api.getUsers();

			// THEN: The translated "invalid response" message.
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(failureMessage(result, () => 'fallback')).toBe(
					translation(locale, 'error_invalid_response')
				);
			}
		}
	);

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

	it.each([4294967296, -1, 1.5])('refuses the id %d, outside uint32 (boundary)', async (id) => {
		// GIVEN / WHEN / THEN: Just past the range, negative, or not an integer.
		answer({ success: true, data: { ...user, id } });
		await expect(api.getUser(1)).resolves.toEqual(invalid());
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
		await expect(api.updateTask(10, { completed: true })).resolves.toEqual(invalid());
	});

	it.each([0, 2 ** 53 - 1])(
		'keeps the stats counter %d as a number (boundary, int64 patch)',
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

	it.each([1.5, '3'])('refuses the stats counter %j (boundary)', async (count) => {
		// GIVEN / WHEN / THEN: A fraction or a numeric string.
		answer({ success: true, data: { users: count, tasks: 1 } });
		await expect(api.getStats()).resolves.toEqual(invalid());
	});

	it('turns a malformed JSON body into an invalid response (exception)', async () => {
		// GIVEN / WHEN / THEN: A 200 whose body is not JSON.
		answer('{not json');
		await expect(api.getStats()).resolves.toEqual(invalid());
	});

	it('turns an aborted request into an ordinary failure (exception)', async () => {
		// GIVEN: fetch rejecting with an AbortError, as a cancelled request does. Browsers raise a
		// DOMException, which is an Error there; jsdom's is not, hence an Error named AbortError.
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(
			Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
		);

		// WHEN / THEN: A failure with the message, no kind, no exception.
		await expect(api.getUsers()).resolves.toEqual({
			success: false,
			error: 'The operation was aborted.'
		});
	});

	it('current rule: does not validate the health check (limit, decision)', async () => {
		// GIVEN: A health body that does not match the contract (no version, no id).
		answer({ success: true, message: 'whatever', data: { status: 'odd' } });

		// WHEN / THEN: It is passed through; health and ready are not validated for now.
		await expect(api.health()).resolves.toEqual({
			success: true,
			message: 'whatever',
			data: { status: 'odd' }
		});
	});
});
