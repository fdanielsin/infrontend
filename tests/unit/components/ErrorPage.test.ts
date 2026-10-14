import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { overwriteGetLocale, type Locale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';
import { renderWithApp } from '../support/render-with-app';
import { LOCALES, translation } from '../support/messages';

const status = vi.hoisted(() => ({ current: 404 }));
vi.mock('$app/state', () => ({
	page: {
		get status() {
			return status.current;
		}
	}
}));

import ErrorPage from '../../../src/routes/+error.svelte';

// SvelteKit renders +error.svelte inside the root layout: the skip link is there, so the page must
// have the landmark it points at (the 404 page had none, #70).
describe('error page', () => {
	let app: AppState;

	beforeEach(() => {
		app = new AppState();
		status.current = 404;
		overwriteGetLocale(() => 'en');
	});

	afterEach(() => {
		cleanup();
		app.destroy();
	});

	it('has the landmark #main-content that the skip link targets, with one h1 (happy path)', () => {
		const { container, getByRole } = renderWithApp(app, ErrorPage);

		const main = container.querySelector('main#main-content');
		expect(main?.getAttribute('tabindex')).toBe('-1');
		expect(getByRole('heading', { level: 1 }).textContent).toContain('Page not found');
	});

	it.each(LOCALES)('says that the page does not exist, in %s (happy path)', (locale: Locale) => {
		overwriteGetLocale(() => locale);

		const { getByRole } = renderWithApp(app, ErrorPage);

		expect(getByRole('heading', { level: 1 }).textContent).toContain(
			translation(locale, 'error_not_found_heading')
		);
	});

	it('offers a way back to the home page (happy path)', () => {
		const { getByRole } = renderWithApp(app, ErrorPage);

		expect(getByRole('link', { name: /Back to home/ }).getAttribute('href')).toBe('/');
	});

	it('titles the document after the error: not found for a 404, generic for another (happy path)', () => {
		renderWithApp(app, ErrorPage);
		expect(document.title).toBe('Page not found - inBackend');

		cleanup();
		status.current = 500;
		renderWithApp(app, ErrorPage);
		expect(document.title).toBe('Something went wrong - inBackend');
	});

	it('does not claim that the page is missing for another error (sad path)', () => {
		status.current = 500;

		const { getByRole } = renderWithApp(app, ErrorPage);

		expect(getByRole('heading', { level: 1 }).textContent).toContain('Something went wrong');
		expect(getByRole('heading', { level: 1 }).textContent).not.toContain('not found');
	});
});
