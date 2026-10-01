import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { overwriteGetLocale, type Locale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';
import LanguageSwitcher from '$lib/ui/LanguageSwitcher.svelte';
import { renderWithApp } from '../support/render-with-app';

const ACCESSIBLE_NAMES: Record<Locale, string> = {
	en: 'Language',
	fr: 'Langue',
	de: 'Sprache',
	es: 'Idioma'
};

function select(view: ReturnType<typeof renderWithApp>) {
	return view.getByRole('combobox') as HTMLSelectElement;
}

async function choose(view: ReturnType<typeof renderWithApp>, locale: Locale) {
	const control = select(view);
	control.value = locale;
	await fireEvent.change(control);
	await tick();
}

describe('LanguageSwitcher', () => {
	let app: AppState;

	beforeEach(() => {
		app = new AppState();
	});

	afterEach(() => {
		cleanup();
		document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
		overwriteGetLocale(() => 'en');
	});

	it('offers the four languages, each named in itself and marked with its lang (happy path)', () => {
		// GIVEN / WHEN: The switcher in English.
		const view = renderWithApp(app, LanguageSwitcher);

		// THEN: A native select named "Language", with the active language selected.
		const control = view.getByRole('combobox', { name: 'Language' }) as HTMLSelectElement;
		expect(within(control).getAllByRole('option')).toHaveLength(4);
		const options = Array.from(control.options);
		expect(
			options.map((option) => [option.value, option.lang, option.textContent?.trim()])
		).toEqual([
			['en', 'en', 'EN - English'],
			['fr', 'fr', 'FR - Français'],
			['de', 'de', 'DE - Deutsch'],
			['es', 'es', 'ES - Español']
		]);
		expect(control.value).toBe('en');
	});

	it.each(['fr', 'de', 'es'] as const)(
		'switches to %s, renames itself and keeps the focus (happy path)',
		async (locale) => {
			// GIVEN: The switcher focused by a keyboard user.
			const view = renderWithApp(app, LanguageSwitcher);
			select(view).focus();

			// WHEN: Another language is chosen.
			await choose(view, locale);

			// THEN: The language is active, the label follows and the focus stays on the select.
			expect(app.locale.current).toBe(locale);
			expect(view.getByRole('combobox', { name: ACCESSIBLE_NAMES[locale] })).toBe(
				document.activeElement
			);
			expect(select(view).value).toBe(locale);
		}
	);

	it('announces the change in the new language, in the status region (happy path)', async () => {
		// GIVEN: The English switcher.
		const view = renderWithApp(app, LanguageSwitcher);

		// WHEN: German is chosen.
		await choose(view, 'de');

		// THEN: One information toast, written in German, names the language.
		expect(app.notifications.items).toHaveLength(1);
		expect(app.notifications.items[0]?.type).toBe('info');
		expect(app.notifications.items[0]?.message).toContain('Deutsch');
	});

	it('clears the errors shown by the features when switching (limit)', async () => {
		// GIVEN: Errors in both features.
		app.users.status.error = 'Email already in use';
		app.tasks.status.error = 'Task not found';
		const view = renderWithApp(app, LanguageSwitcher);

		// WHEN: French is chosen.
		await choose(view, 'fr');

		// THEN: No error is left in the old language.
		expect(app.users.status.error).toBeNull();
		expect(app.tasks.status.error).toBeNull();
	});

	it('ignores a value that is not an offered language (exception)', async () => {
		// GIVEN: A tampered select value.
		const view = renderWithApp(app, LanguageSwitcher);
		const control = select(view);
		const option = document.createElement('option');
		option.value = 'it';
		control.append(option);

		// WHEN: That value is chosen.
		await choose(view, 'it' as Locale);

		// THEN: The language and the toasts are unchanged.
		expect(app.locale.current).toBe('en');
		expect(app.notifications.items).toEqual([]);
	});
});
