import { expect, test, type Locator, type Page } from '@playwright/test';
import { measure, worstContrast } from './support/contrast';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// WCAG 1.4.11: the edge of a field is what shows where to type, so it needs 3:1 against what
// surrounds it and against the field's own fill. Measured on the computed style in a real
// browser (the palette is in oklch), never on class names. The API is mocked: no backend needed.

const MINIMUM_CONTRAST = 3;

async function fillAndLeave(field: Locator, value: string) {
	await field.fill(value);
	await field.blur();
	return field;
}

// The computed border color of the field (token null), or of a probe drawn with a color token.
const colorOf = (field: Locator, token: string | null) =>
	field.evaluate((element, variable) => {
		const probe = element.ownerDocument.createElement('div');
		probe.style.cssText = `border:1px solid ${variable ? `var(${variable})` : ''}`;
		if (variable) element.parentElement!.append(probe);
		const color = getComputedStyle(variable ? probe : element).borderTopColor;
		probe.remove();
		return color;
	}, token);

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

	// One case per branch of TextField that draws the success: text, e-mail, multiline, and the
	// multiline field that grows with its text.
	const SUCCESS_CASES: [string, (page: Page) => Promise<Locator>][] = [
		[
			'name (text)',
			async (page) => fillAndLeave(page.getByLabel('Name', { exact: true }), 'Grace')
		],
		[
			'e-mail',
			async (page) => fillAndLeave(page.getByLabel('Email', { exact: true }), 'grace@example.com')
		],
		[
			'description (multiline)',
			async (page) => fillAndLeave(page.getByLabel('Description').first(), 'Some details')
		],
		[
			'edit title (multiline, grows)',
			async (page) => {
				await page.getByRole('button', { name: 'Edit Review', exact: true }).click();
				return fillAndLeave(page.getByLabel('Task Title').nth(1), 'Review again');
			}
		]
	];

	for (const [name, makeValid] of SUCCESS_CASES) {
		test(`the border of a ${name} field in success is the success color, at 3:1 or more, with room for the check (happy path)`, async ({
			page
		}) => {
			// GIVEN: The field holds a valid value and was left.
			await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			const field = await makeValid(page);
			await expect(field.locator('xpath=..').locator('svg[data-icon="check"]')).toBeVisible();

			// WHEN / THEN: Its border is the success color, not the neutral one; readable on both
			// sides; the text keeps clear of the check.
			const actual = await colorOf(field, null);
			expect(actual).toBe(await colorOf(field, '--color-success'));
			expect(actual).not.toBe(await colorOf(field, '--color-field-border'));
			const outside = await measure(field, 'borderTopColor', 'parent');
			const inside = await measure(field, 'borderTopColor', 'self');
			expect(worstContrast(outside)).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
			expect(worstContrast(inside)).toBeGreaterThanOrEqual(MINIMUM_CONTRAST);
			expect(
				await field.evaluate((element) => parseFloat(getComputedStyle(element).paddingRight))
			).toBeGreaterThanOrEqual(32);
		});
	}
});
