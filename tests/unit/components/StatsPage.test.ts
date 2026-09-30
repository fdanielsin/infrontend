import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { api, type ApiResult, type Stats } from '$lib/api/client';
import { notifications } from '$lib/stores/notification';
import StatsPage from '../../../src/routes/stats/+page.svelte';

vi.mock('$lib/api/client', () => ({
	api: { getStats: vi.fn() }
}));

function averageText(container: HTMLElement): string | undefined {
	const item = Array.from(container.querySelectorAll('li')).find((li) =>
		li.textContent?.includes('Moyenne')
	);
	return item?.querySelector('strong')?.textContent ?? undefined;
}

describe('stats page', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('shows the counters and the average rounded to 2 decimals (happy path)', async () => {
		// GIVEN: 3 users and 10 tasks.
		vi.mocked(api.getStats).mockResolvedValue({ success: true, data: { users: 3, tasks: 10 } });

		// WHEN: The page is rendered.
		const { findByText, container } = render(StatsPage);

		// THEN: Both counters and 10 / 3 rounded are shown.
		expect(await findByText('Résumé')).toBeTruthy();
		const strongs = Array.from(container.querySelectorAll('li strong')).map((s) => s.textContent);
		expect(strongs).toEqual(['3', '10', '3.33']);
	});

	it('shows 0 as the average when there is no user (boundary)', async () => {
		// GIVEN: No user but 2 tasks (orphan tasks are possible, B-02).
		vi.mocked(api.getStats).mockResolvedValue({ success: true, data: { users: 0, tasks: 2 } });

		// WHEN: The page is rendered.
		const { findByText, container } = render(StatsPage);

		// THEN: The average is 0, not NaN or Infinity.
		await findByText('Résumé');
		expect(averageText(container)).toBe('0');
	});

	it('shows the API error (sad path)', async () => {
		// GIVEN: The API reports a failure.
		vi.mocked(api.getStats).mockResolvedValue({ success: false, error: 'HTTP 500' });

		// WHEN: The page is rendered.
		const { findByText } = render(StatsPage);

		// THEN: The error is displayed.
		expect(await findByText('❌ Erreur: HTTP 500')).toBeTruthy();
	});

	it('rounds a repeating average to 2 decimals (limit)', async () => {
		// GIVEN: 3 users and 1 task.
		vi.mocked(api.getStats).mockResolvedValue({ success: true, data: { users: 3, tasks: 1 } });

		// WHEN: The page is rendered.
		const { findByText, container } = render(StatsPage);

		// THEN: 1 / 3 is shown as 0.33.
		await findByText('Résumé');
		expect(averageText(container)).toBe('0.33');
	});

	it('notifies a stats failure as an error (sad path, QM-02)', async () => {
		// GIVEN: The API reports a failure.
		notifications.set([]);
		vi.mocked(api.getStats).mockResolvedValue({ success: false, error: 'HTTP 500' });

		// WHEN: The page is rendered.
		const { findByText } = render(StatsPage);

		// THEN: The error is displayed and notified.
		await findByText('❌ Erreur: HTTP 500');
		expect(get(notifications)).toEqual([
			expect.objectContaining({ message: 'HTTP 500', type: 'error' })
		]);
		notifications.set([]);
	});

	it('shows the loading state until the answer, then the error when the call throws (exception)', async () => {
		// GIVEN: A request that is still pending.
		let fail!: (reason: Error) => void;
		vi.mocked(api.getStats).mockReturnValue(
			new Promise<ApiResult<Stats>>((_resolve, reject) => (fail = reject))
		);

		// WHEN: The page is rendered.
		const { getByText, findByText, queryByText } = render(StatsPage);

		// THEN: The loading message is shown, then replaced by the error.
		expect(getByText('Chargement des statistiques...')).toBeTruthy();
		fail(new Error('Failed to fetch'));
		expect(await findByText('❌ Erreur: Failed to fetch')).toBeTruthy();
		expect(queryByText('Chargement des statistiques...')).toBeNull();
	});
});
