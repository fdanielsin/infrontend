import { describe, it, expect, vi } from 'vitest';
import * as apiClient from '$lib/api/client';

describe('API Client', () => {
	it('should initialize with correct base URL', () => {
		expect(apiClient.api).toBeDefined();
	});

	it('should construct correct User interface', () => {
		const user: apiClient.User = {
			id: 1,
			name: 'Test User',
			email: 'test@example.com'
		};
		expect(user.name).toBe('Test User');
		expect(user.email).toBe('test@example.com');
	});

	it('should construct correct Task interface', () => {
		const task: apiClient.Task = {
			id: 1,
			title: 'Test Task',
			description: 'Test Description',
			user_id: 1,
			completed: false
		};
		expect(task.title).toBe('Test Task');
		expect(task.completed).toBe(false);
	});

	it('should construct correct ApiResponse interface', () => {
		const response: apiClient.ApiResponse<string> = {
			success: true,
			message: 'Test message',
			data: 'Test data'
		};
		expect(response.success).toBe(true);
		expect(response.data).toBe('Test data');
	});
});
