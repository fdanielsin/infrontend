import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { userStore, taskStore } from '../stores';

describe('Stores', () => {
	beforeEach(() => {
		userStore.set([]);
		taskStore.set([]);
	});

	it('should initialize with empty arrays', () => {
		expect(get(userStore)).toEqual([]);
		expect(get(taskStore)).toEqual([]);
	});
});
