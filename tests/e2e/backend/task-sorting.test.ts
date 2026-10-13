import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { API } from '../support/api-url';

// Needs the real backend. The test creates its own "E2E sorting" user (the API cannot delete a
// user, so it stays) and deletes every task it created at the end, even when it fails.

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const userName = `E2E sorting ${suffix}`;
const CREATION_ORDER = ['b', 'a', '10'];
const TITLE_ORDER = ['10', 'a', 'b'];

interface TaskRecord {
	id: number;
	title: string;
}

let userId = 0;

const titles = (page: Page) => page.locator('li label').allTextContents();
const orderSelect = (page: Page) => page.getByLabel('Sort by', { exact: true });

async function tasksOfUser(): Promise<TaskRecord[]> {
	const api = await playwrightRequest.newContext();
	try {
		const response = await api.get(`${API}/api/v1/users/${userId}/tasks`);
		return ((await response.json()) as { data: TaskRecord[] }).data;
	} finally {
		await api.dispose();
	}
}

async function openAsUser(page: Page) {
	const usersLoaded = page.waitForResponse(
		(response) => response.url().endsWith('/api/v1/users') && response.request().method() === 'GET'
	);
	await page.goto('/');
	await usersLoaded;
	const tasksLoaded = page.waitForResponse(
		(response) => /\/api\/v1\/users\/\d+\/tasks$/.test(response.url()) && response.ok()
	);
	await page.getByRole('button', { name: new RegExp(`^${userName} [^(]`) }).click();
	await tasksLoaded;
}

test.describe.serial('Task sorting on the real backend', () => {
	test.beforeAll(async () => {
		const api = await playwrightRequest.newContext();
		try {
			const response = await api.post(`${API}/api/v1/users`, {
				data: { name: userName, email: `e2e-sorting-${suffix}@example.com` }
			});
			expect(response.status()).toBe(201);
			userId = ((await response.json()) as { data: { id: number } }).data.id;
		} finally {
			await api.dispose();
		}
	});

	test.afterAll(async () => {
		if (!userId) return;
		const api = await playwrightRequest.newContext();
		try {
			const tasks = await api.get(`${API}/api/v1/users/${userId}/tasks`);
			if (!tasks.ok()) return;
			for (const task of ((await tasks.json()) as { data: TaskRecord[] }).data) {
				await api.delete(`${API}/api/v1/tasks/${task.id}`);
			}
		} finally {
			await api.dispose();
		}
	});

	test('sorts by title in the interface, remembers it after a reload, and the API stays in creation order (happy path)', async ({
		page
	}) => {
		// GIVEN: A new user who creates the tasks "b", "a" and "10" through the interface.
		await openAsUser(page);
		for (const title of CREATION_ORDER) {
			const created = page.waitForResponse(
				(response) =>
					response.url().endsWith('/api/v1/tasks') && response.request().method() === 'POST'
			);
			await page.getByRole('textbox', { name: 'Task Title' }).fill(title);
			await page.getByRole('button', { name: 'Add Task' }).click();
			expect((await created).status()).toBe(201);
			await expect(page.locator('li label')).toHaveCount(CREATION_ORDER.indexOf(title) + 1);
		}
		expect(await titles(page)).toEqual(CREATION_ORDER);

		// WHEN: The title order is chosen.
		await orderSelect(page).selectOption('title');

		// THEN: Numbers come before letters, and the choice survives a reload.
		expect(await titles(page)).toEqual(TITLE_ORDER);
		await openAsUser(page);
		await expect(orderSelect(page)).toHaveValue('title');
		expect(await titles(page)).toEqual(TITLE_ORDER);

		// THEN: The server list is untouched, in ascending id order.
		const records = await tasksOfUser();
		expect(records.map((task) => task.title)).toEqual(CREATION_ORDER);
		expect(records.map((task) => task.id)).toEqual(
			records.map((task) => task.id).sort((a, b) => a - b)
		);

		// WHEN: The creation order is chosen again.
		await orderSelect(page).selectOption('created');

		// THEN: The original order is back, exactly.
		expect(await titles(page)).toEqual(CREATION_ORDER);
	});
});
