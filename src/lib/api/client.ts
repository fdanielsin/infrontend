// src/lib/api/client.ts
import { PUBLIC_API_URL } from '$env/static/public';

export interface ApiResponse<T> {
	success: boolean;
	message?: string;
	data?: T;
	error?: string;
}

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

const API_BASE = PUBLIC_API_URL || 'http://localhost:8080';

export class ApiClient {
	private async request<T>(
		endpoint: string,
		options: RequestInit = {}
	): Promise<ApiResponse<T>> {
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
				throw new Error(`HTTP ${response.status}`);
			}

			return response.json();
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	// Users
	async getUsers(): Promise<ApiResponse<User[]>> {
		return this.request<User[]>('/api/v1/users');
	}

	async getUser(id: number): Promise<ApiResponse<User>> {
		return this.request<User>(`/api/v1/users/${id}`);
	}

	async createUser(user: Omit<User, 'id'>): Promise<ApiResponse<User>> {
		return this.request<User>('/api/v1/users', {
			method: 'POST',
			body: JSON.stringify(user)
		});
	}

	// Tasks
	async getUserTasks(userId: number): Promise<ApiResponse<Task[]>> {
		return this.request<Task[]>(`/api/v1/users/${userId}/tasks`);
	}

	async createTask(task: Omit<Task, 'id'>): Promise<ApiResponse<Task>> {
		return this.request<Task>('/api/v1/tasks', {
			method: 'POST',
			body: JSON.stringify(task)
		});
	}

	async updateTask(id: number, task: Partial<Task>): Promise<ApiResponse<Task>> {
		return this.request<Task>(`/api/v1/tasks/${id}`, {
			method: 'PUT',
			body: JSON.stringify(task)
		});
	}

	async deleteTask(id: number): Promise<ApiResponse<void>> {
		return this.request<void>(`/api/v1/tasks/${id}`, {
			method: 'DELETE'
		});
	}

	// Health
	async health(): Promise<ApiResponse<Record<string, unknown>>> {
		return this.request('/health');
	}
}

export const api = new ApiClient();
