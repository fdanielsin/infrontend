import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/svelte';
import { api } from '$lib/api/client';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';
import StatsPage from '../../../src/routes/stats/+page.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({
	api: { getStats: vi.fn(), ready: vi.fn() }
}));

const READY = { success: true as const, data: { status: 'ready' as const } };
const OUTAGE = { success: false as const, error: 'x', status: 503 };
const STATS = { success: true as const, data: { users: 3, tasks: 10 } };

// What the statistics page says while it has nothing to show: it must never claim to be loading
// when nothing is, nor show zeros that are only "not known yet".
describe('statistics page states', () => {
	let app: AppState;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetAllMocks();
		vi.mocked(api.ready).mockResolvedValue(READY);
		app = new AppState();
	});

	afterEach(() => {
		app.availability.destroy();
		cleanup();
		document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
		overwriteGetLocale(() => 'en');
		vi.useRealTimers();
	});

	it('says the statistics wait for the service during an outage, with no endless loading (sad path)', async () => {
		// GIVEN: The service is down when the page opens.
		vi.mocked(api.ready).mockResolvedValue(OUTAGE);

		// WHEN: The page is rendered and some time passes.
		const { queryByText, getByText, queryByRole } = renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(30_000);

		// THEN: It explains the wait; it does not claim to load, nor offer a second retry button.
		expect(getByText('Statistics will show as soon as the service is back.')).toBeTruthy();
		expect(queryByText('Loading statistics…')).toBeNull();
		expect(queryByRole('button')).toBeNull();
		expect(api.getStats).not.toHaveBeenCalled();
	});

	it('shows the counters when the service comes back (happy path)', async () => {
		// GIVEN: An outage at load.
		vi.mocked(api.ready).mockResolvedValue(OUTAGE);
		vi.mocked(api.getStats).mockResolvedValue(STATS);
		const { getByText, queryByText } = renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(0);

		// WHEN: The service is back and the first retry comes.
		vi.mocked(api.ready).mockResolvedValue(READY);
		await vi.advanceTimersByTimeAsync(6_000);

		// THEN: The wait message gives way to the figures.
		expect(queryByText('Statistics will show as soon as the service is back.')).toBeNull();
		expect(getByText('Average tasks per user')).toBeTruthy();
		expect(api.getStats).toHaveBeenCalledTimes(1);
	});

	it('offers a retry after a failure and shows the counters when it works (happy path)', async () => {
		// GIVEN: A failing call.
		vi.mocked(api.getStats).mockResolvedValueOnce({ success: false, error: 'HTTP 500' });
		const { getByText, getByRole, queryByText } = renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(0);
		expect(getByText('Statistics could not be loaded.')).toBeTruthy();

		// WHEN: The user presses "Retry" and the call works.
		vi.mocked(api.getStats).mockResolvedValueOnce(STATS);
		await fireEvent.click(getByRole('button', { name: 'Retry' }));
		await vi.advanceTimersByTimeAsync(0);

		// THEN: The figures replace the failure state.
		expect(queryByText('Statistics could not be loaded.')).toBeNull();
		expect(getByText('Average tasks per user')).toBeTruthy();
		expect(api.getStats).toHaveBeenCalledTimes(2);
	});

	it('comes back to the failure state, not to a stuck loading, when the retry fails too (exception)', async () => {
		// GIVEN: A failure, then a call that throws.
		vi.mocked(api.getStats).mockResolvedValueOnce({ success: false, error: 'HTTP 500' });
		const { getByText, getByRole, queryByText } = renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(0);
		vi.mocked(api.getStats).mockRejectedValueOnce(new Error('Failed to fetch'));

		// WHEN: The user retries.
		await fireEvent.click(getByRole('button', { name: 'Retry' }));
		await vi.advanceTimersByTimeAsync(0);

		// THEN: The failure state and its button are back.
		expect(getByText('Statistics could not be loaded.')).toBeTruthy();
		expect(queryByText('Loading statistics…')).toBeNull();
		expect(getByRole('button', { name: 'Retry' })).toBeTruthy();
	});

	it('moves the focus to the page, not to the body, when Retry starts loading (happy path)', async () => {
		// GIVEN: A failure state with the focus on "Retry".
		vi.mocked(api.getStats).mockResolvedValueOnce({ success: false, error: 'HTTP 500' });
		const { getByRole } = renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(0);
		const retry = getByRole('button', { name: 'Retry' });
		retry.focus();
		vi.mocked(api.getStats).mockReturnValueOnce(new Promise(() => {}));

		// WHEN: It is pressed and the button gives way to the loading state.
		await fireEvent.click(retry);
		await vi.advanceTimersByTimeAsync(0);

		// THEN: The focus is on <main>, never on <body> (WCAG 2.4.3).
		expect(document.activeElement?.tagName).toBe('MAIN');
	});

	it('gives the focus back to Retry when the retry fails and the button comes back (exception)', async () => {
		// GIVEN: A failure state, the focus on "Retry".
		vi.mocked(api.getStats).mockResolvedValueOnce({ success: false, error: 'HTTP 500' });
		const { getByRole } = renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(0);
		getByRole('button', { name: 'Retry' }).focus();
		vi.mocked(api.getStats).mockResolvedValueOnce({ success: false, error: 'HTTP 500' });

		// WHEN: Retry is pressed and fails again.
		await fireEvent.click(getByRole('button', { name: 'Retry' }));
		await vi.advanceTimersByTimeAsync(0);

		// THEN: The new button has the focus, not <main>.
		expect(document.activeElement).toBe(getByRole('button', { name: 'Retry' }));
	});

	it('asks once for two clicks on Retry in a row (boundary)', async () => {
		// GIVEN: A failure state.
		vi.mocked(api.getStats).mockResolvedValueOnce({ success: false, error: 'HTTP 500' });
		const { getByRole } = renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(0);
		const retry = getByRole('button', { name: 'Retry' });
		vi.mocked(api.getStats).mockResolvedValue(STATS);

		// WHEN: The button is clicked twice without waiting.
		await fireEvent.click(retry);
		await fireEvent.click(retry);
		await vi.advanceTimersByTimeAsync(0);

		// THEN: One retry was made (the button is gone as soon as the first one starts).
		expect(api.getStats).toHaveBeenCalledTimes(2);
	});

	it('invites to create a user when there is nothing to count (limit)', async () => {
		// GIVEN: No user and no task.
		vi.mocked(api.getStats).mockResolvedValue({ success: true, data: { users: 0, tasks: 0 } });

		// WHEN: The page is rendered.
		const { getByText, getByRole, queryByText } = renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(0);

		// THEN: An invitation with a link to the home page replaces the zero tiles and the summary.
		expect(getByText('Nothing to count yet.')).toBeTruthy();
		const link = getByRole('link', { name: 'Create the first user' });
		expect(link.getAttribute('href')).toBe('/');
		expect(queryByText('Average tasks per user')).toBeNull();
	});

	it.each([
		['one task, no user', { users: 0, tasks: 1 }],
		['one user, no task', { users: 1, tasks: 0 }]
	])('keeps the tiles for %s: not empty (boundary)', async (_name, data) => {
		// GIVEN: Counters that are not both zero.
		vi.mocked(api.getStats).mockResolvedValue({ success: true, data });

		// WHEN: The page is rendered.
		const { getByText, queryByText } = renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(0);

		// THEN: The summary shows, with no invitation.
		expect(getByText('Average tasks per user')).toBeTruthy();
		expect(queryByText('Nothing to count yet.')).toBeNull();
	});

	it.each([
		['fr', 'Impossible de charger les statistiques.', 'Réessayer'],
		['de', 'Die Statistiken konnten nicht geladen werden.', 'Erneut versuchen'],
		['es', 'No se pudieron cargar las estadísticas.', 'Reintentar']
	] as const)('words the failure state in %s (happy path)', async (locale, text, retry) => {
		// GIVEN: The interface in that language and a failing call.
		app.locale.set(locale);
		vi.mocked(api.getStats).mockResolvedValue({ success: false, error: 'HTTP 500' });

		// WHEN: The page is rendered.
		const { getByText, getByRole } = renderWithApp(app, StatsPage);
		await vi.advanceTimersByTimeAsync(0);

		// THEN: The state and the button follow the language.
		expect(getByText(text)).toBeTruthy();
		expect(getByRole('button', { name: retry })).toBeTruthy();
	});
});
