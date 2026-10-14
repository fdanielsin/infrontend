import { expect, test, type Page } from '@playwright/test';
import { API } from '../support/api-url';

// "Mark all as done" against the real backend (FP-04, criteria 5 and 12): what exists only with
// the real server behind the real browser, the tasks read again from the API after the marking and
// after Undo. A refused request (criterion 9) cannot be made by a real server: it stays mocked.

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PUT_TASK = (response: { url(): string; request(): { method(): string } }) =>
	/\/api\/v1\/tasks\/\d+$/.test(response.url()) && response.request().method() === 'PUT';

interface ApiTask {
	id: number;
	title: string;
	completed: boolean;
}

async function listTasks(userId: number): Promise<ApiTask[]> {
	const response = await fetch(`${API}/api/v1/users/${userId}/tasks`);
	return ((await response.json()) as { data: ApiTask[] }).data;
}

async function createUser(page: Page, name: string): Promise<number> {
	const usersLoaded = page.waitForResponse(
		(response) => response.url().endsWith('/api/v1/users') && response.request().method() === 'GET'
	);
	await page.goto('/');
	await usersLoaded;
	await page.getByLabel('Name').fill(name);
	await page.getByLabel('Email').fill(`mark-all-${suffix()}@example.com`);
	const created = page.waitForResponse(
		(response) => response.url().endsWith('/api/v1/users') && response.request().method() === 'POST'
	);
	await page.getByRole('button', { name: 'Create User' }).click();
	const body = (await (await created).json()) as { data: { id: number } };
	await page.getByRole('button', { name: new RegExp(`^${name} [^(]`) }).click();
	await expect(page.getByRole('heading', { name: `Tasks for ${name}` })).toBeVisible();
	return body.data.id;
}

async function addTask(page: Page, title: string) {
	await page.getByLabel('Task Title').fill(title);
	await page.getByRole('button', { name: 'Add Task' }).click();
	await expect(page.getByRole('checkbox', { name: title, exact: true })).toBeVisible();
}

test.describe('Mark all as done (real backend)', () => {
	test('TASK-R23: marks exactly the tasks to do, and Undo puts them back, read from the server (happy path)', async ({
		page
	}) => {
		// GIVEN: A user with two tasks to do and one already done.
		const name = `Mark All ${suffix()}`;
		const userId = await createUser(page, name);
		const [first, second, third] = [`A ${suffix()}`, `B ${suffix()}`, `C ${suffix()}`];
		for (const title of [first, second, third]) await addTask(page, title);
		const doneAlready = page.waitForResponse(PUT_TASK);
		await page.getByRole('checkbox', { name: third, exact: true }).check();
		await doneAlready;

		// WHEN: The command is activated, counting the requests it sends.
		let updates = 0;
		page.on('response', (response) => PUT_TASK(response) && updates++);
		await page.getByRole('button', { name: 'Mark all as done', exact: true }).click();
		await expect(page.getByRole('status').getByText('All tasks marked as done')).toBeVisible();

		// THEN: Two requests left, the three tasks are done on the server and the title says so.
		expect(updates).toBe(2);
		expect((await listTasks(userId)).map((task) => task.completed)).toEqual([true, true, true]);
		await expect(page.getByRole('heading', { name: 'All done' })).toBeVisible();

		// WHEN: Undo is pressed within the 6 s.
		await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
		await expect(page.getByRole('button', { name: 'Mark all as done', exact: true })).toBeVisible();

		// THEN: The two tasks are to do on the server, the one done before stays done.
		const after = await listTasks(userId);
		expect(after.find((task) => task.title === first)?.completed).toBe(false);
		expect(after.find((task) => task.title === second)?.completed).toBe(false);
		expect(after.find((task) => task.title === third)?.completed).toBe(true);
		await page.reload();
		await page.getByRole('button', { name: new RegExp(`^${name} [^(]`) }).click();
		await expect(page.getByRole('checkbox', { name: first, exact: true })).not.toBeChecked();
		await expect(page.getByRole('checkbox', { name: third, exact: true })).toBeChecked();
	});
});
