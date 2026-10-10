import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ada, adaTasks, grace, mockApi, openHomeWithUser } from './support/mock-api';

// Every state is checked with the full default axe rule set (WCAG 2.x A/AA and
// best practices). The API is mocked: no backend needed.

async function expectNoViolations(page: Page) {
	const { violations } = await new AxeBuilder({ page }).analyze();
	const summary = violations.flatMap((violation) =>
		violation.nodes.map(
			(node) => `${violation.id}: ${node.target.join(' ')} (${node.any[0]?.message ?? ''})`
		)
	);
	expect(summary).toEqual([]);
}

test.describe('Accessibility (axe, mocked API)', () => {
	test.beforeEach(async ({ page }) => {
		// The entry animation is not what is measured; reduced motion keeps the
		// toasts in their final colors while axe reads them.
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('home page without any user has no violation (limit)', async ({ page }) => {
		// GIVEN: An API without users.
		await mockApi(page);

		// WHEN: The home page is loaded.
		await page.goto('/');
		await expect(page.getByText('No users yet')).toBeVisible();

		// THEN: It has a title, a main landmark and no violation.
		await expect(page).toHaveTitle(/\S/);
		await expect(page.getByRole('main')).toHaveCount(1);
		await expectNoViolations(page);
	});

	test('selected user with open and completed tasks has no violation (happy path)', async ({
		page
	}) => {
		// GIVEN: Two users, the first with an open and a completed task.
		await mockApi(page, { users: [ada, grace], tasks: adaTasks });

		// WHEN: The first user is selected.
		await openHomeWithUser(page);
		await expect(page.getByRole('checkbox', { name: 'Review 2', exact: true })).toBeChecked();

		// THEN: No violation (struck-through title included).
		await expectNoViolations(page);
	});

	test('a task being edited has no violation (happy path)', async ({ page }) => {
		// GIVEN: A selected user with tasks.
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);

		// WHEN: A task is being edited.
		await page.getByRole('button', { name: 'Edit Review', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

		// THEN: No violation.
		await expectNoViolations(page);
	});

	test('forms showing validation errors have no violation (sad path)', async ({ page }) => {
		// GIVEN: A selected user with tasks.
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);

		// WHEN: The user form and an edit are submitted with invalid values.
		await page.getByLabel('Name', { exact: true }).fill('   ');
		await page.getByLabel('Email', { exact: true }).fill('a@example.com');
		await page.getByRole('button', { name: 'Create User' }).click();
		await page.getByRole('button', { name: 'Edit Review', exact: true }).click();
		await page.getByLabel('Task Title').nth(1).fill('');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText('Name is required')).toBeVisible();
		await expect(page.getByText('Title is required')).toBeVisible();

		// THEN: No violation.
		await expectNoViolations(page);
	});

	test('fields in error and in success after leaving them have no violation (happy path)', async ({
		page
	}) => {
		// GIVEN: A selected user.
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);

		// WHEN: A valid name and an invalid e-mail are left.
		await page.getByLabel('Name', { exact: true }).fill('Grace');
		await page.getByLabel('Name', { exact: true }).blur();
		await page.getByLabel('Email', { exact: true }).fill('grace@');
		await page.getByLabel('Email', { exact: true }).blur();
		await expect(page.getByText('Invalid email address')).toBeVisible();
		await expect(
			page.getByLabel('Name', { exact: true }).locator('xpath=..').locator('svg[data-icon="check"]')
		).toBeVisible();

		// THEN: No violation.
		await expectNoViolations(page);
	});

	test('error and information toasts with the error banner have no violation (exception)', async ({
		page
	}) => {
		// GIVEN: A selected user; the next toggle fails, the one after finds the task gone.
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		api.failNext('PUT /tasks/{id}', { status: 500, error: 'Database unavailable' });
		// WHEN: Both failures happen.
		await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
		await expect(page.getByRole('alert').getByText('Database unavailable')).toBeVisible();
		api.failNext('PUT /tasks/{id}', {
			status: 404,
			error: 'Task not found',
			code: 'TASK_NOT_FOUND'
		});
		await page.getByRole('checkbox', { name: 'Review 2', exact: true }).click();
		await expect(page.getByRole('status').getByText('Task already deleted')).toBeVisible();

		// THEN: No violation.
		await expectNoViolations(page);
	});

	for (const width of [1280, 320]) {
		test(`the toast with its Undo button has no violation at ${width} px (happy path)`, async ({
			page
		}) => {
			// GIVEN: A selected user, at the width.
			await page.setViewportSize({ width, height: 800 });
			await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);

			// WHEN: A task is deleted and its Undo toast is shown.
			await page.getByRole('button', { name: 'Delete Review 2' }).click();
			await expect(page.getByRole('status').getByRole('button', { name: 'Undo' })).toBeVisible();

			// THEN: No violation.
			await expectNoViolations(page);
		});
	}

	test('statistics page has no violation and declares the interface language (happy path)', async ({
		page
	}) => {
		// GIVEN: Statistics are available.
		await mockApi(page, { users: [ada, grace], tasks: adaTasks });

		// WHEN: The statistics page is loaded.
		await page.goto('/stats');
		await expect(page.getByText('Average tasks per user')).toBeVisible();

		// THEN: It has a title, the page language on <html>, and no violation.
		await expect(page).toHaveTitle(/\S/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expectNoViolations(page);
	});

	test('statistics page in error has no violation (sad path)', async ({ page }) => {
		// GIVEN: The statistics endpoint fails.
		const api = await mockApi(page);
		api.failNext('GET /stats', { status: 500, error: 'Database unavailable' });

		// WHEN: The statistics page is loaded.
		await page.goto('/stats');
		await expect(page.getByText('Statistics could not be loaded.')).toBeVisible();

		// THEN: The failure state and its toast have no violation.
		await expectNoViolations(page);
	});
});
