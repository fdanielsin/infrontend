import { PUBLIC_API_URL } from '$env/static/public';

export type ApiSuccess<T> = { success: true; message?: string } & ([T] extends [void]
	? { data?: undefined }
	: { data: T });

export interface ApiFailure {
	success: false;
	error: string;
	status?: number;
	code?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export interface User {
	id: number;
	name: string;
	email: string;
}

export interface Task {
	id: number;
	title: string;
	description: string;
	user_id: number;
	completed: boolean;
}

export interface UpdatedTask {
	id: number;
	title: string;
	description: string;
	completed: boolean;
}

export interface UpdateTaskRequest {
	title?: string;
	description?: string;
	completed?: boolean;
}

export interface Stats {
	users: number;
	tasks: number;
}

const API_BASE = PUBLIC_API_URL || 'http://localhost:8080';

const INVALID_RESPONSE = 'Invalid server response';

interface SuccessBody {
	success?: unknown;
	data?: unknown;
}

interface ErrorBody {
	error?: unknown;
	error_code?: unknown;
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

async function toFailure(response: Response): Promise<ApiFailure> {
	const body = (await readJson(response)) as ErrorBody | null | undefined;
	const message = typeof body?.error === 'string' ? body.error : '';
	return {
		success: false,
		error: message || `HTTP ${response.status}`,
		status: response.status,
		...(typeof body?.error_code === 'string' && { code: body.error_code })
	};
}

function invalidResponse(status: number): ApiFailure {
	return { success: false, error: INVALID_RESPONSE, status };
}

export class ApiClient {
	// `hasData` is false for endpoints whose 200 envelope carries only a message.
	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
		{ hasData = true }: { hasData?: boolean } = {}
	): Promise<ApiResult<T>> {
		const url = `${API_BASE}${endpoint}`;
		const headers = {
			'Content-Type': 'application/json',
			...options.headers
		};

		try {
			const response = await fetch(url, {
				...options,
				headers
			});

			if (!response.ok) {
				return await toFailure(response);
			}

			if (response.status === 204) {
				return hasData ? invalidResponse(response.status) : ({ success: true } as ApiSuccess<T>);
			}

			const body = (await readJson(response)) as SuccessBody | null | undefined;
			if (body?.success !== true || (hasData && body.data === undefined)) {
				return invalidResponse(response.status);
			}
			return body as ApiSuccess<T>;
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// Users
	async getUsers(): Promise<ApiResult<User[]>> {
		return this.request<User[]>('/api/v1/users');
	}

	async getUser(id: number): Promise<ApiResult<User>> {
		return this.request<User>(`/api/v1/users/${id}`);
	}

	async createUser(user: Omit<User, 'id'>): Promise<ApiResult<User>> {
		return this.request<User>('/api/v1/users', {
			method: 'POST',
			body: JSON.stringify(user)
		});
	}

	// Tasks
	async getUserTasks(userId: number): Promise<ApiResult<Task[]>> {
		return this.request<Task[]>(`/api/v1/users/${userId}/tasks`);
	}

	async createTask(task: Omit<Task, 'id'>): Promise<ApiResult<Task>> {
		return this.request<Task>('/api/v1/tasks', {
			method: 'POST',
			body: JSON.stringify(task)
		});
	}

	async updateTask(id: number, task: UpdateTaskRequest): Promise<ApiResult<UpdatedTask>> {
		return this.request<UpdatedTask>(`/api/v1/tasks/${id}`, {
			method: 'PUT',
			body: JSON.stringify(task)
		});
	}

	async deleteTask(id: number): Promise<ApiResult<void>> {
		return this.request<void>(
			`/api/v1/tasks/${id}`,
			{
				method: 'DELETE'
			},
			{ hasData: false }
		);
	}

	async getStats(): Promise<ApiResult<Stats>> {
		return this.request<Stats>('/api/v1/stats');
	}

	// Health
	async health(): Promise<ApiResult<Record<string, unknown>>> {
		return this.request('/health');
	}
}

export const api = new ApiClient();
