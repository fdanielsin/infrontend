// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Icon from '$lib/ui/Icon.svelte';
import IconButton from '$lib/ui/IconButton.svelte';
import { XMARK_16_SERVER_MARKUP } from '../support/icon-server-markup';

describe('Icon rendered on the server', () => {
	it('is in the HTML the server sends, decorative and sized (happy path)', () => {
		// WHEN: The server renders the icon.
		const { body } = render(Icon, { props: { icon: 'xmark', size: 16 } });

		// THEN: The svg is in the markup, hidden from assistive technology, with its size class.
		expect(body).toContain('<svg');
		expect(body).toContain('aria-hidden="true"');
		expect(body).toContain('class="size-4 ');
		expect(body).toBe(XMARK_16_SERVER_MARKUP);
	});

	it('prints nothing for an icon that is not listed, and does not throw (exception)', () => {
		const { body } = render(Icon, { props: { icon: 'plus' as 'xmark' } });

		expect(body).not.toContain('<svg');
	});
});

describe('IconButton rendered on the server', () => {
	it('prints a named button with its hidden cross (happy path)', () => {
		const { body } = render(IconButton, { props: { label: 'Close the notification' } });

		expect(body).toContain('<button type="button"');
		expect(body).toContain('aria-label="Close the notification"');
		expect(body).toMatch(/<svg[^>]*aria-hidden="true"/);
	});
});
