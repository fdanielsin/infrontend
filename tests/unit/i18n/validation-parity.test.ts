import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { overwriteGetLocale, type Locale } from '$lib/paraglide/runtime';
import { TaskSchema, UserSchema, validationMessage } from '$lib/validation/schemas';

// The server answers VALIDATION_FAILED with a generic translated message (decision I2):
// every input it refuses must be refused before sending, with a precise translated message.
// Rules from the lot D contract (CreateUserRequest, CreateTaskRequest, UpdateTaskRequest)
// and the domain (user.NewUser, task.NewTask).

const LOCALES: Locale[] = ['en', 'fr', 'de', 'es'];

function translation(locale: Locale, key: string) {
	const messages = JSON.parse(
		readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
	) as Record<string, string>;
	return messages[key];
}

function issueKey(schema: typeof UserSchema | typeof TaskSchema, value: object, field: string) {
	const result = schema.safeParse(value);
	return result.error?.issues.find((issue) => issue.path[0] === field)?.message;
}

const validUser = { name: 'Ada', email: 'ada@example.com' };
const validTask = { title: 'Review', description: '', user_id: 1 };

describe('client validation covers every server validation rule', () => {
	afterEach(() => {
		overwriteGetLocale(() => 'en');
	});

	it.each([
		['empty', ''],
		['only a space', ' '],
		['without @', 'ada.example.com'],
		['with two @', 'a@b@example.com'],
		['without local part', '@example.com'],
		['with a one-label domain', 'ada@localhost'],
		['with an empty first label', 'ada@.com'],
		['with an empty last label', 'ada@example.'],
		['with an empty middle label', 'ada@example..com'],
		['with an inner space', 'ada lovelace@example.com'],
		['with a control character', 'ada@exa\u0007mple.com']
	])('refuses an email %s, as the server does (sad path)', (_case, email) => {
		// GIVEN / WHEN: An email the server answers with VALIDATION_FAILED.
		// THEN: The client refuses it on the email field.
		expect(issueKey(UserSchema, { ...validUser, email }, 'email')).toBe('validation_email_invalid');
	});

	it('refuses an empty name, as the server does (sad path)', () => {
		// GIVEN / WHEN / THEN: The server refuses an empty name; the client too.
		expect(issueKey(UserSchema, { ...validUser, name: '' }, 'name')).toBe('validation_name_min');
	});

	it('refuses an empty title at creation and at edit, as the server does (sad path)', () => {
		// GIVEN / WHEN / THEN: Both forms validate the title with TaskSchema.
		expect(issueKey(TaskSchema, { ...validTask, title: '' }, 'title')).toBe(
			'validation_title_required'
		);
	});

	it('refuses user_id 0, below the contract minimum of 1 (boundary)', () => {
		// GIVEN / WHEN / THEN: The contract declares minimum: 1.
		expect(issueKey(TaskSchema, { ...validTask, user_id: 0 }, 'user_id')).toBe(
			'validation_user_id_positive'
		);
		expect(TaskSchema.safeParse({ ...validTask, user_id: 1 }).success).toBe(true);
	});

	it('accepts the minimal valid values the server accepts (boundary)', () => {
		// GIVEN / WHEN / THEN: A 1-character title and a two-label email.
		expect(TaskSchema.safeParse({ ...validTask, title: 'R' }).success).toBe(true);
		expect(UserSchema.safeParse({ ...validUser, email: 'a@b.co' }).success).toBe(true);
	});

	it.each(
		LOCALES.flatMap((locale) =>
			[
				'validation_name_min',
				'validation_email_invalid',
				'validation_title_required',
				'validation_user_id_positive',
				'validation_name_max',
				'validation_email_max',
				'validation_title_max',
				'validation_description_max'
			].map((key) => [locale, key] as const)
		)
	)('shows the %s message for %s (happy path)', (locale, key) => {
		// GIVEN: The interface language.
		overwriteGetLocale(() => locale);

		// WHEN / THEN: The key of the issue is shown translated.
		expect(validationMessage(key)).toBe(translation(locale, key));
	});

	it('shows an unknown key as is rather than failing (exception)', () => {
		// GIVEN / WHEN / THEN: A key no message knows.
		expect(validationMessage('validation_unknown')).toBe('validation_unknown');
		expect(validationMessage('toString')).toBe('toString');
	});
});
