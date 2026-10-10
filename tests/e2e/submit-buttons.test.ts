import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { nextFocusKey } from './support/keyboard';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// The submit buttons are never disabled: validation happens on press, with our messages (never the
// browser bubble, visual review 22), and a slow request only marks the button busy. API mocked.

const LOCALES = ['en', 'fr', 'de', 'es'] as const;
const messages = Object.fromEntries(
	LOCALES.map((locale) => [
		locale,
		JSON.parse(
			readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
		) as Record<string, string>
	])
);

const calls = (api: { calls: string[] }, operation: string) =>
	api.calls.filter((call) => call === operation).length;

async function slowRoute(page: Page, method: string, pattern: string) {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	await page.route(pattern, async (route) => {
		if (route.request().method() !== method) return route.fallback();
		await gate;
		return route.fallback();
	});
	return release;
}

test.describe('Submit buttons (mocked API)', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	for (const locale of LOCALES) {
		test(`an empty form shows our message, not the browser bubble, in ${locale} (sad path)`, async ({
			page
		}) => {
			// GIVEN: The page in the language, with a user selected.
			const api = await mockApi(page, { users: [ada], tasks: adaTasks });
			await page
				.context()
				.addCookies([{ name: 'PARAGLIDE_LOCALE', value: locale, url: 'http://localhost:4173' }]);
			await page.goto('/');
			await page.getByRole('button', { name: /Ada Lovelace/ }).click();
			await page.locator('#title').waitFor();

			// WHEN: Each form is submitted empty, with the keyboard.
			await page.locator('#name').press('Enter');
			await page.locator('#title').press('Enter');

			// THEN: Our messages are shown, the fields are marked invalid, nothing was sent, and the
			// first invalid field of the last form has the focus.
			await expect(page.getByText(messages[locale]!['validation_name_required']!)).toBeVisible();
			await expect(page.getByText(messages[locale]!['validation_title_required']!)).toBeVisible();
			await expect(page.locator('#name')).toHaveAttribute('aria-invalid', 'true');
			await expect(page.locator('#title')).toBeFocused();
			expect(calls(api, 'POST /users')).toBe(0);
			expect(calls(api, 'POST /tasks')).toBe(0);
		});
	}

	test('the buttons stay enabled while the form is invalid (happy path)', async ({ page }) => {
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);

		await expect(page.getByRole('button', { name: 'Create User' })).toBeEnabled();
		await expect(page.getByRole('button', { name: 'Add Task' })).toBeEnabled();
	});

	test('Add Task, busy during a slow request, keeps its focus and sends once (limit)', async ({
		page
	}) => {
		// GIVEN: A creation that waits.
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		const release = await slowRoute(page, 'POST', '**/api/v1/tasks');
		await page.locator('#title').fill('Plan');
		const button = page.getByRole('button', { name: 'Add Task' });
		await button.focus();

		// WHEN: It is pressed, then pressed again while it waits.
		await page.keyboard.press('Enter');
		const busy = page.getByRole('button', { name: 'Adding…' });
		await expect(busy).toHaveAttribute('aria-busy', 'true');
		await page.keyboard.press('Enter');

		// THEN: Enabled, focused, no violation, one request; busy ends with the answer.
		await expect(busy).toBeEnabled();
		await expect(busy).toBeFocused();
		const { violations } = await new AxeBuilder({ page }).analyze();
		expect(violations.map((violation) => violation.id)).toEqual([]);
		release();
		await expect(page.getByRole('button', { name: 'Add Task' })).not.toHaveAttribute(
			'aria-busy',
			'true'
		);
		expect(calls(api, 'POST /tasks')).toBe(1);
	});

	test('Create User, busy during a slow request at 320 px, does not widen the page (boundary)', async ({
		page
	}) => {
		await page.setViewportSize({ width: 320, height: 800 });
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		const release = await slowRoute(page, 'POST', '**/api/v1/users');
		await page.locator('#name').fill('Grace');
		await page.locator('#email').fill('grace@example.com');

		await page.locator('#email').press('Enter');

		const busy = page.getByRole('button', { name: 'Creating…' });
		await expect(busy).toHaveAttribute('aria-busy', 'true');
		await expect(busy).toBeEnabled();
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
		release();
	});

	test('Save keeps its label and is busy during a slow request (limit)', async ({ page }) => {
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Edit Review', exact: true }).click();
		const release = await slowRoute(page, 'PUT', '**/api/v1/tasks/*');
		const save = page.getByRole('button', { name: 'Save' });
		await save.focus();

		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');

		await expect(save).toHaveAttribute('aria-busy', 'true');
		await expect(save).toBeEnabled();
		await expect(save).toBeFocused();
		await expect(save).toHaveText('Save');
		release();
		await expect(save).toHaveCount(0);
		expect(calls(api, 'PUT /tasks/{id}')).toBe(1);
	});
});

// Leaving a field: an error shown at that moment must not cost the click on a button of the form.
test.describe('Leaving a field for a button (mocked API)', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('a mouse click on Add Task right after leaving an invalid title is not lost (limit)', async ({
		page
	}) => {
		// GIVEN: A title typed then emptied, the focus still in it.
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.locator('#title').fill('x');
		await page.locator('#title').fill('');

		// WHEN: The button is pressed with the mouse: the press takes the focus out of the title.
		await page.getByRole('button', { name: 'Add Task' }).click();

		// THEN: The click went through (the form validated and focused the title), nothing was sent.
		await expect(page.getByText('Title is required')).toBeVisible();
		await expect(page.locator('#title')).toBeFocused();
		expect(calls(api, 'POST /tasks')).toBe(0);
	});

	test('a mouse click on Cancel right after leaving an invalid edit title closes the edit (limit)', async ({
		page
	}) => {
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Edit Review', exact: true }).click();
		await page.locator('#edit-title-10').fill('');

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
	});

	test('leaving an invalid title with Tab still shows its error (boundary)', async ({
		page,
		browserName
	}) => {
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.locator('#title').fill('x');
		await page.locator('#title').fill('');

		await page.keyboard.press(nextFocusKey(browserName));

		await expect(page.getByText('Title is required')).toBeVisible();
	});
});
