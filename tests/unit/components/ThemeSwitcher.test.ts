import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { AppState } from '$lib/state/app-state.svelte';
import ThemeSwitcher from '$lib/ui/ThemeSwitcher.svelte';
import { renderWithApp } from '../support/render-with-app';

// THEME-R02: three native radios in a group named "Theme", icons decorative.
describe('ThemeSwitcher', () => {
	beforeEach(() => document.documentElement.removeAttribute('data-theme'));
	afterEach(() => {
		cleanup();
		document.documentElement.removeAttribute('data-theme');
		document.cookie = 'theme=; Path=/; Max-Age=0';
	});

	it('is a radio group named Theme with three named radios, System checked by default (happy path)', () => {
		const view = renderWithApp(new AppState(), ThemeSwitcher);
		const group = view.getByRole('radiogroup', { name: 'Theme' });
		within(group).getAllByRole('radio');
		const radios = Array.from(group.querySelectorAll('input'));
		expect(radios).toHaveLength(3);
		for (const name of ['Light', 'Dark', 'System']) {
			expect(within(group).getByRole('radio', { name })).toBeTruthy();
		}
		expect(view.getByRole('radio', { name: 'System' })).toHaveProperty('checked', true);
		expect(radios.filter((radio) => radio.checked)).toHaveLength(1);
		expect(radios.every((radio) => radio.name === 'theme')).toBe(true);
	});

	it('checks the position the server rendered (happy path)', () => {
		const view = renderWithApp(new AppState('dark'), ThemeSwitcher);
		expect(view.getByRole('radio', { name: 'Dark' })).toHaveProperty('checked', true);
		expect(view.getByRole('radio', { name: 'System' })).toHaveProperty('checked', false);
	});

	it('hides its icons from assistive technologies and titles each position (boundary)', () => {
		const view = renderWithApp(new AppState(), ThemeSwitcher);
		const icons = Array.from(view.container.querySelectorAll('svg'));
		expect(icons.map((icon) => icon.getAttribute('data-icon'))).toEqual([
			'sun-light',
			'half-moon',
			'computer'
		]);
		expect(icons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
		expect(
			Array.from(view.container.querySelectorAll('label[title]')).map((l) =>
				l.getAttribute('title')
			)
		).toEqual(['Light', 'Dark', 'System']);
	});

	it('applies the choice without a notification and keeps the focus on it (happy path)', async () => {
		const app = new AppState();
		const view = renderWithApp(app, ThemeSwitcher);
		const dark = view.getByRole('radio', { name: 'Dark' }) as HTMLInputElement;
		dark.focus();
		await fireEvent.click(dark);
		await tick();
		expect(app.theme.current).toBe('dark');
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
		expect(document.activeElement).toBe(dark);
		expect(app.notifications.announcement).toBeNull();
		expect(app.notifications.items).toHaveLength(0);
	});

	it('does not touch the language (boundary)', async () => {
		const app = new AppState();
		const before = app.locale.current;
		const view = renderWithApp(app, ThemeSwitcher);
		await fireEvent.click(view.getByRole('radio', { name: 'Light' }));
		expect(app.locale.current).toBe(before);
	});
});
