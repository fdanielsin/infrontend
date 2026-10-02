import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { overwriteGetLocale, type Locale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';
import TaskForm from '$lib/features/tasks/TaskForm.svelte';
import UserForm from '$lib/features/users/UserForm.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({
	api: {
		getUsers: vi.fn(),
		createUser: vi.fn(),
		getUser: vi.fn(),
		getUserTasks: vi.fn(),
		createTask: vi.fn(),
		updateTask: vi.fn(),
		deleteTask: vi.fn()
	}
}));

function translation(locale: Locale, key: string) {
	const messages = JSON.parse(
		readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
	) as Record<string, string>;
	return messages[key] ?? '';
}

const user = { id: 1, name: 'Ada', email: 'ada@example.com' };
const task = { id: 10, title: 'Review', description: '', user_id: 1, completed: false };

// After a switch, a field error already shown stays and follows the new language (decision I2).
describe('field errors after a change of language', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	afterEach(() => {
		cleanup();
		document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
		overwriteGetLocale(() => 'en');
	});

	it.each(['fr', 'de', 'es'] as const)(
		'shows the user name error again in %s, still linked to its field, with the draft kept (happy path)',
		async (locale) => {
			// GIVEN: A refused name of spaces, in English.
			const view = renderWithApp(app, UserForm);
			const name = view.getByLabelText('Name') as HTMLInputElement;
			await fireEvent.input(name, { target: { value: '   ' } });
			await fireEvent.input(view.getByLabelText('Email'), { target: { value: 'a@b.co' } });
			await fireEvent.submit(name.closest('form') as HTMLFormElement);
			await tick();
			expect(view.getByText(translation('en', 'validation_name_required'))).toBeTruthy();

			// WHEN: The language changes.
			app.changeLocale(locale);
			await tick();

			// THEN: The same error is shown in the new language, on the same field.
			const error = document.getElementById('name-error');
			expect(error?.textContent?.trim()).toBe(translation(locale, 'validation_name_required'));
			expect(view.queryByText(translation('en', 'validation_name_required'))).toBeNull();
			expect(name.getAttribute('aria-invalid')).toBe('true');
			expect(name.getAttribute('aria-describedby')).toBe('name-error');
			expect(name.value).toBe('   ');
		}
	);

	it('shows the task title error of the add form in the new language (happy path)', async () => {
		// GIVEN: An empty title refused in English.
		app.tasks.tasks = [task];
		const view = renderWithApp(app, TaskForm, { user });
		const add = view.getByRole('button', { name: 'Add Task' });
		await fireEvent.submit(add.closest('form') as HTMLFormElement);
		await tick();

		// WHEN: The language changes to German.
		app.changeLocale('de');
		await tick();

		// THEN: The title error is in German and still linked.
		expect(document.getElementById('title-error')?.textContent?.trim()).toBe(
			translation('de', 'validation_title_required')
		);
		expect(document.getElementById('title')?.getAttribute('aria-describedby')).toBe('title-error');
	});

	it('shows the error of an edit in the new language and keeps the edit open (limit)', async () => {
		// GIVEN: An edit whose emptied title is refused in English.
		app.tasks.tasks = [task];
		const view = renderWithApp(app, TaskForm, { user });
		await fireEvent.click(view.getByRole('button', { name: 'Edit Review' }));
		await tick();
		const editTitle = document.getElementById('edit-title-10') as HTMLInputElement;
		await fireEvent.input(editTitle, { target: { value: '' } });
		await fireEvent.submit(editTitle.closest('form') as HTMLFormElement);
		await tick();

		// WHEN: The language changes to Spanish.
		app.changeLocale('es');
		await tick();

		// THEN: The edit is still open, its error is in Spanish and linked.
		expect(document.getElementById('edit-title-10')).toBe(editTitle);
		expect(document.getElementById('edit-title-error-10')?.textContent?.trim()).toBe(
			translation('es', 'validation_title_required')
		);
		expect(editTitle.getAttribute('aria-invalid')).toBe('true');
	});

	it('keeps a draft without error untouched by the switch (boundary)', async () => {
		// GIVEN: A valid draft typed in the user form.
		const view = renderWithApp(app, UserForm);
		const name = view.getByLabelText('Name') as HTMLInputElement;
		await fireEvent.input(name, { target: { value: 'Grace' } });

		// WHEN: The language changes.
		app.changeLocale('fr');
		await tick();

		// THEN: The draft stays and no error appears.
		expect(name.value).toBe('Grace');
		expect(name.getAttribute('aria-invalid')).toBe('false');
		expect(document.getElementById('name-error')).toBeNull();
	});
});
