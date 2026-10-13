import { readFileSync } from 'node:fs';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { measure, worstContrast } from './support/contrast';
import { expectAnnounced, expectSilent } from './support/announcement';
import { ada, mockApi, openHomeWithUser, type MockTask } from './support/mock-api';

// Sorting of the task list, with a mocked API. Creation order of the tasks below: Banana, apple,
// Cherry 10, Cherry 2.
const task = (id: number, title: string, completed = false): MockTask => ({
	id,
	title,
	description: `About ${title}`,
	user_id: 1,
	completed
});
const FOUR = [task(1, 'Banana'), task(2, 'apple', true), task(3, 'Cherry 10'), task(4, 'Cherry 2')];

const LOCALES = ['en', 'fr', 'es', 'de'] as const;
const text = (locale: string, key: string) =>
	(JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as Record<string, string>)[key]!;

const titles = (page: Page) => page.locator('li label').allTextContents();
const orderSelect = (page: Page, label = 'Sort by') => page.getByLabel(label, { exact: true });
const horizontalOverflow = (page: Page) =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function open(page: Page, tasks: MockTask[] = FOUR) {
	const api = await mockApi(page, { users: [ada], tasks });
	await openHomeWithUser(page);
	return api;
}

test.describe('Task sorting (mocked API)', () => {
	test('lists the tasks in creation order, with a labelled selector, and says nothing (happy path)', async ({
		page
	}) => {
		await open(page);

		expect(await titles(page)).toEqual(['Banana', 'apple', 'Cherry 10', 'Cherry 2']);
		await expect(orderSelect(page)).toHaveValue('created');
		await expect(page.locator('[data-toast]')).toHaveCount(0);
		await expectSilent(page);
	});

	test('sorts by title: case ignored, "Cherry 2" before "Cherry 10", announced once (happy path)', async ({
		page
	}) => {
		await open(page);

		await orderSelect(page).selectOption('title');

		expect(await titles(page)).toEqual(['apple', 'Banana', 'Cherry 2', 'Cherry 10']);
		await expectAnnounced(page, 'Tasks sorted by title');
	});

	test('sorts by status, then back to creation order, exactly as it was (happy path)', async ({
		page
	}) => {
		await open(page);

		await orderSelect(page).selectOption('status');
		expect(await titles(page)).toEqual(['Banana', 'Cherry 10', 'Cherry 2', 'apple']);
		await orderSelect(page).selectOption('title');
		await orderSelect(page).selectOption('created');

		expect(await titles(page)).toEqual(['Banana', 'apple', 'Cherry 10', 'Cherry 2']);
	});

	for (const order of ['created', 'title', 'status'] as const) {
		test(`restores the order "${order}" after a reload, without announcing it (happy path)`, async ({
			page
		}) => {
			await open(page);
			await orderSelect(page).selectOption(order === 'created' ? 'title' : order);
			if (order === 'created') await orderSelect(page).selectOption('created');

			await page.reload();
			await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();

			await expect(orderSelect(page)).toHaveValue(order);
			await expect(page.getByRole('status').filter({ hasText: /sorted/ })).toHaveCount(0);
			await expectSilent(page);
		});
	}

	test('uses the default order when the stored one is unknown (sad path)', async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('indrive.task-order', 'sideways'));
		await open(page);

		await expect(orderSelect(page)).toHaveValue('created');
		expect(await titles(page)).toEqual(['Banana', 'apple', 'Cherry 10', 'Cherry 2']);
	});

	test('sorts without any storage and shows no error (exception)', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'localStorage', {
				get() {
					throw new DOMException('denied', 'SecurityError');
				}
			});
		});
		await open(page);

		await orderSelect(page).selectOption('title');

		expect(await titles(page)).toEqual(['apple', 'Banana', 'Cherry 2', 'Cherry 10']);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
	});

	test('hides the selector for a single task and shows it for two (boundary)', async ({ page }) => {
		const api = await open(page, [task(1, 'Only')]);
		await expect(orderSelect(page)).toHaveCount(0);

		api.tasks.push(task(2, 'Second', false));
		await page.getByRole('textbox', { name: 'Task Title' }).fill('Third');
		await page.getByRole('button', { name: 'Add Task' }).click();

		await expect(orderSelect(page)).toBeVisible();
	});

	test('places a new task in the chosen order and keeps it after a deletion (happy path)', async ({
		page
	}) => {
		await open(page);
		await orderSelect(page).selectOption('title');

		await page.getByRole('textbox', { name: 'Task Title' }).fill('Avocado');
		await page.getByRole('button', { name: 'Add Task' }).click();
		await expect(page.locator('li label')).toHaveCount(5);
		expect(await titles(page)).toEqual(['apple', 'Avocado', 'Banana', 'Cherry 2', 'Cherry 10']);

		await page.getByRole('button', { name: 'Delete Banana' }).click();
		await expect(page.locator('li label')).toHaveCount(4);
		expect(await titles(page)).toEqual(['apple', 'Avocado', 'Cherry 2', 'Cherry 10']);
	});

	test('a toggle that moves the row keeps the focus on its checkbox and announces the position (happy path)', async ({
		page
	}) => {
		await open(page);
		await orderSelect(page).selectOption('status');
		const checkbox = page.getByRole('checkbox', { name: 'Banana', exact: true });
		await checkbox.focus();

		await page.keyboard.press('Space');

		await expect.poll(() => titles(page)).toEqual(['Cherry 10', 'Cherry 2', 'Banana', 'apple']);
		await expect(checkbox).toBeFocused();
		await expectAnnounced(page, 'Banana: position 3 of 4');
	});

	test('an edit that moves the row keeps the focus on its Edit button (happy path)', async ({
		page
	}) => {
		await open(page);
		await orderSelect(page).selectOption('title');
		await page.getByRole('button', { name: 'Edit apple' }).click();
		await page.getByRole('textbox', { name: 'Task Title' }).last().fill('zzz');

		await page.getByRole('button', { name: 'Save' }).click();

		await expect.poll(() => titles(page)).toEqual(['Banana', 'Cherry 2', 'Cherry 10', 'zzz']);
		await expect(page.getByRole('button', { name: 'Edit zzz' })).toBeFocused();
		await expectAnnounced(page, 'zzz: position 4 of 4');
	});

	test('a failed toggle reorders nothing, announces no move and restores the box (exception)', async ({
		page
	}) => {
		const api = await open(page);
		await orderSelect(page).selectOption('status');
		api.failNext('PUT /tasks/{id}', { status: 500, error: 'Database unavailable' });
		const checkbox = page.getByRole('checkbox', { name: 'Banana', exact: true });

		await checkbox.click();

		await expect(page.getByRole('alert').getByText('Database unavailable')).toBeVisible();
		await expect(checkbox).not.toBeChecked();
		expect(await titles(page)).toEqual(['Banana', 'Cherry 10', 'Cherry 2', 'apple']);
		await expect(page.getByText(/position \d of/)).toHaveCount(0);
	});

	test('the selector shows a focus ring when reached with the keyboard (happy path)', async ({
		page
	}) => {
		await open(page);

		await orderSelect(page).focus();
		await page.keyboard.press('Tab');
		await page.keyboard.press('Shift+Tab');

		const outline = await orderSelect(page).evaluate((element) => {
			const style = getComputedStyle(element);
			return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
		});
		expect(outline.style).not.toBe('none');
		expect(outline.width).toBeGreaterThan(0);
	});

	test('orders "ñ" after "n" in Spanish only (limit)', async ({ page, context }) => {
		await context.addCookies([
			{ name: 'PARAGLIDE_LOCALE', value: 'es', url: 'http://localhost:4173' }
		]);
		await mockApi(page, {
			users: [ada],
			tasks: [task(1, 'Ñu'), task(2, 'Nz'), task(3, 'Nube'), task(4, 'Oso')]
		});
		await page.goto('/');
		await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();

		await orderSelect(page, text('es', 'tasks_order_label')).selectOption('title');

		expect(await titles(page)).toEqual(['Nube', 'Nz', 'Ñu', 'Oso']);
	});

	for (const locale of LOCALES) {
		test(`${locale}: translated, readable, no axe violation, no overflow at 320 px with a long title (limit)`, async ({
			page,
			context
		}) => {
			// GIVEN: Each interface language on the narrowest screen, with a 200-character title.
			await context.addCookies([
				{ name: 'PARAGLIDE_LOCALE', value: locale, url: 'http://localhost:4173' }
			]);
			await page.setViewportSize({ width: 320, height: 700 });
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await mockApi(page, {
				users: [ada],
				tasks: [task(1, 'x'.repeat(200)), task(2, 'b'), task(3, 'a', true)]
			});
			await page.goto('/');
			await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
			const select = orderSelect(page, text(locale, 'tasks_order_label'));

			// WHEN: The title order is chosen.
			await expect(select).toBeVisible();
			await select.selectOption('title');

			// THEN: Labels and announcement come from the language file, and the page fits.
			expect(await select.locator('option').allTextContents()).toEqual([
				text(locale, 'tasks_order_created'),
				text(locale, 'tasks_order_title'),
				text(locale, 'tasks_order_status')
			]);
			await expectAnnounced(page, text(locale, 'tasks_sorted_title'));
			expect(worstContrast(await measure(select, 'color'))).toBeGreaterThanOrEqual(4.5);
			expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
			const { violations } = await new AxeBuilder({ page }).analyze();
			expect(violations.map((violation) => violation.id)).toEqual([]);
		});
	}
});
