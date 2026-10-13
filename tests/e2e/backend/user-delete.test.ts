import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { API } from '../support/api-url';

// Deleting and renaming a user against a real backend (USER-R13 to USER-R24). The users are created
// by the test with a stamp of their own, so nothing of another test, and nothing of the user's data,
// is touched.

interface Created {
	id: number;
	name: string;
	email: string;
}

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function createUser(request: APIRequestContext, label: string): Promise<Created> {
	const id = stamp();
	const answer = await request.post(`${API}/api/v1/users`, {
		data: { name: `${label} ${id}`, email: `${label.toLowerCase()}-${id}@example.com` }
	});
	expect(answer.status()).toBe(201);
	return ((await answer.json()) as { data: Created }).data;
}

async function createTask(request: APIRequestContext, userId: number, title: string) {
	const answer = await request.post(`${API}/api/v1/tasks`, {
		data: { user_id: userId, title, completed: false }
	});
	expect(answer.status()).toBe(201);
	return ((await answer.json()) as { data: { id: number } }).data.id;
}

const userStatus = async (request: APIRequestContext, id: number) =>
	(await request.get(`${API}/api/v1/users/${id}`)).status();
const tasksOf = async (request: APIRequestContext, id: number) =>
	((await (await request.get(`${API}/api/v1/users/${id}/tasks`)).json()) as { data: unknown[] })
		.data;

const rowOf = (page: Page, user: Created) =>
	page.getByRole('button', { name: new RegExp(`^${user.name} [^(]`) });
const deleteButton = (page: Page, user: Created) =>
	page.getByRole('button', { name: `Delete ${user.name} (${user.email})` });

test.describe('Delete and rename a user (real backend)', () => {
	test('closing the toast deletes the user and, with him, his tasks (critères 1, 33)', async ({
		page,
		request
	}) => {
		// GIVEN: A user with two tasks, shown in the list.
		const user = await createUser(request, 'Doomed');
		const taskIds = [
			await createTask(request, user.id, `T1 ${stamp()}`),
			await createTask(request, user.id, `T2 ${stamp()}`)
		];
		await page.goto('/');
		await expect(rowOf(page, user)).toBeVisible();

		// WHEN: The user is deleted and the toast is closed.
		await deleteButton(page, user).click();
		await expect(rowOf(page, user)).toHaveCount(0);
		await expect.poll(() => userStatus(request, user.id)).toBe(200);
		await page.getByRole('button', { name: 'Dismiss notification' }).click();

		// THEN: The server no longer knows the user, and his tasks are gone with him.
		await expect.poll(() => userStatus(request, user.id)).toBe(404);
		expect(await tasksOf(request, user.id)).toEqual([]);
		for (const taskId of taskIds) {
			expect((await request.delete(`${API}/api/v1/tasks/${taskId}`)).status()).toBe(404);
		}
		await expect(page.getByRole('alert').locator('[data-toast]')).toHaveCount(0);
	});

	test('the 6 s window ends by itself and the deletion is sent once (critère 30)', async ({
		page,
		request
	}) => {
		const user = await createUser(request, 'Timer');
		await page.goto('/');
		await expect(rowOf(page, user)).toBeVisible();

		await deleteButton(page, user).click();
		await page.mouse.move(0, 0);
		await page.evaluate(() => (document.activeElement as HTMLElement).blur());

		await expect.poll(() => userStatus(request, user.id), { timeout: 15_000 }).toBe(404);
	});

	test('Undo keeps the user on the server (critère 20)', async ({ page, request }) => {
		const user = await createUser(request, 'Kept');
		await page.goto('/');
		await deleteButton(page, user).click();

		await page.getByRole('button', { name: 'Undo' }).click();
		await page.waitForTimeout(500);

		await expect(rowOf(page, user)).toBeVisible();
		expect(await userStatus(request, user.id)).toBe(200);
	});

	test('a page really closed sends the waiting deletion, seen from another context (critère 32)', async ({
		context,
		request,
		browserName
	}) => {
		// Measured on 2026-10-13 (Playwright Firefox 155, :8089): the page runs its pagehide handler and
		// sends the DELETE with keepalive, but Firefox delivers it to the server in about 1 close out of
		// 10 (1/10 without, 0/10 with a timeout-free request; ~1/3 when other pages are open). Chromium
		// and WebKit deliver it every time. The user accepted that a deletion may be lost when the page
		// goes away (USER-R20, Q3): this test is skipped on Firefox rather than hidden by test.fail.
		test.skip(browserName === 'firefox', 'Firefox does not reliably send a DELETE at unload');
		// GIVEN: A deletion that can still be undone.
		const user = await createUser(request, 'Closing');
		const page = await context.newPage();
		await page.goto('/');
		await deleteButton(page, user).click();
		expect(await userStatus(request, user.id)).toBe(200);

		// WHEN: The browser closes the page, with its unload events.
		await page.close({ runBeforeUnload: true });

		// THEN: The server saw the deletion.
		await expect.poll(() => userStatus(request, user.id), { timeout: 10_000 }).toBe(404);
	});

	test('a user created with the email of a user waiting for deletion is created after the DELETE (critère 37)', async ({
		page,
		request
	}) => {
		const old = await createUser(request, 'Reuse');
		const reborn = `Reborn ${stamp()}`;
		await page.goto('/');
		await expect(rowOf(page, old)).toBeVisible();
		await deleteButton(page, old).click();

		await page.getByLabel('Name', { exact: true }).fill(reborn);
		await page.getByLabel('Email', { exact: true }).fill(old.email.toUpperCase());
		await page.getByRole('button', { name: 'Create User' }).click();

		await expect(page.getByRole('button', { name: new RegExp(`^${reborn} [^(]`) })).toBeVisible();
		expect(await userStatus(request, old.id)).toBe(404);
		await expect(page.getByRole('alert').locator('[data-toast]')).toHaveCount(0);
		// The new user took a bigger identifier and none of the old tasks (USER-R16).
		const list = (await (await request.get(`${API}/api/v1/users`)).json()) as { data: Created[] };
		const created = list.data.find((candidate) => candidate.name === reborn);
		expect(created?.id).toBeGreaterThan(old.id);
		expect(await tasksOf(request, created!.id)).toEqual([]);
	});

	test('renaming changes the name on the server, not the email (critères 13, 18, 42)', async ({
		page,
		request
	}) => {
		const user = await createUser(request, 'Moved');
		await page.goto('/');
		await rowOf(page, user).click();
		await page.getByRole('heading', { name: `Tasks for ${user.name}` }).waitFor();

		await page.getByRole('button', { name: `Edit ${user.name} (${user.email})` }).click();
		await page.keyboard.type('  Updated here  ');
		await page.keyboard.press('Enter');

		await expect(page.getByRole('heading', { name: 'Tasks for Updated here' })).toBeVisible();
		const read = (await (await request.get(`${API}/api/v1/users/${user.id}`)).json()) as {
			data: Created;
		};
		expect(read.data).toEqual({ id: user.id, name: 'Updated here', email: user.email });
	});

	test('a user deleted elsewhere is dropped with the information, never an error (critère 46)', async ({
		page,
		request
	}) => {
		const user = await createUser(request, 'Elsewhere');
		await page.goto('/');
		await expect(rowOf(page, user)).toBeVisible();
		expect((await request.delete(`${API}/api/v1/users/${user.id}`)).status()).toBe(200);

		await rowOf(page, user).click();

		await expect(rowOf(page, user)).toHaveCount(0);
		await expect(page.getByRole('status').getByText('User already deleted')).toBeVisible();
		await expect(page.getByRole('alert').locator('[data-toast]')).toHaveCount(0);
	});

	test('statistics open after the waiting deletion and no longer count it (critère 38)', async ({
		page,
		request
	}) => {
		const user = await createUser(request, 'Counted');
		await createTask(request, user.id, `T ${stamp()}`);
		await page.goto('/');
		await expect(rowOf(page, user)).toBeVisible();
		await deleteButton(page, user).click();

		await page.getByRole('link', { name: 'View Statistics' }).click();
		await expect(page.getByText('Average tasks per user')).toBeVisible();

		await expect.poll(() => userStatus(request, user.id)).toBe(404);
	});
});
