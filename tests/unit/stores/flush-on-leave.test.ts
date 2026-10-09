import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushOnLeave } from '$lib/state/flush-on-leave';

function setVisibility(state: 'hidden' | 'visible') {
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

describe('flushOnLeave', () => {
	afterEach(() => {
		setVisibility('visible');
	});

	it('flushes when the page becomes hidden (happy path)', () => {
		const flush = vi.fn();
		const stop = flushOnLeave(flush);
		setVisibility('hidden');
		document.dispatchEvent(new Event('visibilitychange'));
		expect(flush).toHaveBeenCalledTimes(1);
		stop();
	});

	it('does not flush when the page becomes visible again (boundary)', () => {
		const flush = vi.fn();
		const stop = flushOnLeave(flush);
		setVisibility('visible');
		document.dispatchEvent(new Event('visibilitychange'));
		expect(flush).not.toHaveBeenCalled();
		stop();
	});

	it('flushes on pagehide, as a safety net (happy path)', () => {
		const flush = vi.fn();
		const stop = flushOnLeave(flush);
		window.dispatchEvent(new Event('pagehide'));
		expect(flush).toHaveBeenCalledTimes(1);
		stop();
	});

	it('stops listening once cleaned up (limit)', () => {
		const flush = vi.fn();
		flushOnLeave(flush)();
		setVisibility('hidden');
		document.dispatchEvent(new Event('visibilitychange'));
		window.dispatchEvent(new Event('pagehide'));
		expect(flush).not.toHaveBeenCalled();
	});
});
