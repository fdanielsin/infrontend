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
		const errors = zodIssuesToFieldErrors(invalid({ name: '   ', email: 'nope' }), [
			'name',
			'email'
		]);

		// THEN: One message per field.
		expect(shown(errors)).toEqual({
			name: 'Name is required',
			email: 'Invalid email address'
		});
	});

	it('ignores the issues of fields the form does not show (sad path)', () => {
		// GIVEN / WHEN: Only the name is a field of the form.
		const errors = zodIssuesToFieldErrors(invalid({ name: '   ', email: 'nope' }), ['name']);

		// THEN: The email issue is left out.
		expect(shown(errors)).toEqual({ name: 'Name is required' });
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

const EMOJI = '\u{1F600}';

function keysOf(schema: typeof UserSchema | typeof TaskSchema, value: object, field: string) {
	const result = schema.safeParse(value);
	return (result.error?.issues ?? [])
		.filter((issue) => issue.path[0] === field)
		.map((issue) => issue.message);
}

describe('text length limits', () => {
	const validUser = { name: 'Ada', email: 'ada@example.com' };
	// A well-formed address of the given length (198 and more): the local part and the labels
	// of the contract at their longest, then a third label that takes the rest.
	const emailOfLength = (length: number) =>
		`${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(length - 197)}.com`;

	it.each([
		['name', UserSchema, validUser, 100, 'validation_name_max'],
		['email', UserSchema, validUser, 254, 'validation_email_max'],
		['title', TaskSchema, validTask, 200, 'validation_title_max'],
		['description', TaskSchema, validTask, 2000, 'validation_description_max']
	] as const)(
		'accepts %s at its limit and refuses one more (boundary)',
		(field, schema, base, limit, key) => {
			// GIVEN: A value of exactly the limit, and one with a character more.
			const build = (length: number) =>
				field === 'email' ? emailOfLength(length) : 'a'.repeat(length);

			// WHEN / THEN: The limit is accepted, the next length is refused with the "too long" key only.
			expect(schema.safeParse({ ...base, [field]: build(limit) }).success).toBe(true);
			expect(keysOf(schema, { ...base, [field]: build(limit + 1) }, field)).toEqual([key]);
		}
	);

	it.each([
		['name', UserSchema, validUser, 100, 'validation_name_max'],
		['title', TaskSchema, validTask, 200, 'validation_title_max'],
		['description', TaskSchema, validTask, 2000, 'validation_description_max']
	] as const)(
		'counts an emoji as one character on the %s limit (boundary)',
		(field, schema, base, limit, key) => {
			// GIVEN: A value of limit code points whose UTF-16 length is limit + 1.
			const atLimit = 'a'.repeat(limit - 1) + EMOJI;
			const overLimit = atLimit + 'a';

			// WHEN / THEN: The server counts it as accepted; so does the client.
			expect(atLimit.length).toBe(limit + 1);
			expect(schema.safeParse({ ...base, [field]: atLimit }).success).toBe(true);
			expect(keysOf(schema, { ...base, [field]: overLimit }, field)).toEqual([key]);
		}
	);

	it('measures the limit before trimming, as the server does (limit)', () => {
		// GIVEN: 100 characters framed by spaces: 102 raw, 100 once trimmed.
		const framed = ` ${'a'.repeat(100)} `;

		// WHEN / THEN: The raw length decides.
		expect(keysOf(UserSchema, { ...validUser, name: framed }, 'name')).toEqual([
			'validation_name_max'
		]);
	});

	it('reports only "too long" for an email that is also malformed (limit)', () => {
		// GIVEN: 255 characters without @.
		// WHEN / THEN: A single issue, so the format message does not hide it.
		expect(keysOf(UserSchema, { ...validUser, email: 'a'.repeat(255) }, 'email')).toEqual([
			'validation_email_max'
		]);
	});

	it('refuses a very long value without failing (limit)', () => {
		// GIVEN / WHEN / THEN: 10 000 characters, with special characters.
		expect(
			keysOf(TaskSchema, { ...validTask, description: '\n<é>'.repeat(2500) }, 'description')
		).toEqual(['validation_description_max']);
	});
});

describe('trimmed values', () => {
	it('trims the text fields of a user (happy path)', () => {
		// GIVEN / WHEN: Values framed by spaces, tabs and new lines.
		const result = UserSchema.safeParse({ name: '  Ada \t', email: '\n ada@example.com ' });

		// THEN: The trimmed values are what the form sends.
		expect(result.success && result.data).toEqual({ name: 'Ada', email: 'ada@example.com' });
	});

	it('trims the title and the description of a task (happy path)', () => {
		// GIVEN / WHEN: Values framed by spaces.
		const result = TaskSchema.safeParse({ ...validTask, title: '  Buy ', description: ' milk\n' });

		// THEN: The trimmed values are kept.
		expect(result.success && [result.data.title, result.data.description]).toEqual(['Buy', 'milk']);
	});

	it('turns a description of spaces into an empty one (boundary)', () => {
		// GIVEN / WHEN: A description made of spaces.
		const result = TaskSchema.safeParse({ ...validTask, description: '   ' });

		// THEN: Accepted and empty, as the server stores it.
		expect(result.success && result.data.description).toBe('');
	});

	it('refuses a title of spaces (sad path)', () => {
		expect(keysOf(TaskSchema, { ...validTask, title: ' \t ' }, 'title')).toEqual([
			'validation_title_required'
		]);
	});

	it.each([
		['one character', 'A', true],
		['one character framed by spaces', '  A  ', true],
		['two characters', 'Al', true],
		['an empty name', '', false],
		['a tab and a new line', '\t\n', false]
	])('applies the contract minimum of 1 to %s (boundary)', (_case, name, accepted) => {
		// GIVEN / WHEN: A name at the lower boundary.
		const result = UserSchema.safeParse({ name, email: 'ada@example.com' });

		// THEN: Accepted from 1 character once trimmed; refused with the "required" key otherwise.
		expect(result.success).toBe(accepted);
		if (!accepted)
			expect(keysOf(UserSchema, { name, email: 'ada@example.com' }, 'name')).toEqual([
				'validation_name_required'
			]);
	});

	it('sends the trimmed one-character name (happy path)', () => {
		const result = UserSchema.safeParse({ name: '  A ', email: 'ada@example.com' });
		expect(result.success && result.data.name).toBe('A');
	});

	it('refuses a name of spaces (sad path)', () => {
		expect(keysOf(UserSchema, { name: '    ', email: 'ada@example.com' }, 'name')).toEqual([
			'validation_name_required'
		]);
	});

	it('refuses a missing or null value without throwing (exception)', () => {
		expect(UserSchema.safeParse({ name: null, email: undefined }).success).toBe(false);
		expect(TaskSchema.safeParse({ title: 42, description: null, user_id: 1 }).success).toBe(false);
	});
});
