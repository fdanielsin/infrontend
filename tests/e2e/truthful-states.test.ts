import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { ada, grace, mockApi, type MockTask } from './support/mock-api';

// What a screen says when it has nothing to show must be true: a wait is not a load, a failure is
// not an empty list, and what was typed for one user does not follow to another.
// The API is mocked; the page is a production build.

type Locale = 'en' | 'fr' | 'de' | 'es';
const LOCALES: Locale[] = ['en', 'fr', 'de', 'es'];
const text = (locale: Locale, key: string) =>
	(JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as Record<string, string>)[key]!;

async function chooseLocaleCookie(context: BrowserContext, locale: Locale) {
	await context.addCookies([
		{ name: 'PARAGLIDE_LOCALE', value: locale, url: 'http://localhost:4173' }
	]);
}

const adaTasks: MockTask[] = [
	{ id: 10, title: 'Zebra', description: 'Last by title', user_id: 1, completed: false },
	{ id: 11, title: 'Apple', description: 'First by title', user_id: 1, completed: false }
];
const graceTasks: MockTask[] = [
	{ id: 20, title: 'Mango', description: 'Hers', user_id: 2, completed: false },
	{ id: 21, title: 'Berry', description: 'Hers too', user_id: 2, completed: false }
];

test.describe('Statistics page states (mocked API)', () => {
	test('an outage shows the wait, never an endless loading, then the figures (sad path)', async ({
		page
	}) => {
		// GIVEN: The service is down when the statistics page opens.
		await page.clock.install();
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		api.readiness = 503;

		// WHEN: The page is shown.
		await page.goto('/stats');

		// THEN: It explains the wait; there is no "Loading…" and no second Retry button.
		await expect(
			page.getByText('Statistics will show as soon as the service is back.')
		).toBeVisible();
		await expect(page.getByText('Loading statistics…')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(1);

		// WHEN: The service is back and the first retry comes.
		api.readiness = 'ready';
		await page.clock.runFor(6_000);

		// THEN: The figures replace the wait.
		await expect(page.getByText('Summary')).toBeVisible();
		await expect(
			page.getByText('Statistics will show as soon as the service is back.')
		).toHaveCount(0);
	});

	test('a failure offers Retry, and Retry brings the figures (happy path)', async ({ page }) => {
		// GIVEN: The statistics call fails once.
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		api.failNext('GET /stats', { status: 500, error: 'boom', code: 'INTERNAL_ERROR' });

		// WHEN: The page is shown, then Retry is pressed.
		await page.goto('/stats');
		await expect(page.getByText('Statistics could not be loaded.')).toBeVisible();
		await page.getByRole('button', { name: 'Retry' }).click();

		// THEN: The figures show and the failure state is gone.
		await expect(page.getByText('Summary')).toBeVisible();
		await expect(page.getByText('Statistics could not be loaded.')).toHaveCount(0);
		expect(api.calls.filter((call) => call === 'GET /stats')).toHaveLength(2);
	});

	test('an unreadable answer is a failure state, not a stuck loading (exception)', async ({
		page
	}) => {
		// GIVEN: A statistics answer that is not the contract's envelope.
		await mockApi(page, { users: [ada] });
		await page.route(/\/api\/v1\/stats$/, (route) =>
			route.request().method() === 'OPTIONS'
				? route.fulfill({
						status: 204,
						headers: {
							'Access-Control-Allow-Origin': '*',
							'Access-Control-Allow-Headers': 'Content-Type'
						}
					})
				: route.fulfill({
						status: 200,
						headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
						body: '{"unexpected": true}'
					})
		);

		// WHEN: The page is shown.
		await page.goto('/stats');

		// THEN: It says the statistics could not be loaded, with its way out.
		await expect(page.getByText('Statistics could not be loaded.')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
		await expect(page.getByText('Loading statistics…')).toHaveCount(0);
	});

	test('nothing to count invites to create a user, with a link home (limit)', async ({ page }) => {
		// GIVEN: No user and no task.
		await mockApi(page, { users: [], tasks: [] });

		// WHEN: The statistics page is shown.
		await page.goto('/stats');

		// THEN: An invitation replaces the zero tiles; its link leads to the home page.
		await expect(page.getByText('Nothing to count yet.')).toBeVisible();
		await expect(page.getByText('Summary')).toHaveCount(0);
		await page.getByRole('link', { name: 'Create the first user' }).click();
		await expect(page).toHaveURL(/\/$/);
	});

	test('one user and no task is not "nothing to count" (boundary)', async ({ page }) => {
		// GIVEN: One user, no task.
		await mockApi(page, { users: [ada], tasks: [] });

		// WHEN: The page is shown.
		await page.goto('/stats');

		// THEN: The figures show, with no invitation.
		await expect(page.getByText('Summary')).toBeVisible();
		await expect(page.getByText('Nothing to count yet.')).toHaveCount(0);
	});

	test('the failure state and the empty invitation have no accessibility violation (sad path)', async ({
		page
	}) => {
		// GIVEN: A failing statistics call.
		const api = await mockApi(page, { users: [] });
		api.failNext('GET /stats', { status: 500, error: 'boom' });

		// WHEN: The failure state shows.
		await page.goto('/stats');
		await expect(page.getByText('Statistics could not be loaded.')).toBeVisible();

		// THEN: It has no violation; after Retry (nothing to count) the invitation has none either.
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
		await page.getByRole('button', { name: 'Retry' }).click();
		await expect(page.getByText('Nothing to count yet.')).toBeVisible();
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	});

	test('the focus never falls on the body when Retry is pressed from the keyboard (happy path)', async ({
		page
	}) => {
		// GIVEN: A failure state, the focus on "Retry".
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		api.failNext('GET /stats', { status: 500, error: 'boom' });
		await page.goto('/stats');
		const retry = page.getByRole('button', { name: 'Retry' });
		await retry.focus();

		// WHEN: Enter is pressed and the figures replace the state.
		await retry.press('Enter');
		await expect(page.getByText('Summary')).toBeVisible();

		// THEN: The focus is on the page (<main>), not on <body>.
		await expect(page.locator('main')).toBeFocused();
	});

	test('two quick clicks on Retry make one more request (boundary)', async ({ page }) => {
		// GIVEN: A failure state.
		const api = await mockApi(page, { users: [ada] });
		api.failNext('GET /stats', { status: 500, error: 'boom' });
		await page.goto('/stats');
		const retry = page.getByRole('button', { name: 'Retry' });
		await expect(retry).toBeVisible();

		// WHEN: It is double-clicked.
		await retry.dblclick({ noWaitAfter: true }).catch(() => {});
		await expect(page.getByText('Summary')).toBeVisible();

		// THEN: The statistics were asked twice in all: the first load and one retry.
		expect(api.calls.filter((call) => call === 'GET /stats')).toHaveLength(2);
	});

	for (const locale of LOCALES) {
		test(`the failure state is worded in ${locale} (happy path)`, async ({ page, context }) => {
			// GIVEN: The interface in that language and a failing call.
			await chooseLocaleCookie(context, locale);
			const api = await mockApi(page, { users: [ada] });
			api.failNext('GET /stats', { status: 500, error: 'boom' });

			// WHEN: The page is shown.
			await page.goto('/stats');

			// THEN: The state and its button follow the language.
			await expect(page.getByText(text(locale, 'stats_load_failed'))).toBeVisible();
			await expect(page.getByRole('button', { name: text(locale, 'stats_retry') })).toBeVisible();
		});
	}
});

test.describe('Changing the selected user (mocked API)', () => {
	async function openWithTwoUsers(page: import('@playwright/test').Page) {
		await mockApi(page, { users: [ada, grace], tasks: [...adaTasks, ...graceTasks] });
		await page.goto('/');
		const adaRow = page.getByRole('button', { name: /Ada Lovelace/ });
		const graceRow = page.getByRole('button', { name: /Grace Hopper/ });
		await adaRow.click();
		await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();
		return { adaRow, graceRow };
	}

	test('the "Title is required" error does not follow to another user (sad path)', async ({
		page
	}) => {
		// GIVEN: The error shown on Ada's form.
		const { adaRow, graceRow } = await openWithTwoUsers(page);
		// (A blank title: the browser's own bubble would stop an empty required field.)
		await page.getByLabel('Task Title').fill('   ');
		await page.getByRole('button', { name: 'Add Task' }).click();
		await expect(page.getByText('Title is required')).toBeVisible();

		// WHEN: Grace is selected, then Ada again.
		await graceRow.click();
		await page.getByRole('heading', { name: 'Tasks for Grace Hopper' }).waitFor();
		await expect(page.getByText('Title is required')).toHaveCount(0);
		await adaRow.click();
		await page.getByRole('heading', { name: 'Tasks for Ada Lovelace' }).waitFor();

		// THEN: It is gone for both, and stays gone after a change of language.
		await expect(page.getByText('Title is required')).toHaveCount(0);
		await page.getByRole('combobox', { name: /Language/i }).selectOption('fr');
		await expect(page.getByText('Title is required')).toHaveCount(0);
	});

	test('a typed draft is not carried to another user (boundary)', async ({ page }) => {
		// GIVEN: A draft typed for Ada.
		const { graceRow } = await openWithTwoUsers(page);
		await page.getByLabel('Task Title').fill('Draft for Ada');

		// WHEN: Grace is selected.
		await graceRow.click();
		await page.getByRole('heading', { name: 'Tasks for Grace Hopper' }).waitFor();

		// THEN: The form is empty.
		await expect(page.getByLabel('Task Title')).toHaveValue('');
	});

	test('the chosen sort order survives the change, and the focus stays on the row (happy path)', async ({
		page
	}) => {
		// GIVEN: Ada's tasks sorted by title.
		const { graceRow } = await openWithTwoUsers(page);
		await page.getByLabel('Sort by', { exact: true }).selectOption('title');
		await expect(page.locator('li label')).toHaveText(['Apple', 'Zebra']);

		// WHEN: Grace is selected from the keyboard (Safari does not focus a clicked button).
		await graceRow.focus();
		await graceRow.press('Enter');
		await page.getByRole('heading', { name: 'Tasks for Grace Hopper' }).waitFor();

		// THEN: Her tasks come sorted by title too (the order is global), and the row kept the focus.
		await expect(page.getByLabel('Sort by', { exact: true })).toHaveValue('title');
		await expect(page.locator('li label')).toHaveText(['Berry', 'Mango']);
		await expect(graceRow).toBeFocused();
	});
});
