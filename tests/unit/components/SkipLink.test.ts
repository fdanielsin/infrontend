import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import SkipLink from '$lib/ui/SkipLink.svelte';

// The skip link (WCAG 2.4.1) points at the landmark every page has, and moves the focus there by
// script because SvelteKit takes over a link to an anchor and leaves the focus where it was.
describe('SkipLink', () => {
	afterEach(() => {
		cleanup();
		document.body.innerHTML = '';
	});

	function addLandmark() {
		const main = document.createElement('main');
		main.id = 'main-content';
		main.tabIndex = -1;
		// jsdom does not implement it.
		main.scrollIntoView = vi.fn();
		document.body.append(main);
		return main;
	}

	it('points at #main-content, the id of the landmark of PageShell (happy path)', () => {
		const { getByRole } = render(SkipLink);

		expect(getByRole('link').getAttribute('href')).toBe('#main-content');
	});

	it('cancels the anchor jump and moves the focus to the landmark when it exists (happy path)', async () => {
		const main = addLandmark();
		const { getByRole } = render(SkipLink);

		// fireEvent returns false when a listener called preventDefault.
		const notCancelled = await fireEvent.click(getByRole('link'));

		expect(notCancelled).toBe(false);
		expect(document.activeElement).toBe(main);
	});

	it('leaves the browser to follow the link when the landmark is missing (sad path)', async () => {
		const { getByRole } = render(SkipLink);

		const notCancelled = await fireEvent.click(getByRole('link'));

		expect(notCancelled).toBe(true);
	});
});
