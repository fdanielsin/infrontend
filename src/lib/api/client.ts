import createClient from 'openapi-fetch';
import { PUBLIC_API_URL } from '$env/static/public';
import { getLocale } from '$lib/paraglide/runtime';
import type { ZodType } from 'zod';
import type { components, paths } from './schema';
import {
	zCreateTaskResponse,
	zCreateUserResponse,
	zDeleteTaskResponse,
	zGetStatsResponse,
	zGetUserResponse,
	zListUsersResponse,
	zListUserTasksResponse,
	zUpdateTaskResponse
} from './zod/zod.gen';

type Schemas = components['schemas'];

export type User = Schemas['User'];
export type Task = Schemas['Task'];
export type UpdatedTask = Schemas['UpdatedTask'];
export type UpdateTaskRequest = Schemas['UpdateTaskRequest'];
export type CreateUserRequest = Schemas['CreateUserRequest'];
export type CreateTaskRequest = Schemas['CreateTaskRequest'];
export type Stats = Schemas['Stats'];
export type ErrorCode = Schemas['ErrorCode'];

type SuccessStatus = 200 | 201;
type JsonBody<Response> = Response extends { content: { 'application/json': infer Body } }
	? Body
	: never;
// Payload of the success envelope an operation declares in the contract; void when it has none.
type SuccessData<Operation extends { responses: object }> =
	JsonBody<Operation['responses'][Extract<keyof Operation['responses'], SuccessStatus>]> extends {
		data: infer Data;
	}
		? Data
		: void;

export type ApiSuccess<T> = { success: true; message?: string } & ([T] extends [void]
	? { data?: undefined }
	: { data: T });

export interface ApiFailure {
	success: false;
	error: string;
	// Failures born in the client, which the interface words itself (the server sent no message).
	kind?: 'invalid_response' | 'unknown';
	status?: number;
	// Stable codes are listed by `ErrorCode`, but the contract lets the server add new ones.
	code?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const API_BASE = PUBLIC_API_URL || 'http://localhost:8080';
const INVALID_RESPONSE = 'Invalid server response';

// The body is read as text and parsed here: a malformed JSON body must become an
// ApiFailure carrying the HTTP status, not an exception.
const http = createClient<paths>({
	baseUrl: API_BASE,
	fetch: (request) => {
		request.headers.set('Accept-Language', getLocale());
		return globalThis.fetch(request);
	}
});

interface Outcome {
	data?: unknown;
	error?: unknown;
	response: Response;
}

function parseJson(text: unknown): unknown {
	if (typeof text !== 'string') return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function invalidResponse(status: number): ApiFailure {
	return { success: false, error: INVALID_RESPONSE, status, kind: 'invalid_response' };
}

function toFailure(error: unknown, status: number): ApiFailure {
	const body = (typeof error === 'string' ? parseJson(error) : error) as
		{ error?: unknown; error_code?: unknown } | null | undefined;
	const message = typeof body?.error === 'string' ? body.error : '';
	return {
		success: false,
		error: message || `HTTP ${status}`,
		status,
		...(typeof body?.error_code === 'string' && { code: body.error_code })
	};
}

// `schema` is the contract's schema of the success response: a body that does not match it is an
// invalid response, whatever its status. `hasData` is false for endpoints whose 200 envelope
// carries only a message. Failure bodies are not checked: the contract lets the server add codes.
async function toResult<T>(
	send: () => Promise<Outcome>,
	{ schema, hasData = true }: { schema?: ZodType; hasData?: boolean } = {}
): Promise<ApiResult<T>> {
	try {
		const { data, error, response } = await send();
		if (!response.ok) return toFailure(error, response.status);
		if (response.status === 204) {
			return hasData ? invalidResponse(204) : ({ success: true } as ApiSuccess<T>);
		}
		const body = parseJson(data) as { success?: unknown; data?: unknown } | null | undefined;
		if (body?.success !== true || (hasData && body.data === undefined)) {
			return invalidResponse(response.status);
		}
		if (!schema) return body as ApiSuccess<T>;
		const checked = schema.safeParse(body);
		return checked.success ? (checked.data as ApiSuccess<T>) : invalidResponse(response.status);
	} catch (error) {
		return error instanceof Error
			? { success: false, error: error.message }
			: { success: false, error: 'Unknown error', kind: 'unknown' };
	}
}

export class ApiClient {
	// Users
	async getUsers(): Promise<ApiResult<SuccessData<paths['/api/v1/users']['get']>>> {
		return toResult(() => http.GET('/api/v1/users', { parseAs: 'text' }), {
			schema: zListUsersResponse
		});
	}

	async getUser(id: number): Promise<ApiResult<SuccessData<paths['/api/v1/users/{id}']['get']>>> {
		return toResult(
			() => http.GET('/api/v1/users/{id}', { params: { path: { id } }, parseAs: 'text' }),
			{ schema: zGetUserResponse }
		);
	}

	async createUser(
		user: CreateUserRequest
	): Promise<ApiResult<SuccessData<paths['/api/v1/users']['post']>>> {
		return toResult(() => http.POST('/api/v1/users', { body: user, parseAs: 'text' }), {
			schema: zCreateUserResponse
		});
	}

	// Tasks
	async getUserTasks(
		userId: number
	): Promise<ApiResult<SuccessData<paths['/api/v1/users/{id}/tasks']['get']>>> {
		return toResult(
			() =>
				http.GET('/api/v1/users/{id}/tasks', {
					params: { path: { id: userId } },
					parseAs: 'text'
				}),
			{ schema: zListUserTasksResponse }
		);
	}

	async createTask(
		task: CreateTaskRequest
	): Promise<ApiResult<SuccessData<paths['/api/v1/tasks']['post']>>> {
		return toResult(() => http.POST('/api/v1/tasks', { body: task, parseAs: 'text' }), {
			schema: zCreateTaskResponse
		});
	}

	async updateTask(
		id: number,
		task: UpdateTaskRequest
	): Promise<ApiResult<SuccessData<paths['/api/v1/tasks/{id}']['put']>>> {
		return toResult(
			() =>
				http.PUT('/api/v1/tasks/{id}', { params: { path: { id } }, body: task, parseAs: 'text' }),
			{ schema: zUpdateTaskResponse }
		);
	}

	async deleteTask(
		id: number
	): Promise<ApiResult<SuccessData<paths['/api/v1/tasks/{id}']['delete']>>> {
		return toResult(
			() => http.DELETE('/api/v1/tasks/{id}', { params: { path: { id } }, parseAs: 'text' }),
			{ schema: zDeleteTaskResponse, hasData: false }
		);
	}

	async getStats(): Promise<ApiResult<SuccessData<paths['/api/v1/stats']['get']>>> {
		return toResult(() => http.GET('/api/v1/stats', { parseAs: 'text' }), {
			schema: zGetStatsResponse
		});
	}

	// Health: not validated, the contract pins its constants (version, messages) which would turn
	// a backend upgrade into an invalid response.
	async health(): Promise<ApiResult<SuccessData<paths['/health']['get']>>> {
		return toResult(() => http.GET('/health', { parseAs: 'text' }));
	}
}

export const api = new ApiClient();
