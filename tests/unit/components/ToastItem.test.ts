import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { NotificationType } from '$lib/state/notification.svelte';
import ToastItem from '$lib/ui/ToastItem.svelte';
import { TOAST_BACKGROUNDS, TOAST_BORDERS } from '$lib/ui/toast-styles';

const BACKGROUND_OF_TYPE: Record<NotificationType, string> = {
	success: 'bg-success',
	error: 'bg-danger',
	info: 'bg-info',
	warning: 'bg-warning'
};

function renderToast(type: NotificationType) {
	return render(ToastItem, {
		toast: { id: 'toast-1', message: 'Hello', type },
		onpause: vi.fn(),
		onresume: vi.fn(),
		ondismiss: vi.fn(),
		onaction: vi.fn(),
		oncopyreference: vi.fn()
	});
}

describe('toast backgrounds', () => {
	afterEach(cleanup);

	it('maps each type to its own background class (happy path)', () => {
		expect(TOAST_BACKGROUNDS).toEqual(BACKGROUND_OF_TYPE);
	});

	it('never gives the information toast the color of an action (limit)', () => {
		expect(TOAST_BACKGROUNDS.info).not.toMatch(/primary|action-strong/);
	});

	for (const [type, background] of Object.entries(BACKGROUND_OF_TYPE)) {
		it(`a ${type} toast carries ${background} and no other toast background (happy path)`, () => {
			const { container } = renderToast(type as NotificationType);
			const toast = container.querySelector('[data-toast]')!;

			expect(toast.classList.contains(background)).toBe(true);
			for (const other of Object.values(BACKGROUND_OF_TYPE).filter((c) => c !== background)) {
				expect(toast.classList.contains(other)).toBe(false);
			}
		});
	}

	const BORDER_OF_TYPE: Record<NotificationType, string> = {
		success: 'border-success-edge',
		error: 'border-danger-edge',
		info: 'border-info-edge',
		warning: 'border-warning-edge'
	};

	for (const [type, border] of Object.entries(BORDER_OF_TYPE)) {
		it(`a ${type} toast has a 4 px left edge of its own, ${border} (happy path)`, () => {
			const { container } = renderToast(type as NotificationType);
			const toast = container.querySelector('[data-toast]')!;

			expect(TOAST_BORDERS[type as NotificationType]).toBe(`border-l-4 ${border}`);
			expect(toast.classList.contains('border-l-4')).toBe(true);
			expect(toast.classList.contains(border)).toBe(true);
			for (const other of Object.values(BORDER_OF_TYPE).filter((c) => c !== border)) {
				expect(toast.classList.contains(other)).toBe(false);
			}
		});
	}
});
