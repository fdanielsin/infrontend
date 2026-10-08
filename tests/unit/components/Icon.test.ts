import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import Xmark from '~icons/iconoir/xmark';
import Icon from '$lib/ui/Icon.svelte';

function svgOf(container: HTMLElement): SVGSVGElement {
	const svg = container.querySelector('svg');
	if (!svg) throw new Error(`No <svg> in ${container.innerHTML}`);
	return svg;
}

// The scale and its classes are the contract of the component, written out on purpose.
type IconSize = 16 | 20 | 24;
const SIZE_CLASS: Record<IconSize, string> = { 16: 'size-4', 20: 'size-5', 24: 'size-6' };
const ALL_SIZE_CLASSES = Object.values(SIZE_CLASS);

describe('Icon component', () => {
	afterEach(cleanup);

	it('draws the Iconoir icon it is given (happy path)', () => {
		// GIVEN: The same Iconoir icon, drawn on its own.
		const reference = svgOf(render(Xmark).container).querySelector('path');

		// WHEN: The Icon names it.
		const { container } = render(Icon, { props: { icon: 'xmark' } });

		// THEN: The drawing is the one of the set, stroked with the text color.
		const path = svgOf(container).querySelector('path');
		expect(path?.getAttribute('d')).toBe(reference?.getAttribute('d'));
		expect(path?.getAttribute('d')).not.toBeNull();
		expect(path?.getAttribute('stroke')).toBe('currentColor');
		expect(path?.getAttribute('stroke-width')).toBe('1.5');
	});

	it('is decorative: hidden from assistive technology, not focusable, with no name (happy path)', () => {
		// WHEN: An icon is rendered.
		const { container } = render(Icon, { props: { icon: 'xmark' } });

		// THEN: It carries no role, no name and no title, and cannot take the focus.
		const svg = svgOf(container);
		expect(svg.getAttribute('aria-hidden')).toBe('true');
		expect(svg.getAttribute('focusable')).toBe('false');
		for (const attribute of ['role', 'aria-label', 'aria-labelledby', 'aria-describedby']) {
			expect(svg.hasAttribute(attribute), attribute).toBe(false);
		}
		expect(svg.querySelector('title')).toBeNull();
	});

	it('is 20 px (size-5) when no size is given (happy path)', () => {
		const { container } = render(Icon, { props: { icon: 'xmark' } });

		expect(svgOf(container).classList.contains(SIZE_CLASS[20])).toBe(true);
	});

	it('imposes no color: it follows the text color of its surroundings (happy path)', () => {
		const { container } = render(Icon, { props: { icon: 'xmark' } });

		const classes = svgOf(container).getAttribute('class') ?? '';
		expect(classes).not.toMatch(/(^|\s)(text|fill|stroke|bg)-/);
		expect(svgOf(container).hasAttribute('style')).toBe(false);
	});

	it('keeps the caller class and passes other attributes through (happy path)', () => {
		const { container } = render(Icon, {
			props: { icon: 'xmark', class: 'text-danger', 'data-testid': 'cross' }
		});

		const svg = svgOf(container);
		expect(svg.classList.contains('text-danger')).toBe(true);
		expect(svg.classList.contains(SIZE_CLASS[20])).toBe(true);
		expect(svg.getAttribute('data-testid')).toBe('cross');
	});

	it('cannot be named, and a name or role forced through the types does not show it (sad path)', () => {
		// THEN: The types refuse a label, an accessible name, a role, a size outside the scale
		// and an icon that is not listed (`bun run check` fails when one of them is accepted).
		// @ts-expect-error an icon has no `label`
		render(Icon, { props: { icon: 'xmark', label: 'Close' } });
		// @ts-expect-error an icon has no accessible name
		render(Icon, { props: { icon: 'xmark', 'aria-label': 'Close' } });
		// @ts-expect-error an icon has no role
		render(Icon, { props: { icon: 'xmark', role: 'img' } });
		// @ts-expect-error 18 px is not on the scale
		render(Icon, { props: { icon: 'xmark', size: 18 } });
		// @ts-expect-error this icon is not listed in Icon.svelte
		render(Icon, { props: { icon: 'plus' } });
		cleanup();

		// WHEN: A caller forces them anyway (a cast, a spread of untyped props).
		const forced = { 'aria-hidden': 'false', role: 'img', 'aria-label': 'Close' };
		const { container } = render(Icon, { props: { icon: 'xmark', ...forced } });

		// THEN: The icon stays hidden from assistive technology.
		expect(svgOf(container).getAttribute('aria-hidden')).toBe('true');
	});

	it.each<[string, unknown]>([
		['a string', 'ml-2 text-danger'],
		['an array', ['ml-2', 'text-danger']],
		['an object', { 'ml-2': true, 'text-danger': true, hidden: false }],
		['undefined', undefined],
		['an empty string', ''],
		['a very long class', 'c'.repeat(10_000)]
	])('accepts %s as class and keeps the size (limit)', (_name, value) => {
		const { container } = render(Icon, {
			props: { icon: 'xmark', size: 16, class: value as string }
		});

		const svg = svgOf(container);
		expect(svg.classList.contains(SIZE_CLASS[16])).toBe(true);
		expect(svg.getAttribute('aria-hidden')).toBe('true');
	});

	it('writes a hostile class as text, never as markup (limit)', () => {
		const hostile = '"><script>window.hacked = true</script><b class="';

		const { container } = render(Icon, { props: { icon: 'xmark', class: hostile } });

		expect(container.querySelector('script')).toBeNull();
		expect(svgOf(container).getAttribute('class')).toContain(hostile);
	});

	it('renders a hundred icons, all decorative (limit)', () => {
		const container = document.createElement('div');
		document.body.append(container);
		for (let index = 0; index < 100; index += 1) {
			container.append(render(Icon, { props: { icon: 'xmark' } }).container);
		}

		const hidden = container.querySelectorAll('svg[aria-hidden="true"]');
		expect(hidden).toHaveLength(100);
		container.remove();
	});

	it.each<IconSize>([16, 20, 24])(
		'is drawn at %i px: its own size class and no other (boundary)',
		(size) => {
			const { container } = render(Icon, { props: { icon: 'xmark', size } });

			const classes = svgOf(container).classList;
			expect(classes.contains(SIZE_CLASS[size])).toBe(true);
			const others = ALL_SIZE_CLASSES.filter((name) => name !== SIZE_CLASS[size]);
			for (const other of others) expect(classes.contains(other), other).toBe(false);
		}
	);

	it('follows a change of size (boundary)', async () => {
		const { container, rerender } = render(Icon, { props: { icon: 'xmark', size: 16 } });
		expect(svgOf(container).classList.contains(SIZE_CLASS[16])).toBe(true);

		await rerender({ size: 24 });

		const classes = svgOf(container).classList;
		expect(classes.contains(SIZE_CLASS[24])).toBe(true);
		expect(classes.contains(SIZE_CLASS[16])).toBe(false);
	});

	it('draws nothing, and does not throw, for an icon that is not listed at run time (exception)', () => {
		const unlisted = 'plus' as never;

		const { container } = render(Icon, { props: { icon: unlisted } });

		expect(container.querySelector('svg')).toBeNull();
	});
});
