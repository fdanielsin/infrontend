import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrate, unmount } from 'svelte';
import Icon from '$lib/ui/Icon.svelte';
import { XMARK_16_SERVER_MARKUP } from '../support/icon-server-markup';

describe('Icon hydration', () => {
	let target: HTMLElement;

	beforeEach(() => {
		target = document.createElement('div');
		document.body.append(target);
	});

	afterEach(() => {
		target.remove();
		vi.restoreAllMocks();
	});

	it('takes over the server markup without a mismatch, and keeps the same element (happy path)', async () => {
		// GIVEN: The markup the server printed.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		target.innerHTML = XMARK_16_SERVER_MARKUP;
		const printed = target.querySelector('svg');

		// WHEN: The client hydrates it with the same props.
		const component = hydrate(Icon, { target, props: { icon: 'xmark', size: 16 } });

		// THEN: No mismatch is reported and the printed element is reused, not replaced.
		expect(warn).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
		expect(printed).not.toBeNull();
		expect(target.querySelector('svg')).toBe(printed);
		await unmount(component);
	});

	it('reports a mismatch when the markup is not the one the client expects (sad path)', async () => {
		// GIVEN: A server markup that does not have the shape of the icon.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		target.innerHTML = '<!--[--><p>not an icon</p><!--]-->';

		// WHEN: The client hydrates the icon over it.
		const component = hydrate(Icon, { target, props: { icon: 'xmark', size: 16 } });

		// THEN: Svelte warns, so the silence asserted above means something.
		expect(warn).toHaveBeenCalled();
		await unmount(component);
	});
});
