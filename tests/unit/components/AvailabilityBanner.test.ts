import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, within } from '@testing-library/svelte';
import { api } from '$lib/api/client';
import { overwriteGetLocale, type Locale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';
import AvailabilityBanner from '$lib/features/availability/AvailabilityBanner.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({ api: { ready: vi.fn() } }));

const READY = { success: true as const, data: { status: 'ready' as const } };
const OUTAGE = { success: false as const, error: 'x', status: 503 };

describe('availability banner', () => {
	let app: AppState;
	const ready = () => vi.mocked(api.ready);

	beforeEach(() => {
		vi.resetAllMocks();
		app = new AppState();
	});

	afterEach(() => {
		app.availability.destroy();
		cleanup();
		document.body.innerHTML = '';
		overwriteGetLocale(() => 'en');
	});

	async function showOutage() {
		ready().mockResolvedValue(OUTAGE);
		const view = renderWithApp(app, AvailabilityBanner);
		await app.availability.check();
		return view;
	}

	it('shows nothing while the state is unknown or available, but keeps its container (limit)', async () => {
		const view = renderWithApp(app, AvailabilityBanner);

		expect(view.container.querySelector('[data-availability]')).not.toBeNull();
		expect(view.queryByRole('alert')).toBeNull();
		expect(view.queryByRole('button')).toBeNull();

		ready().mockResolvedValue(READY);
		await app.availability.check();
		expect(view.queryByRole('alert')).toBeNull();
		expect(view.container.querySelector('[data-availability]')).not.toBeNull();
	});

	it('does not flash while a first check is pending (boundary)', () => {
		ready().mockReturnValue(new Promise(() => {}));
		const view = renderWithApp(app, AvailabilityBanner);

		void app.availability.check();

		expect(view.queryByRole('alert')).toBeNull();
		expect(view.queryByRole('button')).toBeNull();
	});

	it('announces the outage in an alert, with the retry button outside of it (happy path)', async () => {
		const view = await showOutage();

		const alert = await view.findByRole('alert');
		expect(alert.textContent).toContain('currently unavailable');
		const retry = view.getByRole('button', { name: 'Retry' });
		expect(alert.contains(retry)).toBe(false);
	});

	it('shows the server reference of the outage with a copy button, outside the alert (happy path)', async () => {
		ready().mockResolvedValue({ ...OUTAGE, requestId: 'req-503' });
		const view = renderWithApp(app, AvailabilityBanner);
		await app.availability.check();

		const reference = await view.findByText('Reference: req-503');
		const alert = view.getByRole('alert');
		expect(alert.contains(reference)).toBe(false);
		expect(alert.textContent).not.toContain('req-503');
		expect(view.getByRole('button', { name: 'Copy reference req-503' })).toBeTruthy();
	});

	it('copies it and confirms in the status region (happy path)', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
		ready().mockResolvedValue({ ...OUTAGE, requestId: 'req-503' });
		const view = renderWithApp(app, AvailabilityBanner);
		await app.availability.check();

		await fireEvent.click(await view.findByRole('button', { name: /Copy reference/ }));

		expect(writeText).toHaveBeenCalledWith('req-503');
		await vi.waitFor(() =>
			expect(app.notifications.items).toEqual([
				expect.objectContaining({ message: 'Reference copied', type: 'success' })
			])
		);
		vi.unstubAllGlobals();
	});

	it('shows no reference and no copy button when the outage has none (boundary)', async () => {
		const view = await showOutage();

		await view.findByRole('alert');
		expect(view.queryByText(/Reference/)).toBeNull();
		expect(view.queryByRole('button', { name: /Copy/ })).toBeNull();
	});

	it('retries at once without doubling the request on a second click (happy path)', async () => {
		const view = await showOutage();
		ready().mockClear();
		let answer!: (value: typeof OUTAGE) => void;
		ready().mockReturnValue(new Promise((resolve) => (answer = resolve)));

		await fireEvent.click(await view.findByRole('button', { name: 'Retry' }));
		await fireEvent.click(await view.findByRole('button', { name: 'Checking…' }));

		expect(ready()).toHaveBeenCalledTimes(1);
		answer(OUTAGE);
	});

	it('announces the alert again after a failed retry (sad path)', async () => {
		const view = await showOutage();
		const first = await view.findByRole('alert');

		await fireEvent.click(view.getByRole('button', { name: 'Retry' }));
		await vi.waitFor(() => expect(app.availability.retryFailures).toBe(1));

		// A new element, inserted again: assistive technology reads it again.
		const second = await view.findByRole('alert');
		expect(second).not.toBe(first);
		expect(view.getAllByRole('alert')).toHaveLength(1);
	});

	it('removes the banner and moves the focus to main when the retry succeeds (happy path)', async () => {
		const main = document.createElement('main');
		main.tabIndex = -1;
		document.body.append(main);
		const view = await showOutage();
		const retry = await view.findByRole('button', { name: 'Retry' });
		retry.focus();
		ready().mockResolvedValue(READY);

		await fireEvent.click(retry);

		await vi.waitFor(() => expect(view.queryByRole('alert')).toBeNull());
		await vi.waitFor(() => expect(document.activeElement).toBe(main));
	});

	it('does not touch the focus when the retry fails (boundary)', async () => {
		const main = document.createElement('main');
		main.tabIndex = -1;
		document.body.append(main);
		const view = await showOutage();
		const retry = await view.findByRole('button', { name: 'Retry' });
		retry.focus();

		await fireEvent.click(retry);
		await vi.waitFor(() => expect(app.availability.retryFailures).toBe(1));

		expect(document.activeElement).not.toBe(main);
	});

	it('does not fail when the page has no main landmark (exception)', async () => {
		const view = await showOutage();
		ready().mockResolvedValue(READY);

		await fireEvent.click(await view.findByRole('button', { name: 'Retry' }));

		await vi.waitFor(() => expect(view.queryByRole('alert')).toBeNull());
	});

	it('removes the banner when the service comes back by itself (limit)', async () => {
		const view = await showOutage();
		ready().mockResolvedValue(READY);

		await app.availability.check();

		await vi.waitFor(() => expect(view.queryByRole('alert')).toBeNull());
	});

	it.each([
		['en', 'Retry', 'currently unavailable'],
		['fr', 'Réessayer', 'actuellement indisponible'],
		['de', 'Erneut versuchen', 'derzeit nicht verfügbar'],
		['es', 'Reintentar', 'no está disponible']
	] as [Locale, string, string][])('speaks %s (limit)', async (locale, retry, text) => {
		app.locale.current = locale;
		overwriteGetLocale(() => locale);
		const view = await showOutage();

		expect(within(await view.findByRole('alert')).getByText(new RegExp(text))).toBeTruthy();
		expect(view.getByRole('button', { name: retry })).toBeTruthy();
	});
});
