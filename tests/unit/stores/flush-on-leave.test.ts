import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushOnLeave } from '$lib/state/flush-on-leave';

function setVisibility(state: 'hidden' | 'visible') {
	Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function callbacks() {
	return { onHidden: vi.fn(), onVisible: vi.fn(), onLeave: vi.fn() };
}

describe('flushOnLeave', () => {
	afterEach(() => {
		setVisibility('visible');
	});

	it('calls onHidden, and only it, when the page becomes hidden (happy path)', () => {
		const handlers = callbacks();
		const stop = flushOnLeave(handlers);
		setVisibility('hidden');
		document.dispatchEvent(new Event('visibilitychange'));
		expect(handlers.onHidden).toHaveBeenCalledTimes(1);
		expect(handlers.onVisible).not.toHaveBeenCalled();
		expect(handlers.onLeave).not.toHaveBeenCalled();
		stop();
	});

	it('calls onVisible, and only it, when the page comes back (happy path)', () => {
		const handlers = callbacks();
		const stop = flushOnLeave(handlers);
		setVisibility('visible');
		document.dispatchEvent(new Event('visibilitychange'));
		expect(handlers.onVisible).toHaveBeenCalledTimes(1);
		expect(handlers.onHidden).not.toHaveBeenCalled();
		expect(handlers.onLeave).not.toHaveBeenCalled();
		stop();
	});

	it('calls onLeave, and only it, on pagehide (happy path)', () => {
		const handlers = callbacks();
		const stop = flushOnLeave(handlers);
		window.dispatchEvent(new Event('pagehide'));
		expect(handlers.onLeave).toHaveBeenCalledTimes(1);
		expect(handlers.onHidden).not.toHaveBeenCalled();
		expect(handlers.onVisible).not.toHaveBeenCalled();
		stop();
	});

	it('calls onLeave even for a page kept in the back/forward cache (limit)', () => {
		const handlers = callbacks();
		const stop = flushOnLeave(handlers);
		window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
		expect(handlers.onLeave).toHaveBeenCalledTimes(1);
		stop();
	});

	it('stops listening once cleaned up (limit)', () => {
		const handlers = callbacks();
		flushOnLeave(handlers)();
		setVisibility('hidden');
		document.dispatchEvent(new Event('visibilitychange'));
		setVisibility('visible');
		document.dispatchEvent(new Event('visibilitychange'));
		window.dispatchEvent(new Event('pagehide'));
		expect(handlers.onHidden).not.toHaveBeenCalled();
		expect(handlers.onVisible).not.toHaveBeenCalled();
		expect(handlers.onLeave).not.toHaveBeenCalled();
	});
});
