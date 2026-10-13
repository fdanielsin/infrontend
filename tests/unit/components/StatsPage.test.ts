import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { api, type ApiResult, type Stats } from '$lib/api/client';
import { overwriteGetLocale } from '$lib/paraglide/runtime';
import { AppState } from '$lib/state/app-state.svelte';
import StatsPage from '../../../src/routes/stats/+page.svelte';
import { renderWithApp } from '../support/render-with-app';

vi.mock('$lib/api/client', () => ({
	api: { getStats: vi.fn(), ready: vi.fn(), deleteUser: vi.fn(), deleteTask: vi.fn() }
}));

// The three tiles, in reading order: [users, tasks, average tasks per user].
function tileValues(container: HTMLElement): (string | undefined)[] {
	return Array.from(container.querySelectorAll('[data-stat]')).map((tile) =>
		tile.querySelector('[data-stat-value]')?.textContent?.trim()
	);
}

function averageText(container: HTMLElement): string | undefined {
	return tileValues(container)[2];
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
		expect(await findByText('Average tasks per user')).toBeTruthy();
		expect(tileValues(container)).toEqual(['3', '10', '3.33']);
	});

	describe('deletions still waiting (USER-R20, critère 38)', () => {
		const ada = { id: 1, name: 'Ada', email: 'ada@example.com' };
		const bob = { id: 2, name: 'Bob', email: 'bob@example.com' };

		it('sends the user and the task deletions first, and reads the counters after their answers', async () => {
			// GIVEN: A user and a task of another user, both waiting for their deletion.
			const order: string[] = [];
			vi.mocked(api.deleteUser).mockImplementation(() => {
				order.push('deleteUser');
				return Promise.resolve({ success: true });
			});
			vi.mocked(api.deleteTask).mockImplementation(() => {
				order.push('deleteTask');
				return Promise.resolve({ success: true });
			});
			vi.mocked(api.getStats).mockImplementation(() => {
				order.push('getStats');
				return Promise.resolve({ success: true, data: { users: 1, tasks: 0 } });
			});
			app.users.users = [ada, bob];
			app.tasks.clear(bob.id);
			app.tasks.tasks = [{ id: 7, title: 'T', description: '', user_id: 2, completed: false }];
			app.tasks.remove(7);
			app.users.remove(ada.id);

			// WHEN: The page is opened.
			const { findByText, container } = renderWithApp(app, StatsPage);
			await findByText('Average tasks per user');

			// THEN: Both deletions went once, before the counters, and their toasts are gone.
			expect(order.at(-1)).toBe('getStats');
			expect(order.slice(0, 2).sort()).toEqual(['deleteTask', 'deleteUser']);
			expect(order).toHaveLength(3);
			expect(app.notifications.items).toEqual([]);
			expect(tileValues(container)).toEqual(['1', '0', '0.00']);
		});

		it('sends nothing but the read of the counters when nothing waits (boundary)', async () => {
			vi.mocked(api.getStats).mockResolvedValue({ success: true, data: { users: 3, tasks: 10 } });

			const { findByText } = renderWithApp(app, StatsPage);
			await findByText('Average tasks per user');

			expect(api.deleteUser).not.toHaveBeenCalled();
			expect(api.deleteTask).not.toHaveBeenCalled();
			expect(api.getStats).toHaveBeenCalledTimes(1);
		});
	});

	it('shows 0 as the average when there is no user (boundary)', async () => {
		// GIVEN: No user but 2 tasks (orphan tasks are possible, B-02).
		vi.mocked(api.getStats).mockResolvedValue({ success: true, data: { users: 0, tasks: 2 } });

		// WHEN: The page is rendered.
		const { findByText, container } = renderWithApp(app, StatsPage);

		// THEN: The average is 0, not NaN or Infinity.
		await findByText('Average tasks per user');
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
		await findByText('Average tasks per user');
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
		[
			'fr',
			'Statistiques',
			'1\u202f234',
			'2\u202f468',
			'2,00',
			'Nombre moyen de tâches par utilisateur'
		],
		[
			'de',
			'Statistiken',
			'1.234',
			'2.468',
			'2,00',
			'Durchschnittliche Anzahl an Aufgaben pro Benutzer'
		],
		['es', 'Estadísticas', '1234', '2468', '2,00', 'Media de tareas por usuario']
	] as const)(
		'follows the interface language %s for labels, counters and average (happy path)',
		async (locale, heading, users, tasks, average, averageLabel) => {
			// GIVEN: The interface in that language, 1234 users and 2468 tasks.
			app.locale.set(locale);
			vi.mocked(api.getStats).mockResolvedValue({
				success: true,
				data: { users: 1234, tasks: 2468 }
			});

			// WHEN: The page is rendered.
			const { findByRole, findByText, container } = renderWithApp(app, StatsPage);

			// THEN: Heading, counters and the 2-decimal average use the language conventions.
			expect((await findByRole('heading', { level: 1 })).textContent).toContain(heading);
			await findByText(averageLabel);
			expect(tileValues(container)).toEqual([users, tasks, average]);
		}
	);
});
