import '$lib/validation/zod-config';
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
	zHealthCheckResponse,
	zListUsersResponse,
	zReadinessCheckResponse,
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
	kind?: 'invalid_response' | 'timeout' | 'unknown';
	status?: number;
	// Server-side reference (`X-Request-Id`) of a 5xx answer, for a support request. The client
	// sends no id of its own, so only the server's own is read, and only if it fits the contract.
	requestId?: string;
	// Stable codes are listed by `ErrorCode`, but the contract lets the server add new ones.
	code?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

// No default backend: a missing URL must fail loudly, not reach a service that belongs to someone
// else. The build already refuses an unset variable; this catches an empty one.
if (!PUBLIC_API_URL)
	throw new Error('PUBLIC_API_URL is empty: the API client has no backend to call.');
const API_BASE = PUBLIC_API_URL;
const INVALID_RESPONSE = 'Invalid server response';

// Longest wait for an answer. The backend cuts its own readiness probe at 2 s, so this leaves room
// for a slow database without leaving the screen waiting indefinitely.
export const API_TIMEOUT_MS = 10_000;

// The readiness probe is cut at 2 s by the backend: waiting longer would only delay the banner.
export const READY_TIMEOUT_MS = 5_000;

// What the contract allows as a request id: 1 to 64 characters among these.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

// The body is read as text and parsed here: a malformed JSON body must become an
// ApiFailure carrying the HTTP status, not an exception.
function createHttp(timeoutMs: number) {
	return createClient<paths>({
		baseUrl: API_BASE,
		fetch: (request) => {
			request.headers.set('Accept-Language', getLocale());
			const timeout = AbortSignal.timeout(timeoutMs);
			// Older browsers lack AbortSignal.any: they keep the timeout only.
			const signal =
				typeof AbortSignal.any === 'function'
					? AbortSignal.any([request.signal, timeout])
					: timeout;
			return globalThis.fetch(new Request(request, { signal }));
		}
	});
}

interface Outcome {
	data?: string;
	error?: unknown;
	response: Response;
}

function parseJson(text: string | undefined): unknown {
	try {
		return JSON.parse(text ?? '');
	} catch {
		return undefined;
	}
}

function invalidResponse(status: number): ApiFailure {
	return { success: false, error: INVALID_RESPONSE, status, kind: 'invalid_response' };
}

function readRequestId(response: Response): string | undefined {
	if (response.status < 500) return undefined;
	const id = response.headers.get('X-Request-Id');
	return id !== null && REQUEST_ID_PATTERN.test(id) ? id : undefined;
}

function toFailure(error: unknown, response: Response): ApiFailure {
	const status = response.status;
	const requestId = readRequestId(response);
	// openapi-fetch has already parsed a JSON error body; any other text yields no field below.
	const body = error as { error?: unknown; error_code?: unknown } | null | undefined;
	const message = typeof body?.error === 'string' ? body.error : '';
	return {
		success: false,
		error: message || `HTTP ${status}`,
		status,
		...(requestId && { requestId }),
		...(typeof body?.error_code === 'string' && { code: body.error_code })
	};
}

// `schema` is the contract's schema of the success response: a body that does not match it (not
// a success envelope, no data, not JSON) is an invalid response, whatever its status. `hasData` is
// false for an endpoint whose 204, without content, is a success. Failure bodies are not checked: the contract
// lets the server add codes.
async function toResult<T>(
	send: () => Promise<Outcome>,
	{ schema, hasData = true }: { schema: ZodType; hasData?: boolean }
): Promise<ApiResult<T>> {
	try {
		const { data, error, response } = await send();
		if (!response.ok) return toFailure(error, response);
		if (response.status === 204) {
			return hasData ? invalidResponse(204) : ({ success: true } as ApiSuccess<T>);
		}
		const checked = schema.safeParse(parseJson(data));
		return checked.success ? (checked.data as ApiSuccess<T>) : invalidResponse(response.status);
	} catch (error) {
		return failureFromThrown(error);
	}
}

// What a rejected fetch gives. The checks are structural, not `instanceof Error`: a DOMException
// from another realm (a test environment, an iframe) is not an Error but carries a name and message.
function failureFromThrown(error: unknown): ApiFailure {
	const thrown =
		typeof error === 'object' && error !== null
			? (error as { name?: unknown; message?: unknown })
			: undefined;
	if (thrown?.name === 'TimeoutError') {
		return { success: false, error: 'Request timed out', kind: 'timeout' };
	}
	if (typeof thrown?.message === 'string') return { success: false, error: thrown.message };
	return { success: false, error: 'Unknown error', kind: 'unknown' };
}

export class ApiClient {
	readonly #http: ReturnType<typeof createHttp>;

	constructor({ timeoutMs = API_TIMEOUT_MS }: { timeoutMs?: number } = {}) {
		this.#http = createHttp(timeoutMs);
	}

	// Users
	async getUsers(): Promise<ApiResult<SuccessData<paths['/api/v1/users']['get']>>> {
		return toResult(() => this.#http.GET('/api/v1/users', { parseAs: 'text' }), {
			schema: zListUsersResponse
		});
	}

	async getUser(id: number): Promise<ApiResult<SuccessData<paths['/api/v1/users/{id}']['get']>>> {
		return toResult(
			() => this.#http.GET('/api/v1/users/{id}', { params: { path: { id } }, parseAs: 'text' }),
			{ schema: zGetUserResponse }
		);
	}

	async createUser(
		user: CreateUserRequest
	): Promise<ApiResult<SuccessData<paths['/api/v1/users']['post']>>> {
		return toResult(() => this.#http.POST('/api/v1/users', { body: user, parseAs: 'text' }), {
			schema: zCreateUserResponse
		});
	}

	// Tasks
	async getUserTasks(
		userId: number
	): Promise<ApiResult<SuccessData<paths['/api/v1/users/{id}/tasks']['get']>>> {
		return toResult(
			() =>
				this.#http.GET('/api/v1/users/{id}/tasks', {
					params: { path: { id: userId } },
					parseAs: 'text'
				}),
			{ schema: zListUserTasksResponse }
		);
	}

	async createTask(
		task: CreateTaskRequest
	): Promise<ApiResult<SuccessData<paths['/api/v1/tasks']['post']>>> {
		return toResult(() => this.#http.POST('/api/v1/tasks', { body: task, parseAs: 'text' }), {
			schema: zCreateTaskResponse
		});
	}

	async updateTask(
		id: number,
		task: UpdateTaskRequest
	): Promise<ApiResult<SuccessData<paths['/api/v1/tasks/{id}']['put']>>> {
		return toResult(
			() =>
				this.#http.PUT('/api/v1/tasks/{id}', {
					params: { path: { id } },
					body: task,
					parseAs: 'text'
				}),
			{ schema: zUpdateTaskResponse }
		);
	}

	// `keepalive` lets the request outlive the page, for a deletion sent as the page is left. It adds
	// no header: a custom one would need its own CORS preflight authorization.
	async deleteTask(
		id: number,
		{ keepalive = false }: { keepalive?: boolean } = {}
	): Promise<ApiResult<SuccessData<paths['/api/v1/tasks/{id}']['delete']>>> {
		return toResult(
			() =>
				this.#http.DELETE('/api/v1/tasks/{id}', {
					params: { path: { id } },
					parseAs: 'text',
					keepalive
				}),
			{ schema: zDeleteTaskResponse, hasData: false }
		);
	}

	async getStats(): Promise<ApiResult<SuccessData<paths['/api/v1/stats']['get']>>> {
		return toResult(() => this.#http.GET('/api/v1/stats', { parseAs: 'text' }), {
			schema: zGetStatsResponse
		});
	}

	// Health
	// `timeoutMs` bounds this call alone; the other calls keep the client's timeout.
	async ready({ timeoutMs = READY_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<
		ApiResult<SuccessData<paths['/ready']['get']>>
	> {
		return toResult(() => createHttp(timeoutMs).GET('/ready', { parseAs: 'text' }), {
			schema: zReadinessCheckResponse
		});
	}

	async health(): Promise<ApiResult<SuccessData<paths['/health']['get']>>> {
		return toResult(() => this.#http.GET('/health', { parseAs: 'text' }), {
			schema: zHealthCheckResponse
		});
	}
}

export const api = new ApiClient();
