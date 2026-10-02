import { expect, test, type Locator } from '@playwright/test';
import { measure, worstContrast } from './support/contrast';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// WCAG 1.4.11: the edge of a field is what shows where to type, so it needs 3:1 against what
// surrounds it and against the field's own fill. Measured on the computed style in a real
// browser (the palette is in oklch), never on class names. The API is mocked: no backend needed.

const MINIMUM_CONTRAST = 3;

test.describe('Field borders (computed style, mocked API)', () => {
	for (const width of [1280, 320]) {
		test(`every field border is visible at 3:1 or more, at ${width} px (happy path)`, async ({
			page
		}) => {
			// GIVEN: The home page with a selected user, its tasks and one task being edited.
			await page.setViewportSize({ width, height: 900 });
			await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			await page.getByRole('button', { name: 'Edit Review', exact: true }).click();

			const fields: [string, Locator][] = [
				['language select', page.getByRole('combobox', { name: 'Language' })],
				['name field', page.getByLabel('Name', { exact: true })],
				['email field', page.getByLabel('Email', { exact: true })],
				['title field', page.getByLabel('Task Title').first()],
				['description field', page.getByLabel('Description').first()],
				['edit title field (compact)', page.getByLabel('Task Title').nth(1)],
				['edit description field (compact)', page.getByLabel('Description').nth(1)]
			];

			// WHEN / THEN: Each border is solid, drawn, and readable on both sides.
			for (const [name, field] of fields) {
				await expect(field, name).toBeVisible();
				const edge = await field.evaluate((element) => {
					const style = getComputedStyle(element);
					return { style: style.borderTopStyle, width: parseFloat(style.borderTopWidth) };
				});
				expect(edge.style, `${name}: border style`).toBe('solid');
				expect(edge.width, `${name}: border width`).toBeGreaterThanOrEqual(1);

				const outside = await measure(field, 'borderTopColor', 'parent');
				const inside = await measure(field, 'borderTopColor', 'self');
				expect(worstContrast(outside), `${name}: against its surroundings`).toBeGreaterThanOrEqual(
					MINIMUM_CONTRAST
				);
				expect(worstContrast(inside), `${name}: against its own fill`).toBeGreaterThanOrEqual(
					MINIMUM_CONTRAST
				);
			}
		});
	}
});
