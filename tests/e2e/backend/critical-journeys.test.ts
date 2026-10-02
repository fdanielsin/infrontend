import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Needs the real backend: these journeys complete what the other real-backend files do not cover.
const API = process.env.PUBLIC_API_URL || 'http://localhost:8080';

interface UserRecord {
	id: number;
	name: string;
	email: string;
}
interface TaskRecord {
	id: number;
	title: string;
}

const uniqueSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function createUser(request: APIRequestContext, prefix: string): Promise<UserRecord> {
	const suffix = uniqueSuffix();
	const response = await request.post(`${API}/api/v1/users`, {
		data: { name: `${prefix} ${suffix}`, email: `${prefix.toLowerCase()}-${suffix}@example.com` }
	});
	expect(response.status()).toBe(201);
	return ((await response.json()) as { data: UserRecord }).data;
}

async function createTask(
	request: APIRequestContext,
	userId: number,
	title: string
): Promise<TaskRecord> {
	const response = await request.post(`${API}/api/v1/tasks`, {
		data: { user_id: userId, title }
	});
	expect(response.status()).toBe(201);
	return ((await response.json()) as { data: TaskRecord }).data;
}

async function tasksOf(request: APIRequestContext, userId: number): Promise<TaskRecord[]> {
	const response = await request.get(`${API}/api/v1/users/${userId}/tasks`);
	return ((await response.json()) as { data: TaskRecord[] }).data;
}

async function openHome(page: Page) {
	const usersLoaded = page.waitForResponse(
		(response) => response.url().endsWith('/api/v1/users') && response.request().method() === 'GET'
	);
	await page.goto('/');
	await usersLoaded;
}

async function selectUser(page: Page, userName: string) {
	const tasksLoaded = page.waitForResponse(
		(response) => /\/api\/v1\/users\/\d+\/tasks$/.test(response.url()) && response.ok()
	);
	await page.getByRole('button', { name: new RegExp(userName) }).click();
	await tasksLoaded;
	await expect(page.getByRole('heading', { name: `Tasks for ${userName}` })).toBeVisible();
}

function waitForTaskCall(page: Page, method: 'PUT' | 'DELETE', taskId: number) {
	return page.waitForResponse(
		(response) =>
			response.url().endsWith(`/api/v1/tasks/${taskId}`) && response.request().method() === method
	);
}

test.describe('Critical journeys on the real backend', () => {
	test('deletes a task for good: gone after a reload and from the API (happy path)', async ({
		page,
		request
	}) => {
		// GIVEN: A user with two tasks, displayed in the interface.
		const user = await createUser(request, 'Delete');
		const gone = await createTask(request, user.id, `Delete me ${uniqueSuffix()}`);
		const kept = await createTask(request, user.id, `Keep me ${uniqueSuffix()}`);
		await openHome(page);
		await selectUser(page, user.name);

		// WHEN: One task is deleted from the interface.
		const deleted = waitForTaskCall(page, 'DELETE', gone.id);
		await page.getByRole('button', { name: `Delete ${gone.title}`, exact: true }).click();
		expect((await deleted).ok()).toBe(true);

		// THEN: It is gone from the list, after a reload, and from the server; the other one stays.
		await expect(page.getByText(gone.title)).toHaveCount(0);
		await openHome(page);
		await selectUser(page, user.name);
		await expect(page.getByText(kept.title)).toBeVisible();
		await expect(page.getByText(gone.title)).toHaveCount(0);
		expect((await tasksOf(request, user.id)).map((task) => task.id)).toEqual([kept.id]);
	});

	test('saving an edit of a task deleted elsewhere removes the line with an information (limit)', async ({
		page,
		request
	}) => {
		// GIVEN: A task being edited in the interface.
		const user = await createUser(request, 'Edited');
		const task = await createTask(request, user.id, `Edited away ${uniqueSuffix()}`);
		await openHome(page);
		await selectUser(page, user.name);
		await page.getByRole('button', { name: `Edit ${task.title}` }).click();
		await page.getByLabel('Task Title').nth(1).fill(`${task.title} renamed`);

		// WHEN: The task is deleted elsewhere, then the edit is saved.
		expect((await request.delete(`${API}/api/v1/tasks/${task.id}`)).status()).toBe(200);
		const saved = waitForTaskCall(page, 'PUT', task.id);
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		expect((await saved).status()).toBe(404);

		// THEN: The line disappears with the information, no error is shown, and nothing is recreated.
		await expect(page.getByText(task.title)).toHaveCount(0);
		await expect(
			page.getByRole('status').filter({ hasText: 'Task already deleted' })
		).toBeVisible();
		await expect(page.getByRole('alert')).toBeEmpty();
		expect(await tasksOf(request, user.id)).toEqual([]);
	});

	test('shows a taken email from its error code, in English then in French after a switch (sad path)', async ({
		page,
		request
	}) => {
		// GIVEN: An existing user, and the interface in English once the users are loaded.
		const existing = await createUser(request, 'Taken');
		await openHome(page);

		// WHEN: A user is created with the same email.
		let refused = page.waitForResponse(
			(response) =>
				response.url().endsWith('/api/v1/users') && response.request().method() === 'POST'
		);
		await page.getByLabel('Name', { exact: true }).fill('Second');
		await page.getByLabel('Email', { exact: true }).fill(existing.email);
		await page.getByRole('button', { name: 'Create User' }).click();
		expect((await refused).status()).toBe(409);

		// THEN: The server refusal is shown in English; the toast is then dismissed, so that only
		// the form error, rewritten at the next attempt, still carries the English text.
		const alerts = page.getByRole('alert');
		await expect(alerts.getByText('Email already in use')).toBeVisible();
		await alerts.getByRole('button', { name: 'Dismiss notification' }).click();
		await expect(alerts.getByText('Email already in use')).toHaveCount(0);

		// WHEN: The interface is switched to French, and the same creation is sent with
		// Accept-Language: en, so that the server answers in English: only the error code can
		// give the French text.
		await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
		await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
		await page.route('**/api/v1/users', (route) =>
			route.request().method() === 'POST'
				? route.continue({ headers: { ...route.request().headers(), 'accept-language': 'en' } })
				: route.continue()
		);
		refused = page.waitForResponse(
			(response) =>
				response.url().endsWith('/api/v1/users') && response.request().method() === 'POST'
		);
		await page.getByLabel('Nom', { exact: true }).fill('Second');
		await page.getByLabel('Adresse e-mail', { exact: true }).fill(existing.email);
		await page.getByRole('button', { name: 'Créer un utilisateur' }).click();
		const secondRefusal = await refused;
		expect(secondRefusal.status()).toBe(409);
		expect(((await secondRefusal.json()) as { error: string }).error).toBe('Email already in use');

		// THEN: The refusal is shown in French from its code, never with the English server text,
		// and no second user exists.
		await expect(alerts.getByText('Cette adresse e-mail est déjà utilisée')).toBeVisible();
		await expect(page.getByText('Email already in use')).toHaveCount(0);
		const users = (await (await request.get(`${API}/api/v1/users`)).json()) as {
			data: UserRecord[];
		};
		expect(users.data.filter((user) => user.email === existing.email)).toHaveLength(1);
	});
});
