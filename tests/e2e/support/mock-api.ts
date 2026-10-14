import type { Page, Route } from '@playwright/test';
import type { components, operations } from '../../../src/lib/api/schema';

// In-memory stand-in for the inbackend API, so that accessibility and keyboard
// scenarios run without a backend. Shapes follow the contract envelopes.

type Schemas = components['schemas'];

// The JSON body that the contract gives an operation for a status: a simulated answer typed by it
// no longer compiles once the contract moves away from it (`bun run check`).
type Reply<
	Operation extends keyof operations,
	Status extends keyof operations[Operation]['responses']
> = operations[Operation]['responses'][Status] extends {
	content: { 'application/json': infer Body };
}
	? Body
	: never;

// An error answer: a failure of a test may leave out its code, or carry one the contract lacks.
type MockedError = Omit<Schemas['ErrorResponse'], 'error_code'> & { error_code?: string };

const notFound = {
	user: {
		success: false,
		error: 'User not found',
		error_code: 'USER_NOT_FOUND'
	} satisfies Schemas['ErrorResponse'],
	task: {
		success: false,
		error: 'Task not found',
		error_code: 'TASK_NOT_FOUND'
	} satisfies Schemas['ErrorResponse']
};

export type MockUser = Schemas['User'];
export type MockTask = Schemas['Task'];

export interface MockFailure {
	status: number;
	error: string;
	// A code of the contract.
	code?: Schemas['ErrorCode'];
	// A code that the contract does not know yet (it may add some): what a client must survive.
	futureCode?: string;
	// The `X-Request-Id` header of the answer.
	requestId?: string;
}

// What `GET /ready` answers: ready, a status code, or a connection that fails.
export type MockReadiness = 'ready' | 'unreachable' | number;

export interface MockApi {
	users: MockUser[];
	tasks: MockTask[];
	// Next answer of an operation, consumed once: `PUT /tasks`, `DELETE /tasks`, `GET /stats`...
	failNext: (operation: string, failure: MockFailure) => void;
	stats: { users: number; tasks: number } | null;
	readiness: MockReadiness;
	// The `X-Request-Id` header of a failing `GET /ready`.
	readinessRequestId: string | null;
	// Version reported by `GET /health`; null makes that call fail.
	version: string | null;
	// Every call to the API (`/api/v1/**`), in order: "GET /users".
	calls: string[];
	// The same calls with the JSON body they carried (null without one).
	requests: { operation: string; body: unknown }[];
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Access-Control-Expose-Headers': 'X-Request-Id'
};

function textOf(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function json(
	route: Route,
	status: number,
	body: Schemas['SuccessResponse'] | MockedError,
	headers: Record<string, string> = {}
) {
	return route.fulfill({
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify(body)
	});
}

export async function mockApi(
	page: Page,
	initial: { users?: MockUser[]; tasks?: MockTask[]; stats?: MockApi['stats'] } = {}
): Promise<MockApi> {
	const failures = new Map<string, MockFailure>();
	const state: MockApi = {
		users: structuredClone(initial.users ?? []),
		tasks: structuredClone(initial.tasks ?? []),
		stats: initial.stats ?? null,
		readiness: 'ready',
		readinessRequestId: null,
		version: '1.2.0',
		calls: [],
		requests: [],
		failNext: (operation, failure) => failures.set(operation, failure)
	};
	let nextId = 1000;

	await page.route(/\/ready$/, async (route) => {
		if (route.request().method() === 'OPTIONS') {
			return route.fulfill({ status: 204, headers: corsHeaders });
		}
		if (state.readiness === 'unreachable') return route.abort('connectionrefused');
		if (state.readiness === 'ready') {
			return json(route, 200, {
				success: true,
				message: 'Service is ready',
				data: { status: 'ready' }
			} satisfies Reply<'readinessCheck', 200>);
		}
		return json(
			route,
			state.readiness,
			{
				success: false,
				error: 'Database unavailable',
				error_code: 'DATABASE_UNAVAILABLE'
			} satisfies Reply<'readinessCheck', 503>,
			state.readinessRequestId ? { 'X-Request-Id': state.readinessRequestId } : {}
		);
	});

	await page.route(/\/health$/, async (route) => {
		if (route.request().method() === 'OPTIONS') {
			return route.fulfill({ status: 204, headers: corsHeaders });
		}
		if (state.version === null) {
			return json(route, 500, {
				success: false,
				error: 'boom',
				error_code: 'INTERNAL_ERROR'
			} satisfies Schemas['ErrorResponse']);
		}
		return json(route, 200, {
			success: true,
			message: 'Service is healthy',
			data: { id: 'b868c6a6-2f9d-42fd-a9c5-8c7e342f78dd', status: 'ok', version: state.version }
		} satisfies Reply<'healthCheck', 200>);
	});

	await page.route('**/api/v1/**', async (route) => {
		const request = route.request();
		const method = request.method();
		if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });

		const path = new URL(request.url()).pathname.replace('/api/v1', '');
		const resource = path.replace(/\/\d+/g, '/{id}');
		const operation = `${method} ${resource}`;
		state.calls.push(operation);
		state.requests.push({ operation, body: request.postDataJSON() as unknown });
		const failure = failures.get(operation);
		if (failure) {
			failures.delete(operation);
			return json(
				route,
				failure.status,
				{
					success: false,
					error: failure.error,
					...((failure.code ?? failure.futureCode) && {
						error_code: failure.code ?? failure.futureCode
					})
				},
				failure.requestId ? { 'X-Request-Id': failure.requestId } : {}
			);
		}

		const id = Number(path.match(/\/(\d+)/)?.[1]);
		const body = request.postDataJSON() as Record<string, unknown> | null;

		switch (operation) {
			case 'GET /users':
				return json(route, 200, {
					success: true,
					data: state.users
				} satisfies Reply<'listUsers', 200>);
			case 'POST /users': {
				const user = { id: nextId++, name: textOf(body?.name), email: textOf(body?.email) };
				state.users.push(user);
				return json(route, 201, { success: true, data: user } satisfies Reply<'createUser', 201>);
			}
			case 'GET /users/{id}': {
				const user = state.users.find((candidate) => candidate.id === id);
				return user
					? json(route, 200, { success: true, data: user } satisfies Reply<'getUser', 200>)
					: json(route, 404, notFound.user);
			}
			case 'PUT /users/{id}': {
				// Like the server: the name alone, and it must be there (USER-R17, USER-R18).
				if (!body || Object.keys(body).some((key) => key !== 'name')) {
					return json(route, 400, {
						success: false,
						error: 'Invalid body',
						error_code: 'INVALID_BODY'
					} satisfies Schemas['ErrorResponse']);
				}
				const user = state.users.find((candidate) => candidate.id === id);
				if (!user) return json(route, 404, notFound.user);
				user.name = textOf(body.name).trim();
				return json(route, 200, {
					success: true,
					data: user,
					message: 'User updated'
				} satisfies Reply<'updateUser', 200>);
			}
			case 'DELETE /users/{id}': {
				if (!state.users.some((candidate) => candidate.id === id)) {
					return json(route, 404, notFound.user);
				}
				state.users = state.users.filter((user) => user.id !== id);
				state.tasks = state.tasks.filter((task) => task.user_id !== id);
				return json(route, 200, {
					success: true,
					message: 'User deleted'
				} satisfies Reply<'deleteUser', 200>);
			}
			case 'GET /users/{id}/tasks':
				return json(route, 200, {
					success: true,
					data: state.tasks.filter((task) => task.user_id === id)
				} satisfies Reply<'listUserTasks', 200>);
			case 'POST /tasks': {
				const task = {
					id: nextId++,
					title: textOf(body?.title),
					description: textOf(body?.description),
					user_id: Number(body?.user_id),
					completed: Boolean(body?.completed)
				};
				state.tasks.push(task);
				return json(route, 201, { success: true, data: task } satisfies Reply<'createTask', 201>);
			}
			case 'PUT /tasks/{id}': {
				const task = state.tasks.find((candidate) => candidate.id === id);
				if (!task) return json(route, 404, notFound.task);
				Object.assign(task, body);
				// The contract answers the task without its owner.
				const { id: taskId, title, description, completed } = task;
				return json(route, 200, {
					success: true,
					data: { id: taskId, title, description, completed }
				} satisfies Reply<'updateTask', 200>);
			}
			case 'DELETE /tasks/{id}': {
				const before = state.tasks.length;
				state.tasks = state.tasks.filter((task) => task.id !== id);
				return before === state.tasks.length
					? json(route, 404, notFound.task)
					: json(route, 200, {
							success: true,
							message: 'Task deleted'
						} satisfies Reply<'deleteTask', 200>);
			}
			case 'GET /stats':
				return json(route, 200, {
					success: true,
					data: state.stats ?? { users: state.users.length, tasks: state.tasks.length }
				} satisfies Reply<'getStats', 200>);
			default:
				return json(route, 404, {
					success: false,
					error: 'Route not found',
					error_code: 'ROUTE_NOT_FOUND'
				} satisfies Schemas['ErrorResponse']);
		}
	});

	return state;
}

export const ada: MockUser = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' };
export const grace: MockUser = { id: 2, name: 'Grace Hopper', email: 'grace@example.com' };

export const adaTasks: MockTask[] = [
	{ id: 10, title: 'Review', description: 'Review code', user_id: 1, completed: false },
	{ id: 11, title: 'Review 2', description: 'Second pass', user_id: 1, completed: true }
];

export async function openHomeWithUser(page: Page, userName = ada.name) {
	await page.goto('/');
	await page.getByRole('button', { name: new RegExp(`^${userName} [^(]`) }).click();
	await page.getByRole('heading', { name: `Tasks for ${userName}` }).waitFor();
}
