import { describe, it, expect } from 'vitest';
import { api } from '$lib/api';

describe('ApiClient', () => {
	it('exposes the API facade (happy path)', () => {
		// GIVEN: The public API module.

		// WHEN: Access the exported facade.

		// THEN: The facade is available.
		expect(api).toBeDefined();
	});

	it('exposes user operations through the API facade (happy path)', () => {
		// GIVEN: The public API facade.

		// WHEN: Access user operations.

		// THEN: The expected operations are available.
		expect(api.getUsers).toBeDefined();
		expect(api.createUser).toBeDefined();
	});
});
