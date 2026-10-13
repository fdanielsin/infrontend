import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './support/axe';
import { measure, worstContrast } from './support/contrast';
import { nextFocusKey } from './support/keyboard';
import { horizontalOverflow } from './support/layout';
import { LOCALES, switchLanguage, text } from './support/locale';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// The service-unavailable banner, the API version in the footer and the copyable reference of a
// server error, with a mocked API. What the state decides (which answer is an outage, the delays,
// what each component says) is tested by the unit tests of availability, AvailabilityBanner,
// ApiVersion, PagesAvailability and NotificationReference; kept here: the page as a whole (the
// banner in the layout, the real requests, the focus on the real <main>), and what needs a browser
// (contrast, width, order on the page, axe).

const BANNER_TEXT = /service is currently unavailable/;

// The clipboard is not the object of the test, and its permission differs per engine: a
// double records what is written.
async function recordClipboard(page: Page) {
	await page.addInitScript(() => {
		const copied: string[] = [];
		(window as unknown as { copied: string[] }).copied = copied;
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: (written: string) => {
					copied.push(written);
					return Promise.resolve();
				}
			}
		});
	});
}

const copied = (page: Page) =>
	page.evaluate(() => (window as unknown as { copied: string[] }).copied);

// A clock that only the test moves: no timer of the page runs unless `runFor` is called.
async function freezeClock(page: Page) {
	await page.clock.install({ time: 0 });
	await page.clock.pauseAt(1000);
}

test.describe('Service availability (mocked API)', () => {
	test.describe('banner', () => {
		test('an outage at load shows the banner and requests nothing; Retry then restores the lists once and puts the focus on main (happy path)', async ({
			page
		}) => {
			// GIVEN: A database that does not answer.
			await freezeClock(page);
			const api = await mockApi(page, { users: [ada] });
			api.readiness = 503;

			// WHEN: The home page is opened.
			await page.goto('/');

			// THEN: The banner is announced, nothing is requested, and its button is outside the alert.
			const alert = page.getByRole('alert').filter({ hasText: BANNER_TEXT });
			const retry = page.getByRole('button', { name: 'Retry' });
			await expect(alert).toBeVisible();
			await expect(retry).toBeVisible();
			expect(api.calls).toEqual([]);
			await expect(page.getByRole('alert').getByRole('button')).toHaveCount(0);

			// WHEN: Retry is pressed from the keyboard while the service is still down.
			await alert.evaluate((element) => element.setAttribute('data-announced', ''));
			await retry.press('Enter');

			// THEN: The alert is announced again (a new element), the banner stays, nothing is requested.
			await expect(
				page.locator('[data-availability] [role="alert"]:not([data-announced])')
			).toBeVisible();
			await expect(retry).toBeVisible();
			expect(api.calls).toEqual([]);

			// WHEN: The service is back and Retry is pressed from the keyboard.
			api.readiness = 'ready';
			await retry.press('Enter');

			// THEN: The banner goes, the list loads once, a status announces it, and the focus is on
			// main, not lost.
			await expect(page.getByRole('button', { name: /^Ada Lovelace [^(]/ })).toBeVisible();
			await expect(page.getByText(BANNER_TEXT)).toHaveCount(0);
			await expect(page.getByRole('status').getByText('Service restored')).toBeVisible();
			await expect(page.getByRole('main')).toBeFocused();
			expect(api.calls.filter((call) => call === 'GET /users')).toHaveLength(1);
		});

		test('the stats page waits too, says so, and loads once when the service is back by itself (sad path)', async ({
			page
		}) => {
			// GIVEN: An outage at load on /stats.
			await freezeClock(page);
			const api = await mockApi(page, { stats: { users: 3, tasks: 7 } });
			api.readiness = 503;

			// WHEN: The statistics page is opened.
			await page.goto('/stats');

			// THEN: It explains the wait: no loading, no second Retry (the banner has the only one),
			// and nothing is requested.
			await expect(
				page.getByText('Statistics will show as soon as the service is back.')
			).toBeVisible();
			await expect(page.getByText('Loading statistics…')).toHaveCount(0);
			await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(1);
			expect(api.calls).toEqual([]);

			// WHEN: The service is back and the first retry (5 s, 6 s at most) comes.
			api.readiness = 'ready';
			await page.clock.runFor(6_000);

			// THEN: The figures replace the wait, after one request, and a status announces it.
			await expect(page.getByText('Average tasks per user')).toBeVisible();
			await expect(
				page.getByText('Statistics will show as soon as the service is back.')
			).toHaveCount(0);
			await expect(page.getByRole('status').getByText('Service restored')).toBeVisible();
			expect(api.calls).toEqual(['GET /stats']);
		});

		test('the banner is readable and fits above the title at 320 px in every language, with its reference outside the alert (limit)', async ({
			page
		}) => {
			// GIVEN: An outage whose answer carries a reference, on the narrowest screen, without animation.
			await page.setViewportSize({ width: 320, height: 700 });
			await page.emulateMedia({ reducedMotion: 'reduce' });
			const api = await mockApi(page);
			api.readiness = 503;
			api.readinessRequestId = 'req-ready-503';

			// WHEN: The home page is opened.
			await page.goto('/');
			const alert = page
				.getByRole('alert')
				.filter({ hasText: text('en', 'availability_unavailable') });
			await expect(alert).toBeVisible();

			// THEN: The text reaches 4.5:1 on the banner, the page has no violation, and the reference
			// is next to the alert, not in it (a retry that fails again does not read it again).
			expect(worstContrast(await measure(alert, 'color'))).toBeGreaterThanOrEqual(4.5);
			await expectNoAxeViolations(page);
			await expect(page.getByText('Reference: req-ready-503')).toBeVisible();
			await expect(alert.getByText('req-ready-503')).toHaveCount(0);

			// THEN: In each language, chosen in the page, the banner speaks it, fits the screen and is
			// above the title.
			for (const locale of LOCALES) {
				await switchLanguage(page, locale);
				await expect(
					page.getByRole('alert').filter({ hasText: text(locale, 'availability_unavailable') })
				).toBeVisible();
				await expect(
					page.getByRole('button', { name: text(locale, 'availability_retry'), exact: true })
				).toBeVisible();
				expect(await horizontalOverflow(page), `${locale}: sideways scroll`).toBeLessThanOrEqual(0);
				const banner = await page.locator('[data-availability]').boundingBox();
				const heading = await page.getByRole('heading', { level: 1 }).boundingBox();
				expect(banner!.y + banner!.height, `${locale}: banner above the title`).toBeLessThanOrEqual(
					heading!.y
				);
			}
		});
	});

	test.describe('footer', () => {
		test('the footer shows a 200-character version without widening the page, and the banner container takes no room while the service is up (limit)', async ({
			page
		}) => {
			// GIVEN: A very long version, a service that is ready, the narrowest screen.
			await page.setViewportSize({ width: 320, height: 700 });
			const version = '1.2.0-' + 'x'.repeat(194);
			const api = await mockApi(page, { users: [ada] });
			api.version = version;

			// WHEN: The home page is opened.
			await page.goto('/');
			await expect(page.getByRole('button', { name: /^Ada Lovelace [^(]/ })).toBeVisible();

			// THEN: The footer shows it without widening the page, and no banner element takes room.
			await expect(page.getByRole('contentinfo')).toHaveText(`API ${version}`);
			expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
			expect(
				await page.locator('[data-availability]').evaluate((element) => element.clientHeight)
			).toBe(0);
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

		test('the reference of a server error is shown, has no violation, is copied and confirmed in the status region (happy path)', async ({
			page
		}) => {
			// GIVEN: A 500 that carries X-Request-Id; no entry animation, so that axe reads the toast
			// where it rests.
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await recordClipboard(page);
			await serverError(page, REFERENCE);

			// THEN: The reference is in the alert, and the page has no violation.
			await expect(page.getByRole('alert').getByText(`Reference: ${REFERENCE}`)).toBeVisible();
			await expectNoAxeViolations(page);

			// WHEN: Copy is pressed.
			await page.getByRole('button', { name: `Copy reference ${REFERENCE}` }).click();

			// THEN: The reference was copied and the confirmation is a status.
			await expect(page.getByRole('status').getByText('Reference copied')).toBeVisible();
			expect(await copied(page)).toEqual([REFERENCE]);
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
	});
});
