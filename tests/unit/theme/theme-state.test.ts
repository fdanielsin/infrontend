import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppState } from '$lib/state/app-state.svelte';

// THEME-R03 and THEME-R04: choosing changes <html> at once and writes the cookie; being built or
// hydrated writes nothing.
const root = document.documentElement;
const cookies = () => document.cookie;

describe('ThemeState', () => {
	beforeEach(() => {
		root.removeAttribute('data-theme');
		document.cookie = 'theme=; Path=/; Max-Age=0';
	});
	afterEach(() => {
		root.removeAttribute('data-theme');
		document.cookie = 'theme=; Path=/; Max-Age=0';
	});

	it('starts on what the server rendered and writes nothing (happy path)', () => {
		const app = new AppState('dark');
		expect(app.theme.current).toBe('dark');
		expect(root.hasAttribute('data-theme')).toBe(false);
		expect(cookies()).not.toContain('theme=');
	});

	it('writes nothing when built for System either (happy path)', () => {
		document.cookie = 'theme=dark; Path=/';
		expect(new AppState(null).theme.current).toBe('system');
		// A cookie that was there stays there: building the state neither writes nor erases it.
		expect(cookies()).toContain('theme=dark');
	});

	it('sets the attribute and the cookie at an explicit choice (happy path)', () => {
		const app = new AppState(null);
		app.theme.set('dark');
		expect(app.theme.current).toBe('dark');
		expect(root.getAttribute('data-theme')).toBe('dark');
		expect(cookies()).toContain('theme=dark');
		app.theme.set('light');
		expect(root.getAttribute('data-theme')).toBe('light');
		expect(cookies()).toContain('theme=light');
	});

	it('removes the attribute and the cookie at System (boundary)', () => {
		const app = new AppState('dark');
		app.theme.set('dark');
		app.theme.set('system');
		expect(app.theme.current).toBe('system');
		expect(root.hasAttribute('data-theme')).toBe(false);
		expect(cookies()).not.toContain('theme=');
	});

	it('still switches the page when the browser refuses the cookie (limit)', () => {
		const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
		Object.defineProperty(document, 'cookie', {
			configurable: true,
			get: () => '',
			set: () => {
				throw new DOMException('denied', 'SecurityError');
			}
		});
		try {
			const app = new AppState(null);
			expect(() => app.theme.set('dark')).not.toThrow();
			expect(root.getAttribute('data-theme')).toBe('dark');
			expect(app.theme.current).toBe('dark');
		} finally {
			delete (document as unknown as Record<string, unknown>).cookie;
			Object.defineProperty(Document.prototype, 'cookie', original);
		}
	});
});
