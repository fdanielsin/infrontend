import { readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { measure, worstContrast } from './support/contrast';
import { nextFocusKey } from './support/keyboard';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// The service-unavailable banner, the API version in the footer and the copyable reference of a
// server error, with a mocked API. Time is the page's fake clock: no real wait.

const BANNER_TEXT = /service is currently unavailable/;

// The clipboard is not the object of the test, and its permission differs per engine: a
// double records what is written.
async function recordClipboard(page: Page, behaviour: 'accept' | 'refuse' | 'absent' = 'accept') {
	await page.addInitScript((mode) => {
		const copied: string[] = [];
		(window as unknown as { copied: string[] }).copied = copied;
		const clipboard =
			mode === 'absent'
				? undefined
				: {
						writeText: (text: string) => {
							if (mode === 'refuse')
								return Promise.reject(new DOMException('no', 'NotAllowedError'));
							copied.push(text);
							return Promise.resolve();
						}
					};
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
	}, behaviour);
}

const LOCALES = ['en', 'fr', 'es', 'de'] as const;
const text = (locale: string, key: string) =>
	(JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as Record<string, string>)[key]!;

const horizontalOverflow = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const copied = (page: Page) =>
	page.evaluate(() => (window as unknown as { copied: string[] }).copied);

test.describe('Service availability (mocked API)', () => {
	test.describe('banner', () => {
		test('an outage at load shows the banner and no list is requested (sad path)', async ({
			page
		}) => {
			// GIVEN: A database that does not answer.
			await page.clock.install();
			const api = await mockApi(page, { users: [ada] });
			api.readiness = 503;

			// WHEN: The home page is opened.
			await page.goto('/');

			// THEN: The banner is announced, nothing is requested, no error toast piles up.
			await expect(page.getByRole('alert').filter({ hasText: BANNER_TEXT })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
			expect(api.calls).toEqual([]);
			await expect(page.getByRole('alert').getByRole('button')).toHaveCount(0);
		});

		test('the service coming back by itself reloads the list once and says so (happy path)', async ({
			page
		}) => {
			// GIVEN: An outage at load.
			await page.clock.install();
			const api = await mockApi(page, { users: [ada] });
			api.readiness = 503;
			await page.goto('/');
			await expect(page.getByText(BANNER_TEXT)).toBeVisible();

			// WHEN: The service is back and the first retry (5 s, 6 s at most) comes.
			api.readiness = 'ready';
			await page.clock.runFor(6_000);

			// THEN: The banner goes, the list loads once, a status announces it.
			await expect(page.getByText(BANNER_TEXT)).toHaveCount(0);
			await expect(page.getByRole('button', { name: /Ada Lovelace/ })).toBeVisible();
			await expect(page.getByRole('status').getByText('Service restored')).toBeVisible();
			expect(api.calls.filter((call) => call === 'GET /users')).toHaveLength(1);
		});

		test('Retry checks at once and moves the focus to main when it works (happy path)', async ({
			page
		}) => {
			// GIVEN: An outage at load, the focus on the Retry button.
			await page.clock.install();
			const api = await mockApi(page, { users: [ada] });
			api.readiness = 503;
			await page.goto('/');
			const retry = page.getByRole('button', { name: 'Retry' });
			await retry.focus();

			// WHEN: The service is back and Retry is pressed from the keyboard.
			api.readiness = 'ready';
			await retry.press('Enter');

			// THEN: The list is there and the focus is on main, not lost.
			await expect(page.getByRole('button', { name: /Ada Lovelace/ })).toBeVisible();
			await expect(page.getByText(BANNER_TEXT)).toHaveCount(0);
			await expect(page.getByRole('main')).toBeFocused();
		});

		test('Retry on a service still down keeps the banner and the lists untouched (sad path)', async ({
			page
		}) => {
			// GIVEN: An outage at load.
			await page.clock.install();
			const api = await mockApi(page, { users: [ada] });
			api.readiness = 503;
			await page.goto('/');

			// WHEN: Retry is pressed.
			await page.getByRole('button', { name: 'Retry' }).click();

			// THEN: The banner is still there and nothing was requested.
			await expect(page.getByRole('alert').filter({ hasText: BANNER_TEXT })).toBeVisible();
			expect(api.calls).toEqual([]);
		});

		test('the stats page waits too, and loads when the service is back (sad path)', async ({
			page
		}) => {
			// GIVEN: An outage at load on /stats.
			await page.clock.install();
			const api = await mockApi(page, { stats: { users: 3, tasks: 7 } });
			api.readiness = 503;
			await page.goto('/stats');
			await expect(page.getByText(BANNER_TEXT)).toBeVisible();
			expect(api.calls).toEqual([]);

			// WHEN: The service is back.
			api.readiness = 'ready';
			await page.clock.runFor(6_000);

			// THEN: The statistics load.
			await expect(page.getByText('Average tasks per user')).toBeVisible();
			expect(api.calls).toEqual(['GET /stats']);
		});

		test('an unreachable service (network error) shows the banner (exception)', async ({
			page
		}) => {
			// GIVEN: A connection that fails.
			await page.clock.install();
			const api = await mockApi(page);
			api.readiness = 'unreachable';

			// WHEN: The page is opened.
			await page.goto('/');

			// THEN: The banner is shown.
			await expect(page.getByRole('alert').filter({ hasText: BANNER_TEXT })).toBeVisible();
		});

		test('a 4xx answer from /ready shows no banner and loads the lists (boundary)', async ({
			page
		}) => {
			// GIVEN: A readiness probe answering 404.
			const api = await mockApi(page, { users: [ada] });
			api.readiness = 404;

			// WHEN: The page is opened.
			await page.goto('/');

			// THEN: The list loads as before, without banner.
			await expect(page.getByRole('button', { name: /Ada Lovelace/ })).toBeVisible();
			await expect(page.getByText(BANNER_TEXT)).toHaveCount(0);
		});

		test('the banner has no accessibility violation (happy path)', async ({ page }) => {
			// GIVEN: An outage at load, without animation.
			await page.emulateMedia({ reducedMotion: 'reduce' });
			const api = await mockApi(page);
			api.readiness = 503;
			await page.goto('/');
			await expect(page.getByText(BANNER_TEXT)).toBeVisible();

			// WHEN / THEN: axe finds nothing.
			const { violations } = await new AxeBuilder({ page }).analyze();
			expect(violations.map((violation) => violation.id)).toEqual([]);
		});

		for (const locale of LOCALES) {
			test(`${locale}: translated, readable, no axe violation, above the title, no overflow at 320 px (limit)`, async ({
				page,
				context
			}) => {
				// GIVEN: An outage, in each interface language, on the narrowest screen.
				await context.addCookies([
					{ name: 'PARAGLIDE_LOCALE', value: locale, url: 'http://localhost:4173' }
				]);
				await page.setViewportSize({ width: 320, height: 700 });
				await page.emulateMedia({ reducedMotion: 'reduce' });
				const api = await mockApi(page);
				api.readiness = 503;
				api.readinessRequestId = 'req-ready-503';
				await page.goto('/');

				// THEN: The texts come from the language file, are readable and fit.
				const alert = page
					.getByRole('alert')
					.filter({ hasText: text(locale, 'availability_unavailable') });
				await expect(alert).toBeVisible();
				await expect(
					page.getByRole('button', { name: text(locale, 'availability_retry'), exact: true })
				).toBeVisible();
				expect(worstContrast(await measure(alert, 'color'))).toBeGreaterThanOrEqual(4.5);
				expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
				const banner = await page.locator('[data-availability]').boundingBox();
				const heading = await page.getByRole('heading', { level: 1 }).boundingBox();
				expect(banner!.y + banner!.height).toBeLessThanOrEqual(heading!.y);
				const { violations } = await new AxeBuilder({ page }).analyze();
				expect(violations.map((violation) => violation.id)).toEqual([]);
			});
		}

		test('shows the reference of the failed check outside the alert and copies it (happy path)', async ({
			page
		}) => {
			// GIVEN: An outage whose answer carries X-Request-Id.
			await recordClipboard(page);
			const api = await mockApi(page);
			api.readiness = 503;
			api.readinessRequestId = 'req-ready-503';
			await page.goto('/');

			// WHEN: Copy is pressed.
			await page.getByRole('button', { name: 'Copy reference req-ready-503' }).click();

			// THEN: It was copied, and the reference is not inside the alert.
			expect(await copied(page)).toEqual(['req-ready-503']);
			await expect(page.getByRole('status').getByText('Reference copied')).toBeVisible();
			await expect(page.getByRole('alert').getByText('req-ready-503')).toHaveCount(0);
			await expect(page.getByText('Reference: req-ready-503')).toBeVisible();
		});

		test('an outage without X-Request-Id shows no reference (boundary)', async ({ page }) => {
			const api = await mockApi(page);
			api.readiness = 503;
			await page.goto('/');

			await expect(page.getByText(BANNER_TEXT)).toBeVisible();
			await expect(page.getByRole('button', { name: /Copy reference/ })).toHaveCount(0);
		});

		test('the banner container takes no room while the service is up (limit)', async ({ page }) => {
			// GIVEN: A service that is ready.
			await mockApi(page, { users: [ada] });
			await page.goto('/');

			// THEN: No banner element takes room while the service is up.
			await expect(page.getByRole('button', { name: /Ada Lovelace/ })).toBeVisible();
			expect(await page.locator('[data-availability]').evaluate((e) => e.clientHeight)).toBe(0);
		});
	});

	test.describe('footer', () => {
		test('shows the version of the API (happy path)', async ({ page }) => {
			await mockApi(page);
			await page.goto('/');

			await expect(page.getByRole('contentinfo')).toHaveText('API 1.2.0');
		});

		test('a 200-character version without space does not overflow at 320 px (limit)', async ({
			page
		}) => {
			await page.setViewportSize({ width: 320, height: 700 });
			const api = await mockApi(page);
			api.version = '1.2.0-' + 'x'.repeat(194);
			await page.goto('/');

			await expect(page.getByRole('contentinfo')).toContainText('1.2.0-');
			expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		});

		test('a /health failure shows nothing and no error (sad path)', async ({ page }) => {
			const api = await mockApi(page, { users: [ada] });
			api.version = null;

			await page.goto('/');

			await expect(page.getByRole('button', { name: /Ada Lovelace/ })).toBeVisible();
			await expect(page.getByRole('contentinfo')).toHaveText('');
			await expect(page.locator('[data-toast]')).toHaveCount(0);
		});
	});

	test.describe('reference of a server error', () => {
		const REFERENCE = 'a3622cb2-4f3c-47f6-a67f-ec5a359e45fb';

		async function serverError(page: Page, requestId?: string) {
			const api = await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			api.failNext('PUT /tasks/{id}', {
				status: 500,
				error: 'Internal server error',
				code: 'INTERNAL_ERROR',
				...(requestId && { requestId })
			});
			await page.getByRole('checkbox', { name: 'Review', exact: true }).focus();
			await page.keyboard.press('Space');
			await expect(
				page
					.getByRole('alert')
					.getByText('Something went wrong on our side. Please try again in a moment.')
			).toBeVisible();
		}

		test('shows the reference, copies it and confirms in the status region (happy path)', async ({
			page
		}) => {
			// GIVEN: A 500 that carries X-Request-Id.
			await recordClipboard(page);
			await serverError(page, REFERENCE);

			// WHEN: Copy is pressed.
			await page.getByRole('button', { name: `Copy reference ${REFERENCE}` }).click();

			// THEN: The reference was copied and the confirmation is a status.
			await expect(page.getByRole('alert').getByText(`Reference: ${REFERENCE}`)).toBeVisible();
			await expect(page.getByRole('status').getByText('Reference copied')).toBeVisible();
			expect(await copied(page)).toEqual([REFERENCE]);
		});

		test('a refused clipboard says the copy is impossible (sad path)', async ({ page }) => {
			await recordClipboard(page, 'refuse');
			await serverError(page, REFERENCE);

			await page.getByRole('button', { name: /Copy reference/ }).click();

			await expect(
				page.getByRole('status').getByText('Could not copy the reference')
			).toBeVisible();
			await expect(page.getByText(`Reference: ${REFERENCE}`)).toBeVisible();
		});

		test('no clipboard at all says the copy is impossible (exception)', async ({ page }) => {
			await recordClipboard(page, 'absent');
			await serverError(page, REFERENCE);

			await page.getByRole('button', { name: /Copy reference/ }).click();

			await expect(
				page.getByRole('status').getByText('Could not copy the reference')
			).toBeVisible();
		});

		test('a header that does not fit the contract shows neither reference nor button (limit)', async ({
			page
		}) => {
			await serverError(page, 'not valid!');

			await expect(page.getByText(/Reference:/)).toHaveCount(0);
			await expect(page.getByRole('button', { name: /Copy/ })).toHaveCount(0);
		});

		test('an error without header shows neither reference nor button (boundary)', async ({
			page
		}) => {
			await serverError(page);

			await expect(page.getByText(/Reference:/)).toHaveCount(0);
			await expect(page.getByRole('button', { name: /Copy/ })).toHaveCount(0);
		});

		test('Tab reaches Copy, then Dismiss: two stops, never a trap (happy path)', async ({
			page,
			browserName
		}) => {
			// GIVEN: An error toast with a reference, the focus on the last control of the page.
			await page.clock.install();
			await serverError(page, REFERENCE);
			const lastControl = page.getByRole('button', { name: 'Delete Review 2' });
			await lastControl.focus();
			const key = nextFocusKey(browserName);

			// WHEN: Tab goes into the toast, twice, then once more.
			await page.keyboard.press(key);
			const copy = page.getByRole('button', { name: /Copy reference/ });
			await expect(copy).toBeFocused();
			await page.keyboard.press(key);
			const dismiss = page.getByRole('alert').getByRole('button', { name: 'Dismiss notification' });
			await expect(dismiss).toBeFocused();
			await page.clock.runFor(20_000);

			// THEN: The toast waited for the keyboard user; Enter dismisses it and the focus returns.
			const message = page
				.getByRole('region', { name: 'Notifications' })
				.getByText('Something went wrong on our side. Please try again in a moment.');
			await expect(message).toBeVisible();
			await dismiss.press('Enter');
			await expect(message).toHaveCount(0);
			await expect(lastControl).toBeFocused();
		});

		test('the toast with a reference has no accessibility violation (happy path)', async ({
			page
		}) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await serverError(page, REFERENCE);

			const { violations } = await new AxeBuilder({ page }).analyze();

			expect(violations.map((violation) => violation.id)).toEqual([]);
		});
	});
});
