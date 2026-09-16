import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { users, userTasks } from '../stores';

describe('Stores', () => {
	beforeEach(() => {
		users.set([]);
		userTasks.set([]);
	});

	it('should initialize with empty arrays', () => {
		expect(get(users)).toEqual([]);
		expect(get(userTasks)).toEqual([]);
	});
});
