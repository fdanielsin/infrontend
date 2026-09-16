import { test, expect } from '@playwright/test';

test.describe('Task Manager App', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:5173');
	});

	test('should display the app title', async ({ page }) => {
		await expect(page.locator('h1')).toContainText('Task Manager');
	});

	test('should render user form and task form', async ({ page }) => {
		await expect(page.locator('text=Create User')).toBeVisible();
		await expect(page.locator('text=Task Manager')).toBeVisible();
	});

	test('should create a new user', async ({ page }) => {
		const nameInput = page.locator('input[id="name"]');
		const emailInput = page.locator('input[id="email"]');
		const submitButton = page.locator('button:has-text("Create User")');

		await nameInput.fill('John Doe');
		await emailInput.fill('john@example.com');
		await submitButton.click();

		// Wait for user to appear in the list
		await expect(page.locator('text=John Doe')).toBeVisible();
		await expect(page.locator('text=john@example.com')).toBeVisible();
	});

	test('should display user count', async ({ page }) => {
		await expect(page.locator('text=Users (1)')).toBeVisible();
	});

	test('should show validation error for invalid email', async ({ page }) => {
		const emailInput = page.locator('input[id="email"]');
		const submitButton = page.locator('button:has-text("Create User")');

		await emailInput.fill('invalid-email');
		await submitButton.click();

		// HTML5 validation should prevent submission
		await expect(page.locator('input[id="email"]')).toBeFocused();
	});
});

test.describe('Task Management', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:5173');
	});

	test('should show message when no user is selected', async ({ page }) => {
		await expect(page.locator('text=Select a user to manage tasks')).toBeVisible();
	});
});
