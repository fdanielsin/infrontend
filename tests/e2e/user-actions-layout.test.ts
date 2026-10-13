import { expect, test } from '@playwright/test';
import { horizontalOverflow } from './support/layout';
import { LOCALES, switchLanguage } from './support/locale';
import { mockApi } from './support/mock-api';

// The rows of the user list with their two actions at the narrowest width (WCAG 1.4.10), in every
// language, with the longest name and email the contract accepts, and with 44 px targets on a
// touch screen (WCAG 2.5.8). The API is mocked.

const LONG_NAME = 'N'.repeat(100);
const LONG_EMAIL = `${'e'.repeat(242)}@example.com`;

test.describe('User rows at 320 px (mocked API)', () => {
	test.use({ viewport: { width: 320, height: 800 }, hasTouch: true, isMobile: true });

	for (const locale of LOCALES) {
		test(`${locale}: no row overflows and every action is at least 44 px (critère 27)`, async ({
			page
		}) => {
			// GIVEN: Two users, one with a 100-character name without a space and a 254-character email.
			expect(LONG_EMAIL).toHaveLength(254);
			await mockApi(page, {
				users: [
					{ id: 1, name: LONG_NAME, email: LONG_EMAIL },
					{ id: 2, name: 'Grace Hopper', email: 'grace@example.com' }
				]
			});

			// WHEN: The list is shown in the language, then a row is being edited.
			await page.goto('/');
			// The list comes from the API: once it is there, the page is hydrated and can change language.
			await expect(page.locator('li').first()).toContainText(LONG_NAME);
			await switchLanguage(page, locale);

			// THEN: Nothing overflows sideways and each action is a 44 px target.
			expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
			const actions = page.locator('li').first().locator('button:not([aria-pressed])');
			const boxes = await actions.evaluateAll((buttons) =>
				buttons
					.filter((button) => !button.hasAttribute('aria-pressed'))
					.map((button) => {
						const { width, height } = button.getBoundingClientRect();
						return { width, height };
					})
			);
			expect(boxes).toHaveLength(2);
			for (const box of boxes) {
				expect(box.width).toBeGreaterThanOrEqual(44);
				expect(box.height).toBeGreaterThanOrEqual(44);
			}

			await actions.first().click();
			expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		});
	}
});
