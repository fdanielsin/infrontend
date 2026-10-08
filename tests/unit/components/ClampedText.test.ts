import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import ClampedText from '$lib/features/tasks/ClampedText.svelte';
import { stubLayout } from '../support/layout';

const LONG = 'word '.repeat(400).trim();

describe('ClampedText', () => {
	let layout: ReturnType<typeof stubLayout>;

	beforeEach(() => {
		layout = stubLayout();
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('clamps to three lines and offers "Show more" when the text overflows (happy path)', async () => {
		// GIVEN: A description taller than its three-line box.
		layout.heights.scroll = 200;
		layout.heights.client = 60;

		// WHEN: It is rendered.
		const { getByText, getByRole } = render(ClampedText, { id: 'task-description-1', text: LONG });

		// THEN: The text is clamped, whole in the page, and the button points at it.
		const text = getByText(LONG);
		expect(text.classList.contains('line-clamp-3')).toBe(true);
		const button = await waitFor(() => getByRole('button', { name: 'Show more' }));
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(button.getAttribute('aria-controls')).toBe(text.id);
		expect(text.id).toBe('task-description-1');
	});

	it('expands and collapses with the button (happy path)', async () => {
		// GIVEN: An overflowing description.
		layout.heights.scroll = 200;
		layout.heights.client = 60;
		const { getByText, getByRole } = render(ClampedText, { id: 'd', text: LONG });
		const text = getByText(LONG);

		// WHEN: "Show more" is pressed.
		await fireEvent.click(await waitFor(() => getByRole('button', { name: 'Show more' })));

		// THEN: The clamp is gone and the button offers "Show less", still expanded.
		expect(text.classList.contains('line-clamp-3')).toBe(false);
		const less = getByRole('button', { name: 'Show less' });
		expect(less.getAttribute('aria-expanded')).toBe('true');

		// WHEN: "Show less" is pressed.
		await fireEvent.click(less);

		// THEN: The text is clamped again.
		expect(text.classList.contains('line-clamp-3')).toBe(true);
		expect(getByRole('button', { name: 'Show more' })).toBeTruthy();
	});

	it('keeps the button once expanded although the expanded text no longer overflows (limit)', async () => {
		// GIVEN: An overflowing description that gets expanded; expanded, its box fits the content.
		layout.heights.scroll = 200;
		layout.heights.client = 60;
		const { getByRole } = render(ClampedText, { id: 'd', text: LONG });
		await fireEvent.click(await waitFor(() => getByRole('button', { name: 'Show more' })));
		layout.heights.client = 200;

		// WHEN: The box is measured again.
		layout.resize();

		// THEN: The way back stays available.
		await waitFor(() => expect(getByRole('button', { name: 'Show less' })).toBeTruthy());
	});

	it.each([
		['fits exactly', 60, 60, false],
		['one pixel over (rounding)', 61, 60, false],
		['two pixels over', 62, 60, true]
	])('%s: button shown is %s (boundary values)', async (_name, scroll, client, shown) => {
		// GIVEN: A box and a content differing by the given amount.
		layout.heights.scroll = scroll;
		layout.heights.client = client;

		// WHEN: It is rendered.
		const { queryByRole, getByText } = render(ClampedText, { id: 'd', text: 'Some text' });
		await Promise.resolve();

		// THEN: The button exists only past one pixel.
		expect(getByText('Some text')).toBeTruthy();
		expect(queryByRole('button') !== null).toBe(shown);
	});

	it('shows the button after a resize makes the text overflow, and hides it again (happy path)', async () => {
		// GIVEN: A description that fits.
		layout.heights.scroll = 40;
		layout.heights.client = 40;
		const { queryByRole } = render(ClampedText, { id: 'd', text: LONG });
		expect(queryByRole('button')).toBeNull();

		// WHEN: The column gets narrower.
		layout.heights.scroll = 120;
		layout.resize();

		// THEN: The button appears.
		await waitFor(() => expect(queryByRole('button', { name: 'Show more' })).not.toBeNull());

		// WHEN: The column gets wide again.
		layout.heights.scroll = 40;
		layout.resize();

		// THEN: It goes away.
		await waitFor(() => expect(queryByRole('button')).toBeNull());
	});

	it('renders an empty description without a button (limit)', async () => {
		const { container, queryByRole } = render(ClampedText, { id: 'd', text: '' });
		await Promise.resolve();
		expect(queryByRole('button')).toBeNull();
		expect(container.querySelector('p')?.textContent).toBe('');
	});

	it('renders markup and unusual text as plain text (limit)', () => {
		const text = '<img src=x onerror=alert(1)> مرحبا 😀 ‮';
		const { getByText, container } = render(ClampedText, { id: 'd', text });
		expect(getByText(text)).toBeTruthy();
		expect(container.querySelector('img')).toBeNull();
	});

	it('works without ResizeObserver: measures once and shows no error (exception)', async () => {
		// GIVEN: A browser with no ResizeObserver.
		vi.stubGlobal('ResizeObserver', undefined);
		layout.heights.scroll = 200;
		layout.heights.client = 60;

		// WHEN / THEN: The first measure still offers the button.
		const { getByRole } = render(ClampedText, { id: 'd', text: LONG });
		await waitFor(() => expect(getByRole('button', { name: 'Show more' })).toBeTruthy());
	});

	it('works when ResizeObserver throws on construction (exception)', async () => {
		// GIVEN: A ResizeObserver that cannot be built.
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor() {
					throw new Error('unsupported');
				}
			}
		);
		layout.heights.scroll = 200;
		layout.heights.client = 60;

		// WHEN / THEN: The text is shown and the first measure still applies.
		const { getByRole } = render(ClampedText, { id: 'd', text: LONG });
		await waitFor(() => expect(getByRole('button', { name: 'Show more' })).toBeTruthy());
	});
});
