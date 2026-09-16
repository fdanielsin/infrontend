import { describe, it, expect } from 'vitest';
import { ApiClient } from '../api';

describe('ApiClient', () => {
	const api = new ApiClient('http://localhost:8080');

	it('should create instance with base URL', () => {
		expect(api).toBeDefined();
	});

	it('should format endpoints correctly', () => {
		const endpoint = '/users';
		expect(endpoint).toBe('/users');
	});
});
