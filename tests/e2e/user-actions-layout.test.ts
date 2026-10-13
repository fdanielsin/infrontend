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

test.describe('User row while edited, at 320 px (mocked API)', () => {
	test.use({ viewport: { width: 320, height: 800 } });

	test('the delete cross, inactive, stays on the row of Save and Cancel, with no empty band under it', async ({
		page
	}) => {
		// GIVEN: A user whose row is open for editing on a 320 px screen.
		await mockApi(page, { users: [{ id: 1, name: 'Ada Lovelace', email: 'ada@example.com' }] });
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit Ada Lovelace (ada@example.com)' }).click();
		const save = (await page.getByRole('button', { name: 'Save', exact: true }).boundingBox())!;
		const cross = (await page
			.getByRole('button', { name: 'Delete Ada Lovelace (ada@example.com)' })
			.boundingBox())!;
		const row = (await page.locator('li').first().boundingBox())!;

		// THEN: The cross is centred on the buttons row, and the row ends right under that row.
		expect(Math.abs(cross.y + cross.height / 2 - (save.y + save.height / 2))).toBeLessThanOrEqual(
			6
		);
		expect(row.y + row.height - (save.y + save.height)).toBeLessThanOrEqual(16);
	});
});

test.describe('User row under the pointer (mocked API)', () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test('Edit is underlined while the pointer is anywhere on its row, and only then (critère 22 du designer)', async ({
		page
	}) => {
		await mockApi(page, {
			users: [
				{ id: 1, name: 'Ada Lovelace', email: 'ada@example.com' },
				{ id: 2, name: 'Grace Hopper', email: 'grace@example.com' }
			]
		});
		await page.goto('/');
		const edit = page.getByRole('button', { name: 'Edit Ada Lovelace (ada@example.com)' });
		const underline = () => edit.evaluate((el) => getComputedStyle(el).textDecorationLine);
		await page.mouse.move(0, 0);
		expect(await underline()).toBe('none');

		await page
			.locator('li')
			.first()
			.hover({ position: { x: 40, y: 10 } });

		expect(await underline()).toContain('underline');
		await page
			.locator('li')
			.nth(1)
			.hover({ position: { x: 40, y: 10 } });
		expect(await underline()).toBe('none');
	});

	test('inactive Edit and cross use the disabled tokens, with no opacity (designer)', async ({
		page
	}) => {
		await mockApi(page, {
			users: [
				{ id: 1, name: 'Ada Lovelace', email: 'ada@example.com' },
				{ id: 2, name: 'Grace Hopper', email: 'grace@example.com' }
			]
		});
		await page.goto('/');
		await page.getByRole('button', { name: 'Edit Ada Lovelace (ada@example.com)' }).click();
		const colours = (name: string) =>
			page.getByRole('button', { name }).evaluate((el) => {
				const css = getComputedStyle(el);
				return { opacity: css.opacity, color: css.color };
			});
		const probe = await page.evaluate(() => {
			const el = document.createElement('span');
			el.className = 'text-disabled';
			document.body.append(el);
			const colour = getComputedStyle(el).color;
			el.remove();
			return colour;
		});

		const editOther = await colours('Edit Grace Hopper (grace@example.com)');
		const cross = await colours('Delete Ada Lovelace (ada@example.com)');

		expect(editOther).toEqual({ opacity: '1', color: probe });
		expect(cross).toEqual({ opacity: '1', color: probe });
	});
});
