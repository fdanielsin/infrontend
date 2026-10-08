import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import TextField from '$lib/ui/TextField.svelte';
import { stubLayout } from '../support/layout';

describe('TextField autoGrow', () => {
	let layout: ReturnType<typeof stubLayout>;

	beforeEach(() => {
		layout = stubLayout();
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function textarea(container: HTMLElement) {
		return container.querySelector('textarea') as HTMLTextAreaElement;
	}

	it('sizes the textarea to its content when mounted (happy path)', () => {
		// GIVEN: A content of 90 px in a one-row box.
		layout.heights.scroll = 90;

		// WHEN: An auto-growing field is rendered.
		const { container } = render(TextField, {
			id: 'f',
			label: 'F',
			multiline: true,
			rows: 1,
			autoGrow: true
		});

		// THEN: Its height follows the content and it cannot be dragged or scrolled by hand.
		const field = textarea(container);
		expect(field.style.height).toBe('90px');
		expect(field.classList.contains('resize-none')).toBe(true);
		expect(field.classList.contains('overflow-hidden')).toBe(true);
		expect(field.rows).toBe(1);
	});

	it('grows on input and shrinks back (happy path)', async () => {
		// GIVEN: A one-line field.
		layout.heights.scroll = 30;
		const { container } = render(TextField, {
			id: 'f',
			label: 'F',
			multiline: true,
			rows: 1,
			autoGrow: true
		});
		const field = textarea(container);

		// WHEN: A long text is typed, then deleted.
		layout.heights.scroll = 120;
		await fireEvent.input(field, { target: { value: 'long '.repeat(80) } });
		expect(field.style.height).toBe('120px');
		layout.heights.scroll = 30;
		await fireEvent.input(field, { target: { value: '' } });

		// THEN: The height follows.
		expect(field.style.height).toBe('30px');
	});

	it('measures again when the width changes (limit)', () => {
		// GIVEN: A field sized at 30 px.
		layout.heights.scroll = 30;
		const { container } = render(TextField, {
			id: 'f',
			label: 'F',
			multiline: true,
			autoGrow: true
		});

		// WHEN: The column gets narrower, so the same text needs more lines.
		layout.heights.scroll = 75;
		layout.heights.width = 120;
		layout.resize();

		// THEN: The height is updated.
		expect(textarea(container).style.height).toBe('75px');
	});

	it('does not measure again when only its own height changed (no layout loop)', () => {
		// GIVEN: A field sized at 30 px, whose own height then changes the observer.
		layout.heights.scroll = 30;
		const { container } = render(TextField, {
			id: 'f',
			label: 'F',
			multiline: true,
			autoGrow: true
		});
		layout.heights.scroll = 99;

		// WHEN: The observer reports with the same width.
		layout.resize();

		// THEN: The field is left alone.
		expect(textarea(container).style.height).toBe('30px');
	});

	it('is off by default: no inline height, no fixed classes (limit)', async () => {
		// GIVEN / WHEN: A multiline field without the option.
		layout.heights.scroll = 90;
		const { container } = render(TextField, { id: 'f', label: 'F', multiline: true, rows: 3 });
		const field = textarea(container);
		await fireEvent.input(field, { target: { value: 'x' } });

		// THEN: It behaves as before.
		expect(field.style.height).toBe('');
		expect(field.classList.contains('resize-none')).toBe(false);
	});

	it('ignores the option on a single-line field (limit)', () => {
		// GIVEN / WHEN: autoGrow without multiline.
		layout.heights.scroll = 90;
		const { container } = render(TextField, { id: 'f', label: 'F', autoGrow: true });

		// THEN: A plain input, untouched.
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.style.height).toBe('');
	});

	it('still sizes the field without ResizeObserver (exception)', () => {
		// GIVEN: A browser with no ResizeObserver.
		vi.stubGlobal('ResizeObserver', undefined);
		layout.heights.scroll = 60;

		// WHEN / THEN: The first size is applied and nothing throws.
		const { container } = render(TextField, {
			id: 'f',
			label: 'F',
			multiline: true,
			autoGrow: true
		});
		expect(textarea(container).style.height).toBe('60px');
	});
});
