import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './support/axe';
import { nextFocusKey } from './support/keyboard';
import { horizontalOverflow } from './support/layout';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// The submit buttons are never disabled: validation happens on press, with our messages (never the
// browser bubble, visual review 22), and a slow request only marks the button busy. API mocked.
// What each button does with its state (busy, enabled, a second press ignored, the label) is tested
// by SubmitButtons.test.ts; kept here: the validation bubble of a real browser, and the busy
// buttons in a real page (contrast, width at 320 px, the focus).

const calls = (api: { calls: string[] }, operation: string) =>
	api.calls.filter((call) => call === operation).length;

// Holds the answer to every request of that method and address until the returned function is called.
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

	test('an empty form shows our message, not the browser bubble, and the focus goes to its first invalid field (sad path)', async ({
		page
	}) => {
		// GIVEN: A selected user, so that both forms are on the page.
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);

		// WHEN: Each form is submitted empty, with the keyboard (a disabled button, or the validation of
		// the browser, would stop the submission and show its own bubble).
		await page.locator('#name').press('Enter');
		await page.locator('#title').press('Enter');

		// THEN: Our messages are shown, the fields are marked invalid, nothing was sent, and the focus
		// is on the first invalid field of the last form.
		await expect(page.getByText('Name is required')).toBeVisible();
		await expect(page.getByText('Title is required')).toBeVisible();
		await expect(page.locator('#name')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('#title')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('#title')).toBeFocused();
		expect(calls(api, 'POST /users')).toBe(0);
		expect(calls(api, 'POST /tasks')).toBe(0);
	});

	test('the three submit buttons stay enabled and keep their label and focus while their request waits, with no violation and no sideways scroll (limit)', async ({
		page
	}) => {
		// GIVEN: A selected user, a task in edition, and an answer that waits for each of the three
		// requests.
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Edit Review', exact: true }).click();
		const releaseUser = await slowRoute(page, 'POST', '**/api/v1/users');
		const releaseTask = await slowRoute(page, 'POST', '**/api/v1/tasks');
		const releaseSave = await slowRoute(page, 'PUT', '**/api/v1/tasks/*');

		await test.step('Create User, pressed in the e-mail field', async () => {
			await page.locator('#name').fill('Grace');
			await page.locator('#email').fill('grace@example.com');
			await page.locator('#email').press('Enter');

			const busy = page.getByRole('button', { name: 'Creating…' });
			await expect(busy).toHaveAttribute('aria-busy', 'true');
			await expect(busy).toBeEnabled();
		});

		await test.step('Add Task, pressed twice from the keyboard', async () => {
			await page.locator('#title').fill('Plan');
			await page.getByRole('button', { name: 'Add Task' }).focus();
			await page.keyboard.press('Enter');
			const busy = page.getByRole('button', { name: 'Adding…' });
			await expect(busy).toHaveAttribute('aria-busy', 'true');
			await page.keyboard.press('Enter');

			await expect(busy).toBeEnabled();
			await expect(busy).toBeFocused();
		});

		await test.step('Save, pressed twice from the keyboard', async () => {
			const save = page.getByRole('button', { name: 'Save' });
			await save.focus();
			await page.keyboard.press('Enter');
			await page.keyboard.press('Enter');

			await expect(save).toHaveAttribute('aria-busy', 'true');
			await expect(save).toBeEnabled();
			await expect(save).toBeFocused();
			await expect(save).toHaveText('Save');
		});

		await test.step('the page with the three busy buttons', async () => {
			await expectNoAxeViolations(page);
			await page.setViewportSize({ width: 320, height: 800 });
			expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		});

		await test.step('the answers come: each button settles after one request', async () => {
			releaseUser();
			releaseTask();
			releaseSave();

			await expect(page.getByRole('button', { name: 'Create User' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Add Task' })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
			expect(calls(api, 'POST /users')).toBe(1);
			expect(calls(api, 'POST /tasks')).toBe(1);
			expect(calls(api, 'PUT /tasks/{id}')).toBe(1);
		});
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
