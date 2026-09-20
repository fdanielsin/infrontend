import { describe, it, expect, vi } from 'vitest';
import * as apiClient from '$lib/api/client';

describe('API Client', () => {
	it('returns success when deleteTask receives a 204 response (happy path)', async () => {
		// GIVEN: The API returns no content for the deletion.
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 204 }));

		// WHEN: Delete the task.
		const response = await apiClient.api.deleteTask(42);

		// THEN: The client returns success without parsing a response body.
		expect(response).toEqual({ success: true });
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('/api/v1/tasks/42'),
			expect.objectContaining({ method: 'DELETE' })
		);
		fetchMock.mockRestore();
	});

	it('returns statistics when getStats receives a valid response (happy path)', async () => {
		// GIVEN: The API returns valid statistics.
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ success: true, data: { users: 2, tasks: 3 } }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		// WHEN: Request the statistics.
		await expect(apiClient.api.getStats()).resolves.toEqual({
			success: true,
			data: { users: 2, tasks: 3 }
		});

		// THEN: The configured statistics endpoint is called with JSON headers.
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('/api/v1/stats'),
			expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
		);
		fetchMock.mockRestore();
	});

	it('returns an explicit error when the API rejects a request (sad path)', async () => {
		// GIVEN: The API responds with an HTTP error.
		const fetchMock = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response(null, { status: 500 }));

		// WHEN: Request the users.
		const response = await apiClient.api.getUsers();

		// THEN: The client preserves the failure instead of returning success.
		expect(response).toEqual({ success: false, error: 'HTTP 500' });
		fetchMock.mockRestore();
	});

	it('exposes the configured API client (happy path)', () => {
		// GIVEN: The shared API client module.

		// WHEN: Access the exported client.
		const client = apiClient.api;

		// THEN: The client is available.
		expect(client).toBeDefined();
	});

	it('accepts a valid User shape (happy path)', () => {
		// GIVEN: A valid user payload.
		const user: apiClient.User = {
			id: 1,
			name: 'Test User',
			email: 'test@example.com'
		};

		// WHEN: Read the user fields.

		// THEN: The payload preserves its user data.
		expect(user.name).toBe('Test User');
		expect(user.email).toBe('test@example.com');
	});

	it('accepts a valid Task shape (happy path)', () => {
		// GIVEN: A valid task payload.
		const task: apiClient.Task = {
			id: 1,
			title: 'Test Task',
			description: 'Test Description',
			user_id: 1,
			completed: false
		};

		// WHEN: Read the task fields.

		// THEN: The payload preserves its task data.
		expect(task.title).toBe('Test Task');
		expect(task.completed).toBe(false);
	});

	it('accepts a valid ApiResponse shape (happy path)', () => {
		// GIVEN: A valid API response payload.
		const response: apiClient.ApiResponse<string> = {
			success: true,
			message: 'Test message',
			data: 'Test data'
		};

		// WHEN: Read the response fields.

		// THEN: The payload preserves its response data.
		expect(response.success).toBe(true);
		expect(response.data).toBe('Test data');
	});
});
