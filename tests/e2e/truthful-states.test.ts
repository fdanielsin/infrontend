import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './support/axe';
import { horizontalOverflow } from './support/layout';
import { ada, grace, mockApi, type MockTask } from './support/mock-api';

// What a screen says when it has nothing to show must be true: a failure is not an empty list, and
// nothing to count is not a row of zeros. The API is mocked; the page is a production build.
// The states themselves (wait, failure, retry, nothing to count) and what a change of user must not
// carry over are tested by StatsPage.states.test.ts and HomePage.userSwitch.test.ts; only what needs
// a browser is kept here.

const adaTasks: MockTask[] = [
	{ id: 10, title: 'Zebra', description: 'Last by title', user_id: 1, completed: false },
	{ id: 11, title: 'Apple', description: 'First by title', user_id: 1, completed: false }
];
const graceTasks: MockTask[] = [
	{ id: 20, title: 'Mango', description: 'Hers', user_id: 2, completed: false },
	{ id: 21, title: 'Berry', description: 'Hers too', user_id: 2, completed: false }
];

test.describe('Statistics page states (mocked API)', () => {
	test('a failure is retried with one request, then nothing to count invites to create a user, also at 320 px (sad path)', async ({
		page
	}) => {
		// GIVEN: A first statistics call that fails, and nothing to count behind it. (No entry
		// animation: axe reads the toast where it rests, not mid-slide.)
		await page.emulateMedia({ reducedMotion: 'reduce' });
		const api = await mockApi(page, { users: [], tasks: [] });
		api.failNext('GET /stats', { status: 500, error: 'boom' });

		// WHEN: The page is shown.
		await page.goto('/stats');
		await expect(page.getByText('Statistics could not be loaded.')).toBeVisible();

		// THEN: The failure state has no violation.
		await expectNoAxeViolations(page);

		// WHEN: Retry is double-clicked.
		await page
			.getByRole('button', { name: 'Retry' })
			.dblclick({ noWaitAfter: true })
			.catch(() => {});

		// THEN: The invitation replaces the failure, after one more request in all, with no violation.
		await expect(page.getByText('Nothing to count yet.')).toBeVisible();
		expect(api.calls.filter((call) => call === 'GET /stats')).toHaveLength(2);
		await expectNoAxeViolations(page);

		// WHEN: The window is as narrow as a phone.
		await page.setViewportSize({ width: 320, height: 640 });

		// THEN: Nothing is wider than the window, and the link leads to the home page.
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		await page.getByRole('link', { name: 'Create the first user' }).click();
		await expect(page).toHaveURL(/\/$/);
	});
});

test.describe('Changing the selected user (mocked API)', () => {
	test('the chosen sort order survives the change, and the focus stays on the row (happy path)', async ({
		page
	}) => {
		// GIVEN: Ada's tasks sorted by title.
		await mockApi(page, { users: [ada, grace], tasks: [...adaTasks, ...graceTasks] });
		await page.goto('/');
		await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
		await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();
		await page.getByLabel('Sort by', { exact: true }).selectOption('title');
		await expect(page.locator('li label')).toHaveText(['Apple', 'Zebra']);

		// WHEN: Grace is selected from the keyboard (Safari does not focus a clicked button).
		const graceRow = page.getByRole('button', { name: /^Grace Hopper [^(]/ });
		await graceRow.focus();
		await graceRow.press('Enter');
		await page.getByRole('heading', { name: 'Tasks for Grace Hopper' }).waitFor();

		// THEN: Her tasks come sorted by title too (the order is global), and the row kept the focus.
		await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('title');
		await expect(page.locator('li label')).toHaveText(['Berry', 'Mango']);
		await expect(graceRow).toBeFocused();
	});
});
