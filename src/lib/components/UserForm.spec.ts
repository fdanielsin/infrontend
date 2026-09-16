import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import UserForm from '$lib/components/UserForm.svelte';
import { users, error, loading } from '$lib/stores/user';

describe('UserForm Component', () => {
	beforeEach(() => {
		users.set([]);
		error.set(null);
		loading.set(false);
	});

	it('renders the form', () => {
		const { getByText } = render(UserForm);
		expect(getByText('Create User')).toBeDefined();
	});

	it('displays empty user list initially', () => {
		const { getByText } = render(UserForm);
		expect(getByText('No users yet')).toBeDefined();
	});

	it('displays users count', () => {
		users.set([
			{ id: 1, name: 'John', email: 'john@example.com' },
			{ id: 2, name: 'Jane', email: 'jane@example.com' }
		]);
		const { getByText } = render(UserForm);
		expect(getByText('Users (2)')).toBeDefined();
	});

	it('displays error message when error store is set', () => {
		error.set('Test error message');
		const { getByText } = render(UserForm);
		expect(getByText('Test error message')).toBeDefined();
	});
});
