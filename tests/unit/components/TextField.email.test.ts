import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import TextField from '$lib/ui/TextField.svelte';

describe('TextField of type email', () => {
	afterEach(cleanup);

	it('is a text field that asks for the e-mail keyboard, without autofill, and keeps what is typed (happy path)', async () => {
		// GIVEN / WHEN: An e-mail field, and an international address typed in it.
		const { getByLabelText } = render(TextField, { id: 'email', label: 'Email', type: 'email' });
		const field = getByLabelText('Email') as HTMLInputElement;
		await fireEvent.input(field, { target: { value: 'ivan@пример.рф' } });

		// THEN: The browser has no e-mail value to rewrite; the attributes keep the keyboard.
		expect(field.type).toBe('text');
		expect(field.getAttribute('inputmode')).toBe('email');
		expect(field.getAttribute('autocomplete')).toBe('off');
		expect(field.getAttribute('spellcheck')).toBe('false');
		expect(field.getAttribute('autocapitalize')).toBe('off');
		expect(field.value).toBe('ivan@пример.рф');
	});

	it('leaves a plain text field without those attributes (limit)', () => {
		const { getByLabelText } = render(TextField, { id: 'name', label: 'Name' });
		const field = getByLabelText('Name');

		expect(field.getAttribute('inputmode')).toBeNull();
		expect(field.getAttribute('autocomplete')).toBeNull();
	});
});
