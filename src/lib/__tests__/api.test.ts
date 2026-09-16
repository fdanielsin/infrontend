import { describe, it, expect } from 'vitest';
import { api } from '../api';

describe('ApiClient', () => {
	it('should create instance with base URL', () => {
		expect(api).toBeDefined();
	});

	it('should have correct methods', () => {
		expect(api.getUsers).toBeDefined();
		expect(api.createUser).toBeDefined();
	});
});
