import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// How long an error toast stays (WCAG 2.2.1): an error the user cannot fix (5xx, no answer) stays
// until it is closed, so that its reference can be copied; a refusal the user can fix leaves after
// 6 s. A frozen clock is moved by the test. The API is mocked.

const TEN_MINUTES = 10 * 60 * 1000;
const alertToasts = (page: Page) => page.getByRole('alert').locator('[data-toast]');
const horizontalOverflow = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// The clock is frozen: no timer runs unless the test moves it, so that "exactly 6 s" is exact. Motion
// is off so that the contrast is measured on a toast that has finished sliding in.
async function openWithClock(page: Page) {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.clock.install({ time: 0 });
	await page.clock.pauseAt(1000);
	const api = await mockApi(page, { users: [ada], tasks: adaTasks });
	await openHomeWithUser(page);
	return api;
}

test.describe('Error toast duration (mocked API)', () => {
	test('a server error stays far beyond 6 s, with its reference, until it is closed (happy path)', async ({
		page
	}) => {
		// GIVEN: A toggle that fails with a 500 carrying a reference.
		const api = await openWithClock(page);
		api.failNext('PUT /tasks/{id}', {
			status: 500,
			error: 'Database unavailable',
			requestId: 'req-persistent-500'
		});

		// WHEN: The task is toggled and ten minutes pass.
		await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
		const toast = alertToasts(page).filter({ hasText: 'Database unavailable' });
		await expect(toast).toBeVisible();
		await page.clock.runFor(TEN_MINUTES);

		// THEN: The toast and its reference are still there.
		await expect(toast).toBeVisible();
		await expect(toast.getByText('Reference: req-persistent-500')).toBeVisible();

		// WHEN: It is closed.
		await toast.getByRole('button', { name: 'Dismiss notification' }).click();

		// THEN: It is gone.
		await expect(alertToasts(page)).toHaveCount(0);
	});

	test('a refusal the user can fix leaves after exactly 6 s (limit)', async ({ page }) => {
		// GIVEN: A toggle that is refused with a 400.
		const api = await openWithClock(page);
		api.failNext('PUT /tasks/{id}', { status: 400, error: 'Title is not valid' });

		// WHEN: The task is toggled.
		await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
		const toast = alertToasts(page).filter({ hasText: 'Title is not valid' });
		await expect(toast).toBeVisible();

		// THEN: Still there at 5999 ms, gone at 6000 ms.
		await page.clock.runFor(5_999);
		await expect(toast).toBeVisible();
		await page.clock.runFor(1);
		await expect(toast).toHaveCount(0);
	});

	test('a network failure stays, and the same failure twice makes one toast (boundary)', async ({
		page
	}) => {
		// GIVEN: A deletion that never reaches the server.
		await openWithClock(page);
		await page.route('**/api/v1/tasks/*', (route) =>
			route.request().method() === 'DELETE' ? route.abort('connectionrefused') : route.fallback()
		);

		// WHEN: Two deletions fail the same way, then a minute passes.
		await page.getByRole('button', { name: 'Delete Review 2' }).click();
		await expect(alertToasts(page)).toHaveCount(1);
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();
		await page.clock.runFor(60_000);

		// THEN: One toast, not two, and it has not left.
		await expect(alertToasts(page)).toHaveCount(1);
	});

	test('two server errors with different references make two toasts, each closed on its own (limit)', async ({
		page
	}) => {
		// GIVEN: Two failing toggles, one reference each.
		const api = await openWithClock(page);
		for (const [title, requestId] of [
			['Review', 'req-a'],
			['Review 2', 'req-b']
		] as const) {
			api.failNext('PUT /tasks/{id}', { status: 500, error: 'Database unavailable', requestId });
			await page.getByRole('checkbox', { name: title, exact: true }).click();
			await expect(page.getByText(`Reference: ${requestId}`)).toBeVisible();
		}

		// WHEN: One is closed.
		await alertToasts(page)
			.filter({ hasText: 'req-a' })
			.getByRole('button', { name: 'Dismiss notification' })
			.click();

		// THEN: The other stays.
		await expect(alertToasts(page)).toHaveCount(1);
		await expect(page.getByText('Reference: req-b')).toBeVisible();
	});

	test('a persistent toast with a long reference has no violation and fits at 320 px (exception)', async ({
		page
	}) => {
		// GIVEN: A narrow screen and a server error whose reference is long.
		await page.setViewportSize({ width: 320, height: 640 });
		const api = await openWithClock(page);
		api.failNext('PUT /tasks/{id}', {
			status: 500,
			error: 'Database unavailable',
			requestId: 'r'.repeat(64)
		});

		// WHEN: It is shown for a long time.
		await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
		await expect(alertToasts(page)).toHaveCount(1);
		await page.clock.runFor(TEN_MINUTES);

		// THEN: No horizontal scroll, no accessibility violation.
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		const { violations } = await new AxeBuilder({ page }).analyze();
		expect(violations.map((violation) => violation.id)).toEqual([]);
	});
});
