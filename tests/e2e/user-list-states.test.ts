import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ada, mockApi } from './support/mock-api';

// The list of users never claims "No users yet" nor a count of 0 for data that is only unknown.
// The API is mocked.

test.describe('User list states (mocked API)', () => {
	test('says the list waits for the service during an outage (banner shown), never "No users yet" (sad path)', async ({
		page
	}) => {
		// GIVEN: The service does not answer its readiness check: the banner is shown.
		const api = await mockApi(page, { users: [ada] });
		api.readiness = 'unreachable';

		// WHEN: The home page opens.
		await page.goto('/');

		// THEN: The list says it waits; it neither shows a zero count nor an empty state.
		await expect(page.getByText('Users will show as soon as the service is back.')).toBeVisible();
		await expect(page.getByText('No users yet')).toHaveCount(0);
		await expect(page.getByText('Users (0)')).toHaveCount(0);
	});

	test('after a failure that is no outage, offers Retry and lists the users (limit)', async ({
		page
	}) => {
		// GIVEN: The first load fails with a 404, which says nothing about the service.
		const api = await mockApi(page, { users: [ada] });
		api.failNext('GET /users', { status: 404, error: 'Not found', code: 'ROUTE_NOT_FOUND' });
		await page.goto('/');
		const retry = page.getByRole('button', { name: 'Retry' });
		await expect(page.getByText('Users could not be loaded.')).toBeVisible();
		await expect(page.getByText('No users yet')).toHaveCount(0);

		// WHEN: Retry is pressed.
		await retry.click();

		// THEN: The users are listed.
		await expect(page.getByRole('button', { name: /^Ada Lovelace [^(]/ })).toBeVisible();
		await expect(page.getByText('Users (1)')).toBeVisible();
	});

	test('the failed list has no accessibility violation at 320 px (exception)', async ({ page }) => {
		// GIVEN: A narrow screen and a failed load.
		await page.setViewportSize({ width: 320, height: 640 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const api = await mockApi(page, { users: [ada] });
		api.failNext('GET /users', { status: 404, error: 'Not found', code: 'ROUTE_NOT_FOUND' });

		// WHEN: The home page opens.
		await page.goto('/');
		await expect(page.getByText('Users could not be loaded.')).toBeVisible();

		// THEN: No horizontal scroll, no violation.
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
		const { violations } = await new AxeBuilder({ page }).analyze();
		expect(violations.map((violation) => violation.id)).toEqual([]);
	});
});
