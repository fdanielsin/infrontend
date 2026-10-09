import { beforeEach, describe, expect, it } from 'vitest';
import { createFieldValidation } from '$lib/validation/field-validation.svelte';

// The helper only holds the states; the rules come from `check` (the zod schemas in the forms).
type Field = 'title' | 'note';
const values: Record<Field, string> = { title: '', note: '' };
const check = () => ({ ...(values.title.trim() ? {} : { title: 'title_required' }) });

function setup() {
	return createFieldValidation<Field>({
		fields: ['title', 'note'],
		optional: ['note'],
		values: () => values,
		check
	});
}

describe('field validation states', () => {
	let fields: ReturnType<typeof setup>;
	beforeEach(() => {
		values.title = '';
		values.note = '';
		fields = setup();
	});

	it('stays neutral while typing the first time (happy path)', () => {
		values.title = 'Pl';
		fields.input('title');
		expect(fields.status('title')).toBe('neutral');
		expect(fields.error('title')).toBeUndefined();
	});

	it('stays neutral when an untouched field is only tabbed through (boundary)', () => {
		fields.blur('title');
		expect(fields.status('title')).toBe('neutral');
	});

	it('turns invalid at blur once the value was modified (error)', () => {
		values.title = ' ';
		fields.input('title');
		fields.blur('title');
		expect(fields.status('title')).toBe('invalid');
		expect(fields.error('title')).toBe('title_required');
	});

	it('turns valid at blur, then follows each keystroke once it was invalid (happy path)', () => {
		values.title = ' ';
		fields.input('title');
		fields.blur('title');

		values.title = 'Plan';
		fields.input('title');
		expect(fields.status('title')).toBe('valid');

		values.title = '';
		fields.input('title');
		expect(fields.status('title')).toBe('invalid');
	});

	it('does not revalidate a valid field on keystrokes (limit)', () => {
		values.title = 'Plan';
		fields.input('title');
		fields.blur('title');
		values.title = '';
		fields.input('title');
		expect(fields.status('title')).toBe('valid');
	});

	it('gives an empty optional field no success (limit)', () => {
		values.note = 'x';
		fields.input('note');
		values.note = '';
		fields.input('note');
		fields.blur('note');
		expect(fields.status('note')).toBe('neutral');
	});

	it('marks the invalid fields at submit, even untouched, and returns the errors (error)', () => {
		const errors = fields.submit();
		expect(errors).toEqual({ title: 'title_required' });
		expect(fields.status('title')).toBe('invalid');
	});

	it('gives a server refusal an error that the next valid keystroke clears (exception)', () => {
		values.title = 'Plan';
		fields.input('title');
		fields.blur('title');
		fields.reject('title', 'taken');
		expect(fields.error('title')).toBe('taken');
		expect(fields.status('title')).toBe('invalid');

		values.title = 'Plans';
		fields.input('title');
		expect(fields.status('title')).toBe('valid');
	});

	it('goes back to neutral after a reset (happy path)', () => {
		values.title = 'Plan';
		fields.input('title');
		fields.blur('title');
		fields.reset();
		expect(fields.status('title')).toBe('neutral');
		fields.blur('title');
		expect(fields.status('title')).toBe('neutral');
	});
});
