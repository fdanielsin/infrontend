import { describe, expect, it, vi } from 'vitest';
import { oneLine, submitOnEnter } from '$lib/features/tasks/title-field';

function keydown(init: KeyboardEventInit) {
	const form = document.createElement('form');
	form.requestSubmit = vi.fn();
	const field = document.createElement('textarea');
	form.append(field);
	const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
	Object.defineProperty(event, 'currentTarget', { value: field });
	return { event, form };
}

describe('oneLine', () => {
	it.each([
		['a\nb', 'a b'],
		['a\r\nb', 'a b'],
		['a\n\nb', 'a  b'],
		['\n', ' '],
		['', ''],
		['plain', 'plain'],
		['<b>é‮</b>', '<b>é‮</b>']
	])('turns line breaks of %j into spaces (limits)', (input, expected) => {
		expect(oneLine(input)).toBe(expected);
	});
});

describe('submitOnEnter', () => {
	it('submits the form and keeps the line break out on Enter (happy path)', () => {
		const { event, form } = keydown({ key: 'Enter' });
		submitOnEnter(event as KeyboardEvent & { currentTarget: HTMLElement });
		expect(form.requestSubmit).toHaveBeenCalledOnce();
		expect(event.defaultPrevented).toBe(true);
	});

	it('does not submit on Shift+Enter but still refuses the line break (limit)', () => {
		const { event, form } = keydown({ key: 'Enter', shiftKey: true });
		submitOnEnter(event as KeyboardEvent & { currentTarget: HTMLElement });
		expect(form.requestSubmit).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(true);
	});

	it('leaves Enter alone while an IME composition is running (limit)', () => {
		const { event, form } = keydown({ key: 'Enter', isComposing: true });
		submitOnEnter(event as KeyboardEvent & { currentTarget: HTMLElement });
		expect(form.requestSubmit).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it('ignores other keys (limit)', () => {
		const { event, form } = keydown({ key: 'a' });
		submitOnEnter(event as KeyboardEvent & { currentTarget: HTMLElement });
		expect(form.requestSubmit).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it('does not throw when the field is in no form (exception)', () => {
		const field = document.createElement('textarea');
		const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
		Object.defineProperty(event, 'currentTarget', { value: field });
		expect(() =>
			submitOnEnter(event as KeyboardEvent & { currentTarget: HTMLElement })
		).not.toThrow();
	});
});
