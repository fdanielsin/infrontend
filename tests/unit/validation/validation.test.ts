import { describe, expect, it } from 'vitest';
import { TaskSchema, UserSchema, validationMessage } from '$lib/validation/schemas';
import { zodIssuesToFieldErrors } from '$lib/validation/field-errors';

const validTask = { title: 'Buy milk', description: 'Semi-skimmed', user_id: 1 };

function shown(errors: Record<string, string>) {
	return Object.fromEntries(
		Object.entries(errors).map(([field, key]) => [field, validationMessage(key)])
	);
}

describe('TaskSchema', () => {
	it('accepts an empty description, as the contract does (boundary)', () => {
		// GIVEN / WHEN: A task without description text.
		const result = TaskSchema.safeParse({ ...validTask, description: '' });

		// THEN: It is valid and completed defaults to false.
		expect(result.success && result.data).toEqual({
			...validTask,
			description: '',
			completed: false
		});
	});

	it('refuses an empty title (sad path)', () => {
		// GIVEN / WHEN: A task without title.
		const result = TaskSchema.safeParse({ ...validTask, title: '' });

		// THEN: Only the title is reported.
		expect(result.success).toBe(false);
		expect(
			result.error?.issues.map((issue) => [issue.path[0], validationMessage(issue.message)])
		).toEqual([['title', 'Title is required']]);
	});
});

describe('schema messages', () => {
	it('reports a non-positive user_id (sad path)', () => {
		// GIVEN / WHEN: A task for user 0.
		const result = TaskSchema.safeParse({ ...validTask, user_id: 0 });

		// THEN: The user_id message is given.
		expect(result.error?.issues.map((issue) => validationMessage(issue.message))).toEqual([
			'User ID must be positive'
		]);
	});
});

describe('zodIssuesToFieldErrors', () => {
	const invalid = (value: unknown) => {
		const result = UserSchema.safeParse(value);
		if (result.success) throw new Error('expected an invalid value');
		return result.error;
	};

	it('maps each invalid field to its message (happy path)', () => {
		// GIVEN / WHEN: A name and an email that are both invalid.
		const errors = zodIssuesToFieldErrors(invalid({ name: 'A', email: 'nope' }), ['name', 'email']);

		// THEN: One message per field.
		expect(shown(errors)).toEqual({
			name: 'Name must be at least 2 characters',
			email: 'Invalid email address'
		});
	});

	it('ignores the issues of fields the form does not show (sad path)', () => {
		// GIVEN / WHEN: Only the name is a field of the form.
		const errors = zodIssuesToFieldErrors(invalid({ name: 'A', email: 'nope' }), ['name']);

		// THEN: The email issue is left out.
		expect(shown(errors)).toEqual({ name: 'Name must be at least 2 characters' });
	});

	it('keeps the last message when a field has several issues (limit)', () => {
		// GIVEN: A field with two issues, in this order.
		const error = invalid({ name: 'Ada', email: 'nope' });
		error.issues.push({ ...error.issues[0]!, message: 'Second message' });

		// WHEN / THEN: The last one wins.
		expect(zodIssuesToFieldErrors(error, ['email'])).toEqual({ email: 'Second message' });
	});

	it('returns an empty object when no requested field is invalid (boundary)', () => {
		// GIVEN / WHEN: The only issue is on a field that is not requested.
		const errors = zodIssuesToFieldErrors(invalid({ name: 'Ada', email: 'nope' }), ['name']);

		// THEN: No error is reported.
		expect(errors).toEqual({});
	});
});
