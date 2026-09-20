import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { users, userTasks } from '$lib/stores';

describe('Stores', () => {
	beforeEach(() => {
		// GIVEN: A clean store state before each scenario.
		users.set([]);
		userTasks.set([]);
	});

	it('initializes user collections as empty (happy path)', () => {
		// WHEN: Read the initial store values.

		// THEN: Both user collections are empty.
		expect(get(users)).toEqual([]);
		expect(get(userTasks)).toEqual([]);
	});
});
