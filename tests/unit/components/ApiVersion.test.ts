import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { api } from '$lib/api/client';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';
import ApiVersion from '$lib/features/availability/ApiVersion.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({ api: { ready: vi.fn(), health: vi.fn() } }));

const READY = { success: true as const, data: { status: 'ready' as const } };
const health = (version: string) => ({
	success: true as const,
	data: { id: 'b868c6a6-2f9d-42fd-a9c5-8c7e342f78dd', status: 'ok' as const, version }
});

describe('API version in the footer', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(api.ready).mockResolvedValue(READY);
		app = new AppState();
	});

	afterEach(() => {
		app.availability.destroy();
		cleanup();
		overwriteGetLocale(() => 'en');
	});

	it('shows the version the API reports (happy path)', async () => {
		vi.mocked(api.health).mockResolvedValue(health('1.2.0'));

		const view = renderWithApp(app, ApiVersion);

		expect(await view.findByText('API 1.2.0')).toBeTruthy();
	});

	it('shows nothing, and no error, when /health fails (sad path)', async () => {
		vi.mocked(api.health).mockResolvedValue({ success: false, error: 'HTTP 500', status: 500 });

		const view = renderWithApp(app, ApiVersion);
		await vi.waitFor(() => expect(api.health).toHaveBeenCalled());

		expect(view.queryByText(/API/)).toBeNull();
		expect(app.notifications.items).toEqual([]);
		expect(view.container.querySelector('footer')).not.toBeNull();
	});

	it('does not ask while the service is down, and asks again when it is back (limit)', async () => {
		vi.useFakeTimers();
		vi.mocked(api.ready).mockResolvedValue({ success: false, error: 'x', status: 503 });
		vi.mocked(api.health).mockResolvedValue(health('1.2.0'));
		const view = renderWithApp(app, ApiVersion);
		await vi.advanceTimersByTimeAsync(0);
		expect(api.health).not.toHaveBeenCalled();

		vi.mocked(api.ready).mockResolvedValue(READY);
		await vi.advanceTimersByTimeAsync(60_000);
		vi.useRealTimers();

		expect(await view.findByText('API 1.2.0')).toBeTruthy();
	});

	it('renders the version as text, never as markup (exception)', async () => {
		vi.mocked(api.health).mockResolvedValue(health('<b>1</b>'));

		const view = renderWithApp(app, ApiVersion);

		expect(await view.findByText('API <b>1</b>')).toBeTruthy();
		expect(view.container.querySelector('footer b')).toBeNull();
	});

	it('breaks a long version instead of overflowing (limit)', async () => {
		vi.mocked(api.health).mockResolvedValue(health('1.2.0-' + 'x'.repeat(194)));

		const view = renderWithApp(app, ApiVersion);

		expect((await view.findByText(/^API 1\.2\.0-x+$/)).className).toContain('break-all');
	});

	it('keeps a footer of constant height before and after the answer (boundary)', async () => {
		vi.mocked(api.health).mockResolvedValue(health('1.2.0'));
		const view = renderWithApp(app, ApiVersion);
		const footer = view.container.querySelector('footer');
		const before = footer?.className;

		await view.findByText('API 1.2.0');

		expect(view.container.querySelector('footer')?.className).toBe(before);
		expect(before).toContain('min-h-12');
	});
});
