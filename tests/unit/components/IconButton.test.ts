import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import Xmark from '~icons/iconoir/xmark';
import IconButton from '$lib/ui/IconButton.svelte';

function buttonOf(container: HTMLElement): HTMLButtonElement {
	const button = container.querySelector('button');
	if (!button) throw new Error(`No <button> in ${container.innerHTML}`);
	return button;
}

describe('IconButton component', () => {
	afterEach(cleanup);

	it('is a button named by its label, whose cross is the Iconoir one, hidden (happy path)', () => {
		// GIVEN: The Iconoir cross, drawn on its own.
		const reference = render(Xmark).container.querySelector('path')?.getAttribute('d');

		// WHEN: A button is rendered with its label.
		const view = render(IconButton, { props: { label: 'Close the notification' } });

		// THEN: The label is its accessible name, the cross is the Iconoir one and is hidden.
		const button = view.getByRole('button', { name: 'Close the notification' });
		expect(button.getAttribute('aria-label')).toBe('Close the notification');
		const svg = button.querySelector('svg');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
		expect(svg?.querySelector('path')?.getAttribute('d')).toBe(reference);
		expect(button.textContent).toBe('');
		expect(button.querySelector('title')).toBeNull();
	});

	it('draws a 16 px cross, so the button keeps its 24 px target (happy path)', () => {
		const { container } = render(IconButton, { props: { label: 'Delete' } });

		const button = buttonOf(container);
		expect(button.querySelector('svg')?.classList.contains('size-4')).toBe(true);
		expect(button.classList.contains('min-h-6')).toBe(true);
		expect(button.classList.contains('min-w-6')).toBe(true);
	});

	it('is a plain button by default, and passes its attributes and its click through (happy path)', async () => {
		const onclick = vi.fn();
		const { container } = render(IconButton, {
			props: { label: 'Delete', onclick, 'data-toast-dismiss': '' }
		});

		const button = buttonOf(container);
		await fireEvent.click(button);
		expect(button.type).toBe('button');
		expect(button.hasAttribute('data-toast-dismiss')).toBe(true);
		expect(onclick).toHaveBeenCalledTimes(1);
	});

	it.each([
		['danger', 'text-danger', 'hover:bg-on-toast-hover'],
		['inverse', 'hover:bg-on-toast-hover', 'text-danger']
	] as const)(
		'the %s tone takes its colors from the text color (happy path)',
		(tone, present, absent) => {
			const { container } = render(IconButton, { props: { label: 'Close', tone } });

			const classes = buttonOf(container).classList;
			expect(classes.contains(present)).toBe(true);
			expect(classes.contains(absent)).toBe(false);
			// The cross sets no color of its own: it follows the button.
			const svgClass = container.querySelector('svg')?.getAttribute('class') ?? '';
			expect(svgClass).not.toMatch(/(^|\s)(text|fill|stroke|bg)-/);
		}
	);

	it('names the button by its label even when an aria-label is given too (sad path)', () => {
		const view = render(IconButton, { props: { label: 'Close', 'aria-label': 'Something else' } });

		expect(view.getByRole('button', { name: 'Close' })).toBeTruthy();
		expect(view.queryByRole('button', { name: 'Something else' })).toBeNull();
	});

	it('keeps a caller class next to the tone, and a submit type when asked (limit)', () => {
		const { container } = render(IconButton, {
			props: { label: 'Delete', class: 'col-start-2 row-span-2', type: 'submit' }
		});

		const button = buttonOf(container);
		expect(button.classList.contains('col-start-2')).toBe(true);
		expect(button.classList.contains('text-danger')).toBe(true);
		expect(button.type).toBe('submit');
	});

	it('writes a long label with markup characters as text, once, as the name (limit)', () => {
		const label = `Delete "<b>${'é&<'.repeat(300)}</b>"`;

		const view = render(IconButton, { props: { label } });

		expect(view.getByRole('button', { name: label })).toBeTruthy();
		expect(view.container.querySelector('b')).toBeNull();
	});

	it('is named by a one-character label (boundary)', () => {
		const view = render(IconButton, { props: { label: 'x' } });

		expect(view.getByRole('button', { name: 'x' })).toBeTruthy();
	});

	it.each(['danger', 'inverse'] as const)(
		'is 44 px for a coarse pointer, whatever its tone: %s (boundary)',
		(tone) => {
			const { container } = render(IconButton, { props: { label: 'Close', tone } });

			const button = buttonOf(container);
			expect(button.classList.contains('pointer-coarse:min-h-11')).toBe(true);
			expect(button.classList.contains('pointer-coarse:min-w-11')).toBe(true);
			expect(button.classList.contains('min-h-6')).toBe(true);
		}
	);
});
