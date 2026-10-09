import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { AppState } from '$lib/state/app-state.svelte';
import PageShell from '$lib/ui/PageShell.svelte';
import { renderWithApp } from '../support/render-with-app';

const snippet = (html: string) => createRawSnippet(() => ({ render: () => html }));

// The frame both pages share: same container, same place for the language and the title.
describe('PageShell', () => {
	afterEach(cleanup);

	it('renders one landmark main, focusable by script only, and one h1 (happy path)', () => {
		const { container, getAllByRole } = renderWithApp(new AppState(), PageShell, {
			heading: 'Tasks',
			children: snippet('<p>Body</p>')
		});

		const main = container.querySelector('main');
		expect(main?.getAttribute('tabindex')).toBe('-1');
		expect(getAllByRole('heading', { level: 1 })).toHaveLength(1);
		expect(container.textContent).toContain('Body');
	});

	it('puts the language switcher before the title, then subtitle and actions after it (boundary)', () => {
		const { container, getByRole, getByText } = renderWithApp(new AppState(), PageShell, {
			heading: 'Tasks',
			subtitle: 'Manage them',
			actions: snippet('<a href="/stats">Stats</a>'),
			children: snippet('<p>Body</p>')
		});

		const order = [
			getByRole('combobox'),
			getByRole('heading', { level: 1 }),
			getByText('Manage them'),
			getByRole('link', { name: 'Stats' }),
			getByText('Body')
		];
		for (let index = 1; index < order.length; index += 1) {
			const previous = order[index - 1] as Element;
			const next = order[index] as Element;
			expect(
				previous.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING,
				`element ${index} follows element ${index - 1}`
			).toBeTruthy();
		}
		expect(container.querySelectorAll('main')).toHaveLength(1);
	});

	it('aligns the title to the left: no centered text on the header (happy path)', () => {
		const { getByRole } = renderWithApp(new AppState(), PageShell, {
			heading: 'Tasks',
			children: snippet('<span></span>')
		});

		const header = getByRole('heading', { level: 1 }).closest('header');
		expect(header?.className).not.toContain('text-center');
	});

	it('hides a decorative icon from assistive technology (limit)', () => {
		const { getByRole } = renderWithApp(new AppState(), PageShell, {
			heading: 'Tasks',
			icon: 'list' as const,
			children: snippet('<span></span>')
		});

		expect(
			getByRole('heading', { level: 1 }).querySelector('svg')?.getAttribute('aria-hidden')
		).toBe('true');
	});

	it('wraps a long heading made of one unbroken word (limit)', () => {
		const long = 'W'.repeat(200);
		const { getByRole } = renderWithApp(new AppState(), PageShell, {
			heading: long,
			children: snippet('<span></span>')
		});

		expect(getByRole('heading', { level: 1 }).className).toContain('wrap-break-word');
	});

	it('renders without subtitle nor actions (boundary)', () => {
		const { queryByRole, getByRole } = renderWithApp(new AppState(), PageShell, {
			heading: 'Tasks',
			children: snippet('<span></span>')
		});

		expect(getByRole('heading', { level: 1 }).textContent).toContain('Tasks');
		expect(queryByRole('link')).toBeNull();
	});
});
