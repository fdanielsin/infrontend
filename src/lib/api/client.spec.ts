import { describe, it, expect, vi } from 'vitest';
import * as apiClient from '$lib/api/client';

describe('API Client', () => {
	it('handles a 204 response without attempting to parse JSON', async () => {
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 204 }));

		const response = await apiClient.api.deleteTask(42);

		expect(response).toEqual({ success: true });
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('/api/v1/tasks/42'),
			expect.objectContaining({ method: 'DELETE' })
		);
		fetchMock.mockRestore();
	});

	it('uses the configured API client for statistics', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ success: true, data: { users: 2, tasks: 3 } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		await expect(apiClient.api.getStats()).resolves.toEqual({
			success: true,
			data: { users: 2, tasks: 3 }
		});
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('/api/v1/stats'),
			expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
		);
		fetchMock.mockRestore();
	});

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
