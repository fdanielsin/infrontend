import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Button from '$lib/ui/Button.svelte';
import ButtonLink from '$lib/ui/ButtonLink.svelte';
import { buttonClasses } from '$lib/ui/button-styles';

const label = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

const classesOf = (element: HTMLElement) => element.className.split(/\s+/).filter(Boolean);

// One accent color, three variants, two sizes: the system every action of the interface uses.
describe('button system', () => {
	afterEach(cleanup);

	describe('variants', () => {
		it('primary is the filled accent, with a hover and a disabled color (happy path)', () => {
			const classes = buttonClasses({ variant: 'primary' }).split(' ');

			expect(classes).toContain('bg-primary');
			expect(classes).toContain('text-on-primary');
			expect(classes).toContain('hover:bg-primary-hover');
			expect(classes).toContain('disabled:bg-disabled');
		});

		it('primary and secondary have the same box: both carry a border (boundary)', () => {
			for (const size of ['md', 'sm'] as const) {
				expect(buttonClasses({ variant: 'primary', size }).split(' ')).toContain('border');
				expect(buttonClasses({ variant: 'secondary', size }).split(' ')).toContain('border');
			}
		});

		it('secondary is an outline in the strong action color, and has a disabled style (happy path)', () => {
			const classes = buttonClasses({ variant: 'secondary' }).split(' ');

			expect(classes).toContain('border');
			expect(classes).toContain('border-action-strong');
			expect(classes).toContain('text-action-strong');
			expect(classes).toContain('hover:bg-action-strong/10');
			expect(classes).toContain('disabled:border-disabled');
			expect(classes).toContain('disabled:text-disabled');
			expect(classes).not.toContain('bg-primary');
		});

		it('link is text in the strong action color, with a disabled style (happy path)', () => {
			const classes = buttonClasses({ variant: 'link' }).split(' ');

			expect(classes).toContain('text-action-strong');
			expect(classes).toContain('disabled:text-disabled');
			expect(classes).not.toContain('border');
		});

		it('never draws a second accent: no success green, no indigo, no raw hue (limit)', () => {
			for (const variant of ['primary', 'secondary', 'link'] as const) {
				for (const tone of ['default', 'danger', 'inverse'] as const) {
					const text = buttonClasses({ variant, tone });
					expect(text).not.toMatch(/success|indigo|green|amber|-(?:\d00|50)\b/);
				}
			}
		});
	});

	describe('tones of the secondary variant', () => {
		it.each([
			['danger', 'border-danger', 'text-danger'],
			['inverse', 'border-on-toast', 'text-on-toast']
		] as const)('%s follows its surface (happy path)', (tone, border, text) => {
			const classes = buttonClasses({ variant: 'secondary', tone }).split(' ');

			expect(classes).toContain(border);
			expect(classes).toContain(text);
			expect(classes).not.toContain('border-action-strong');
		});

		it('inverse carries the white focus outline of colored surfaces (boundary)', () => {
			expect(buttonClasses({ variant: 'secondary', tone: 'inverse' })).toContain(
				'focus-visible:outline-focus-inverse'
			);
		});

		it('a tone changes nothing on primary (limit)', () => {
			expect(buttonClasses({ variant: 'primary', tone: 'danger' })).toBe(
				buttonClasses({ variant: 'primary' })
			);
		});
	});

	describe('sizes and width', () => {
		it('md is the default size and sm is the compact one (boundary)', () => {
			expect(buttonClasses({ variant: 'primary' })).toBe(
				buttonClasses({ variant: 'primary', size: 'md' })
			);
			expect(buttonClasses({ variant: 'secondary', size: 'sm' })).toContain('text-sm');
			expect(buttonClasses({ variant: 'secondary', size: 'sm' })).toContain('min-h-6');
			expect(buttonClasses({ variant: 'secondary', size: 'md' })).toContain('py-2');
		});

		it('md buttons of any variant share the same vertical size (boundary)', () => {
			const heights = (['primary', 'secondary'] as const).map((variant) =>
				buttonClasses({ variant, size: 'md' })
					.split(' ')
					.filter((name) => /^(py-|min-h-)/.test(name))
					.join(' ')
			);

			expect(heights[0]).toBe(heights[1]);
		});

		it('is not full width unless asked with block (happy path)', () => {
			expect(buttonClasses({ variant: 'primary' }).split(' ')).not.toContain('w-full');
			expect(buttonClasses({ variant: 'primary', block: true }).split(' ')).toContain('w-full');
		});
	});

	describe('components', () => {
		it('Button renders a button of type "button" by default, forwarding its attributes (happy path)', () => {
			const { getByRole } = render(Button, {
				children: label('Save'),
				'aria-label': 'Save the task'
			});

			const button = getByRole('button', { name: 'Save the task' });
			expect(button.getAttribute('type')).toBe('button');
		});

		it('Button submits when asked (happy path)', () => {
			const { getByRole } = render(Button, { children: label('Go'), type: 'submit' });

			expect(getByRole('button').getAttribute('type')).toBe('submit');
		});

		it('Button applies variant, size, tone, block and the caller class (happy path)', () => {
			const { getByRole } = render(Button, {
				children: label('Retry'),
				variant: 'secondary',
				size: 'sm',
				tone: 'danger',
				block: true,
				class: 'mt-3'
			});

			const classes = classesOf(getByRole('button'));
			const expected = buttonClasses({
				variant: 'secondary',
				size: 'sm',
				tone: 'danger',
				block: true
			}).split(' ');
			for (const name of expected) expect(classes).toContain(name);
			expect(classes).toContain('mt-3');
		});

		it('ButtonLink is a link with the secondary look, so go and back look alike (happy path)', () => {
			const { getByRole } = render(ButtonLink, { href: '/stats', children: label('Stats') });

			const link = getByRole('link', { name: 'Stats' });
			expect(link.getAttribute('href')).toBe('/stats');
			for (const name of buttonClasses({ variant: 'secondary' }).split(' ')) {
				expect(classesOf(link)).toContain(name);
			}
		});

		it('ButtonLink forwards extra attributes and takes no button type (exception)', () => {
			const { getByRole } = render(ButtonLink, {
				href: '/',
				children: label('Home'),
				'data-testid': 'home-link'
			});

			const link = getByRole('link');
			expect(link.getAttribute('data-testid')).toBe('home-link');
			expect(link.getAttribute('type')).toBeNull();
		});
	});
});
