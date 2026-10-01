import type { Page, Route } from '@playwright/test';

// In-memory stand-in for the inbackend API, so that accessibility and keyboard
// scenarios run without a backend. Shapes follow the contract envelopes.

export interface MockUser {
	id: number;
	name: string;
	email: string;
}

export interface MockTask {
	id: number;
	title: string;
	description: string;
	user_id: number;
	completed: boolean;
}

export interface MockFailure {
	status: number;
	error: string;
	code?: string;
}

export interface MockApi {
	users: MockUser[];
	tasks: MockTask[];
	// Next answer of an operation, consumed once: `PUT /tasks`, `DELETE /tasks`, `GET /stats`...
	failNext: (operation: string, failure: MockFailure) => void;
	stats: { users: number; tasks: number } | null;
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

function textOf(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function json(route: Route, status: number, body: unknown) {
	return route.fulfill({
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
		failNext: (operation, failure) => failures.set(operation, failure)
	};
	let nextId = 1000;

	await page.route('**/api/v1/**', async (route) => {
		const request = route.request();
		const method = request.method();
		if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });

		const path = new URL(request.url()).pathname.replace('/api/v1', '');
		const resource = path.replace(/\/\d+/g, '/{id}');
		const operation = `${method} ${resource}`;
		const failure = failures.get(operation);
		if (failure) {
			failures.delete(operation);
			return json(route, failure.status, {
				success: false,
				error: failure.error,
				...(failure.code && { error_code: failure.code })
			});
		}

		const id = Number(path.match(/\/(\d+)/)?.[1]);
		const body = request.postDataJSON() as Record<string, unknown> | null;

		switch (operation) {
			case 'GET /users':
				return json(route, 200, { success: true, data: state.users });
			case 'POST /users': {
				const user = { id: nextId++, name: textOf(body?.name), email: textOf(body?.email) };
				state.users.push(user);
				return json(route, 201, { success: true, data: user });
			}
			case 'GET /users/{id}': {
				const user = state.users.find((candidate) => candidate.id === id);
				return user
					? json(route, 200, { success: true, data: user })
					: json(route, 404, {
							success: false,
							error: 'User not found',
							error_code: 'USER_NOT_FOUND'
						});
			}
			case 'GET /users/{id}/tasks':
				return json(route, 200, {
					success: true,
					data: state.tasks.filter((task) => task.user_id === id)
				});
			case 'POST /tasks': {
				const task = {
					id: nextId++,
					title: textOf(body?.title),
					description: textOf(body?.description),
					user_id: Number(body?.user_id),
					completed: Boolean(body?.completed)
				};
				state.tasks.push(task);
				return json(route, 201, { success: true, data: task });
			}
			case 'PUT /tasks/{id}': {
				const task = state.tasks.find((candidate) => candidate.id === id);
				if (!task) {
					return json(route, 404, {
						success: false,
						error: 'Task not found',
						error_code: 'TASK_NOT_FOUND'
					});
				}
				Object.assign(task, body);
				return json(route, 200, { success: true, data: task });
			}
			case 'DELETE /tasks/{id}': {
				const before = state.tasks.length;
				state.tasks = state.tasks.filter((task) => task.id !== id);
				return before === state.tasks.length
					? json(route, 404, {
							success: false,
							error: 'Task not found',
							error_code: 'TASK_NOT_FOUND'
						})
					: json(route, 200, { success: true, message: 'Task deleted' });
			}
			case 'GET /stats':
				return json(route, 200, {
					success: true,
					data: state.stats ?? { users: state.users.length, tasks: state.tasks.length }
				});
			default:
				return json(route, 404, {
					success: false,
					error: 'Route not found',
					error_code: 'ROUTE_NOT_FOUND'
				});
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
	await page.getByRole('button', { name: new RegExp(userName) }).click();
	await page.getByRole('heading', { name: `Tasks for ${userName}` }).waitFor();
}
