import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { api, type ApiResult, type Stats } from '$lib/api/client';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';
import StatsPage from '../../../src/routes/stats/+page.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({
	api: { getStats: vi.fn(), ready: vi.fn() }
}));

function averageText(container: HTMLElement): string | undefined {
	const item = Array.from(container.querySelectorAll('li')).find((li) =>
		li.textContent?.includes('Average tasks per user')
	);
	return item?.querySelector('strong')?.textContent ?? undefined;
}

describe('stats page', () => {
	let app: AppState;

	beforeEach(() => {
		vi.resetAllMocks();
		// The page waits for the readiness check before asking for the counters.
		vi.mocked(api.ready).mockResolvedValue({ success: true, data: { status: 'ready' } });
		app = new AppState();
	});

	afterEach(() => {
		cleanup();
		document.cookie = 'PARAGLIDE_LOCALE=; path=/; max-age=0';
		overwriteGetLocale(() => 'en');
	});

	it('shows the counters and the average rounded to 2 decimals (happy path)', async () => {
		// GIVEN: 3 users and 10 tasks.
		vi.mocked(api.getStats).mockResolvedValue({ success: true, data: { users: 3, tasks: 10 } });

		// WHEN: The page is rendered.
		const { findByText, container } = renderWithApp(app, StatsPage);

		// THEN: Both counters and 10 / 3 rounded are shown.
		expect(await findByText('Summary')).toBeTruthy();
		const strongs = Array.from(container.querySelectorAll('li strong')).map((s) => s.textContent);
		expect(strongs).toEqual(['3', '10', '3.33']);
	});

	it('shows 0 as the average when there is no user (boundary)', async () => {
		// GIVEN: No user but 2 tasks (orphan tasks are possible, B-02).
		vi.mocked(api.getStats).mockResolvedValue({ success: true, data: { users: 0, tasks: 2 } });

		// WHEN: The page is rendered.
		const { findByText, container } = renderWithApp(app, StatsPage);

		// THEN: The average is 0, not NaN or Infinity.
		await findByText('Summary');
		expect(averageText(container)).toBe('0');
	});

	it('shows the API error (sad path)', async () => {
		// GIVEN: The API reports a failure.
		vi.mocked(api.getStats).mockResolvedValue({ success: false, error: 'HTTP 500' });

		// WHEN: The page is rendered.
		const { findByText } = renderWithApp(app, StatsPage);

		// THEN: The page says the statistics could not be loaded (the toast carries the detail).
		expect(await findByText('Statistics could not be loaded.')).toBeTruthy();
	});

	it('rounds a repeating average to 2 decimals (limit)', async () => {
		// GIVEN: 3 users and 1 task.
		vi.mocked(api.getStats).mockResolvedValue({ success: true, data: { users: 3, tasks: 1 } });

		// WHEN: The page is rendered.
		const { findByText, container } = renderWithApp(app, StatsPage);

		// THEN: 1 / 3 is shown as 0.33.
		await findByText('Summary');
		expect(averageText(container)).toBe('0.33');
	});

	it('notifies a stats failure as an error (sad path, QM-02)', async () => {
		// GIVEN: The API reports a failure.
		vi.mocked(api.getStats).mockResolvedValue({ success: false, error: 'HTTP 500' });

		// WHEN: The page is rendered.
		const { findByText } = renderWithApp(app, StatsPage);

		// THEN: The page state is displayed and the error is notified.
		await findByText('Statistics could not be loaded.');
		expect(app.notifications.items).toEqual([
			expect.objectContaining({ message: 'HTTP 500', type: 'error' })
		]);
	});

	it('shows the loading state until the answer, then the error when the call throws (exception)', async () => {
		// GIVEN: A request that is still pending.
		let fail!: (reason: Error) => void;
		vi.mocked(api.getStats).mockReturnValue(
			new Promise<ApiResult<Stats>>((_resolve, reject) => (fail = reject))
		);

		// WHEN: The page is rendered.
		const { getByText, findByText, queryByText } = renderWithApp(app, StatsPage);

		// THEN: The loading message is shown, then replaced by the error.
		expect(getByText('Loading statistics…')).toBeTruthy();
		fail(new Error('Failed to fetch'));
		expect(await findByText('Statistics could not be loaded.')).toBeTruthy();
		expect(queryByText('Loading statistics…')).toBeNull();
	});

	it.each([
		['fr', 'Statistiques', '1\u202f234', '2\u202f468', '2,00'],
		['de', 'Statistiken', '1.234', '2.468', '2,00'],
		['es', 'Estadísticas', '1234', '2468', '2,00']
	] as const)(
		'follows the interface language %s for labels, counters and average (happy path)',
		async (locale, heading, users, tasks, average) => {
			// GIVEN: The interface in that language, 1234 users and 2468 tasks.
			app.locale.set(locale);
			vi.mocked(api.getStats).mockResolvedValue({
				success: true,
				data: { users: 1234, tasks: 2468 }
			});

			// WHEN: The page is rendered.
			const { findByRole, container } = renderWithApp(app, StatsPage);

			// THEN: Heading, counters and the 2-decimal average use the language conventions.
			expect((await findByRole('heading', { level: 1 })).textContent).toContain(heading);
			await findByRole('heading', { level: 2 });
			const strongs = Array.from(container.querySelectorAll('li strong')).map((s) =>
				s.textContent?.trim()
			);
			expect(strongs).toEqual([users, tasks, average]);
		}
	);
});
