import { expect, test } from '@playwright/test';

test.describe('Task management', () => {
	test('creates a user and task and displays updated statistics (happy path)', async ({ page }) => {
		// GIVEN: The frontend is connected to a running inbackend API.
		const userName = `E2E User ${Date.now()}`;
		const userEmail = `e2e-${Date.now()}@example.com`;
		const taskTitle = `E2E Task ${Date.now()}`;

		// WHEN: Create a user from the home page.
		const usersResponse = page.waitForResponse(
			(response) =>
				response.url().endsWith('/api/v1/users') && response.request().method() === 'GET'
		);
		await page.goto('/');
		await usersResponse;
		await expect(page.getByRole('heading', { name: 'Task Manager' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Create User' })).toBeEnabled();
		await page.getByLabel('Name').fill(userName);
		await page.getByLabel('Email').fill(userEmail);
		await page.getByRole('button', { name: 'Create User' }).click();

		// THEN: The new user is displayed and can be selected.
		await expect(page.getByText(userEmail)).toBeVisible();
		await page.getByRole('button', { name: new RegExp(userName) }).click();
		await expect(page.getByRole('heading', { name: `Tasks for ${userName}` })).toBeVisible();

		// WHEN: Create a task for the selected user.
		await page.getByLabel('Task Title').fill(taskTitle);
		await page.getByLabel('Description').fill('Created by the frontend E2E test');
		await page.getByRole('button', { name: 'Add Task' }).click();

		// THEN: The task is displayed and can be edited, completed and deleted.
		await expect(page.getByText(taskTitle)).toBeVisible();
		await page.getByRole('button', { name: `Edit ${taskTitle}` }).click();
		await page.getByLabel('Task Title').nth(1).fill(`${taskTitle} updated`);
		await page.getByLabel('Description').nth(1).fill('Updated by the frontend E2E test');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText(`${taskTitle} updated`)).toBeVisible();
		const checkbox = page.getByRole('checkbox', { name: `${taskTitle} updated`, exact: true });
		await expect(checkbox).not.toBeChecked();
		await checkbox.check();
		await expect(checkbox).toBeChecked();
		await page.getByRole('button', { name: `Delete ${taskTitle} updated` }).click();
		await expect(page.getByText(`${taskTitle} updated`)).not.toBeVisible();

		// Statistics remain available after task management operations.
		await page.getByRole('link', { name: /View Statistics/ }).click();
		await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible();
		const tiles = page.locator('[data-stat]');
		const tileOf = (label: string) =>
			tiles.filter({ has: page.getByText(new RegExp(`^\\W*${label}$`)) });
		await expect(tiles).toHaveCount(3);
		await expect(tileOf('Users')).toBeVisible();
		await expect(tileOf('Tasks')).toBeVisible();
		await expect(tileOf('Average tasks per user')).toBeVisible();
		// The user created above is counted (the database is shared, so only a floor is known).
		const usersCount = await tileOf('Users').locator('[data-stat-value]').innerText();
		expect(Number(usersCount.replace(/\D/g, ''))).toBeGreaterThanOrEqual(1);
	});

	test('shows a validation error for an invalid user name (sad path)', async ({ page }) => {
		// GIVEN: The user form is empty.
		const usersResponse = page.waitForResponse(
			(response) =>
				response.url().endsWith('/api/v1/users') && response.request().method() === 'GET'
		);
		await page.goto('/');
		await usersResponse;
		await expect(page.getByRole('button', { name: 'Create User' })).toBeEnabled();
		const usersHeading = page.getByRole('heading', { name: /Users \(\d+\)/ });
		const initialUsersHeading = await usersHeading.textContent();

		// WHEN: Submit a name that violates the frontend validation rule.
		await page.getByLabel('Name').fill('   ');
		await page.getByLabel('Email').fill('invalid@example.com');
		await page.getByRole('button', { name: 'Create User' }).click();

		// THEN: The validation error is shown and no user is created.
		await expect(page.getByText('Name is required')).toBeVisible();
		await expect(usersHeading).toHaveText(initialUsersHeading ?? '');
	});
});
