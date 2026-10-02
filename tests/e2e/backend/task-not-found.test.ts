import { expect, test, type APIRequestContext } from '@playwright/test';

// The backend the browser talks to (PUBLIC_API_URL baked into the build under test).
const API = process.env.PUBLIC_API_URL ?? 'http://localhost:8080';

async function createUserWithTask(request: APIRequestContext, title: string) {
	const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const user = await request.post(`${API}/api/v1/users`, {
		data: { name: `Gone ${stamp}`, email: `gone-${stamp}@example.com` }
	});
	expect(user.status()).toBe(201);
	const userBody = (await user.json()) as { data: { id: number; name: string } };
	const task = await request.post(`${API}/api/v1/tasks`, {
		data: { user_id: userBody.data.id, title, completed: false }
	});
	expect(task.status()).toBe(201);
	const taskBody = (await task.json()) as { data: { id: number } };
	return { userName: userBody.data.name, taskId: taskBody.data.id };
}

test.describe('Task already deleted elsewhere', () => {
	test('deleting it again removes the line and shows an information (limit)', async ({
		page,
		request
	}) => {
		// GIVEN: A user with a task, displayed in the interface.
		const title = `Gone task ${Date.now()}`;
		const { userName, taskId } = await createUserWithTask(request, title);
		await page.goto('/');
		await page.getByRole('button', { name: new RegExp(userName) }).click();
		await expect(page.getByText(title)).toBeVisible();

		// WHEN: The task is deleted through the API, then deleted again from the interface.
		const deleted = await request.delete(`${API}/api/v1/tasks/${taskId}`);
		expect(deleted.status()).toBe(200);
		await page.getByRole('button', { name: `Delete ${title}` }).click();

		// THEN: The line disappears, the fixed information is shown, and no error.
		await expect(page.getByText(title)).not.toBeVisible();
		await expect(
			page.getByRole('status').filter({ hasText: 'Task already deleted' })
		).toBeVisible();
		await expect(page.getByRole('alert')).toBeEmpty();
	});

	test('checking it removes the line instead of showing an error (limit)', async ({
		page,
		request
	}) => {
		// GIVEN: A user with a task, displayed in the interface.
		const title = `Gone toggle ${Date.now()}`;
		const { userName, taskId } = await createUserWithTask(request, title);
		await page.goto('/');
		await page.getByRole('button', { name: new RegExp(userName) }).click();
		await expect(page.getByText(title)).toBeVisible();

		// WHEN: The task is deleted through the API, then checked in the interface.
		expect((await request.delete(`${API}/api/v1/tasks/${taskId}`)).status()).toBe(200);
		await page.getByRole('checkbox', { name: title, exact: true }).click();

		// THEN: The line disappears with the information, and no error is shown.
		await expect(page.getByText(title)).not.toBeVisible();
		await expect(
			page.getByRole('status').filter({ hasText: 'Task already deleted' })
		).toBeVisible();
		await expect(page.getByRole('alert')).toBeEmpty();
	});
});
