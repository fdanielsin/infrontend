import { describe, expect, it } from 'vitest';
import * as facade from '$lib/api';
import { ApiClient, api } from '$lib/api/client';

describe('API facade', () => {
	it('re-exports the shared client instance, not a copy (happy path)', () => {
		// GIVEN / WHEN: The public facade and the client module are imported.

		// THEN: Both expose the same singleton and class, so the stores and the
		// pages talk to the same client.
		expect(facade.api).toBe(api);
		expect(facade.ApiClient).toBe(ApiClient);
		expect(facade.api).toBeInstanceOf(ApiClient);
	});
});
