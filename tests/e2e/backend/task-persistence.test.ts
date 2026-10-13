import { expect, test, type Page } from '@playwright/test';

function uniqueSuffix(): string {
	return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function openHome(page: Page): Promise<void> {
	const usersLoaded = page.waitForResponse(
		(response) => response.url().endsWith('/api/v1/users') && response.request().method() === 'GET'
	);
	await page.goto('/');
	await usersLoaded;
	await expect(page.getByRole('button', { name: 'Create User' })).toBeEnabled();
}

async function selectUser(page: Page, userName: string): Promise<void> {
	const tasksLoaded = page.waitForResponse(
		(response) => /\/api\/v1\/users\/\d+\/tasks$/.test(response.url()) && response.ok()
	);
	await page.getByRole('button', { name: new RegExp(`^${userName} [^(]`) }).click();
	await tasksLoaded;
	await expect(page.getByRole('heading', { name: `Tasks for ${userName}` })).toBeVisible();
}

async function reloadAndSelect(page: Page, userName: string): Promise<void> {
	const usersLoaded = page.waitForResponse(
		(response) => response.url().endsWith('/api/v1/users') && response.request().method() === 'GET'
	);
	await page.reload();
	await usersLoaded;
	await selectUser(page, userName);
}

function waitForTaskUpdate(page: Page) {
	return page.waitForResponse(
		(response) =>
			/\/api\/v1\/tasks\/\d+$/.test(response.url()) && response.request().method() === 'PUT'
	);
}

async function createUserWithTask(page: Page, userName: string, taskTitle: string): Promise<void> {
	await openHome(page);
	await page.getByLabel('Name').fill(userName);
	await page.getByLabel('Email').fill(`persist-${uniqueSuffix()}@example.com`);
	await page.getByRole('button', { name: 'Create User' }).click();
	await selectUser(page, userName);

	await page.getByLabel('Task Title').fill(taskTitle);
	await page.getByLabel('Description').fill('Initial description');
	await page.getByRole('button', { name: 'Add Task' }).click();
	await expect(page.getByText(taskTitle)).toBeVisible();
}

test.describe('Task persistence across reloads', () => {
	test('keeps a task unchecked after reload once it has been unchecked (sad path of Q-01)', async ({
		page
	}) => {
		// GIVEN: A user with one open task.
		const userName = `Persist User ${uniqueSuffix()}`;
		const taskTitle = `Persist Task ${uniqueSuffix()}`;
		await createUserWithTask(page, userName, taskTitle);

		// WHEN: The task is completed and the page is reloaded.
		const completed = waitForTaskUpdate(page);
		await page.getByRole('checkbox', { name: taskTitle, exact: true }).check();
		expect((await completed).ok()).toBe(true);
		await reloadAndSelect(page, userName);

		// THEN: The completion survived the reload.
		await expect(page.getByRole('checkbox', { name: taskTitle, exact: true })).toBeChecked();

		// WHEN: The task is unchecked and the page is reloaded.
		const uncompleted = waitForTaskUpdate(page);
		await page.getByRole('checkbox', { name: taskTitle, exact: true }).uncheck();
		expect((await uncompleted).ok()).toBe(true);
		await reloadAndSelect(page, userName);

		// THEN: The task is still unchecked after the reload.
		await expect(page.getByRole('checkbox', { name: taskTitle, exact: true })).not.toBeChecked();
	});

	test('keeps edited content and completion after reload (happy path)', async ({ page }) => {
		// GIVEN: A user with one completed task.
		const userName = `Persist User ${uniqueSuffix()}`;
		const taskTitle = `Persist Task ${uniqueSuffix()}`;
		const editedTitle = `${taskTitle} edited`;
		await createUserWithTask(page, userName, taskTitle);
		const completed = waitForTaskUpdate(page);
		await page.getByRole('checkbox', { name: taskTitle, exact: true }).check();
		expect((await completed).ok()).toBe(true);

		// WHEN: Title and description are edited and the page is reloaded.
		await page.getByRole('button', { name: `Edit ${taskTitle}` }).click();
		await page.getByLabel('Task Title').nth(1).fill(editedTitle);
		await page.getByLabel('Description').nth(1).fill('Edited description');
		const edited = waitForTaskUpdate(page);
		await page.getByRole('button', { name: 'Save' }).click();
		expect((await edited).ok()).toBe(true);
		await reloadAndSelect(page, userName);

		// THEN: The edit and the completion both survived the reload.
		await expect(page.getByText(editedTitle)).toBeVisible();
		await expect(page.getByText('Edited description')).toBeVisible();
		await expect(page.getByRole('checkbox', { name: editedTitle, exact: true })).toBeChecked();
	});
});
