import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Needs a real backend: the point is that the client rules and the server rules coincide.

const API = process.env.PUBLIC_API_URL || 'http://localhost:8080';
const EMOJI = '\u{1F600}';

interface UserRecord {
	id: number;
	name: string;
	email: string;
}
interface TaskRecord {
	id: number;
	title: string;
	description: string;
}

const codePoints = (value: string) => [...value].length;
const uniqueSuffix = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// 254 characters, the longest address of the contract: 64 + '@' + a 189-character domain.
function email254(suffix: string): string {
	const local = `l${suffix}`.padEnd(64, 'a');
	const domain = [`${'b'.repeat(63)}`, `${'c'.repeat(63)}`, 'd'.repeat(57), 'com'].join('.');
	return `${local}@${domain}`;
}

async function users(request: APIRequestContext): Promise<UserRecord[]> {
	const response = await request.get(`${API}/api/v1/users`);
	return ((await response.json()) as { data: UserRecord[] }).data;
}

async function tasksOf(request: APIRequestContext, userId: number): Promise<TaskRecord[]> {
	const response = await request.get(`${API}/api/v1/users/${userId}/tasks`);
	return ((await response.json()) as { data: TaskRecord[] }).data;
}

async function openHome(page: Page) {
	const loaded = page.waitForResponse(
		(response) => response.url().endsWith('/api/v1/users') && response.request().method() === 'GET'
	);
	await page.goto('/');
	await loaded;
	await expect(page.getByRole('button', { name: 'Create User' })).toBeEnabled();
}

async function submitUser(page: Page, name: string, email: string) {
	await page.getByLabel('Name').fill(name);
	await page.getByLabel('Email').fill(email);
	await page.getByRole('button', { name: 'Create User' }).click();
}

test.describe('Length limits, client and server together', () => {
	test('sends trimmed values that the server stores as they are (happy path)', async ({
		page,
		request
	}) => {
		// GIVEN: A form value framed by spaces.
		const suffix = uniqueSuffix();
		await openHome(page);

		// WHEN: The user is created.
		const sent = page.waitForRequest(
			(outgoing) => outgoing.url().endsWith('/api/v1/users') && outgoing.method() === 'POST'
		);
		await submitUser(page, `  Trim ${suffix}  `, `  Trim-${suffix}@Example.com  `);

		// THEN: The form sends the trimmed values (the server would trim them anyway, so the
		// request is what proves the client does it); the case of the address is the server's job.
		expect((await sent).postDataJSON()).toEqual({
			name: `Trim ${suffix}`,
			email: `Trim-${suffix}@Example.com`
		});

		// AND: The server holds the trimmed name and the normalized address.
		await expect(page.getByText(`trim-${suffix}@example.com`)).toBeVisible();
		const stored = (await users(request)).find(
			(user) => user.email === `trim-${suffix}@example.com`
		);
		expect(stored?.name).toBe(`Trim ${suffix}`);
	});

	test('accepts the exact limits, emoji included (boundary)', async ({ page, request }) => {
		// GIVEN: A name of 100 code points ending with an emoji, an email of 254 characters.
		const suffix = uniqueSuffix();
		const prefix = `Max${suffix}`;
		const name = prefix + 'n'.repeat(99 - prefix.length) + EMOJI;
		const email = email254(suffix);
		expect(codePoints(name)).toBe(100);
		expect(email.length).toBe(254);
		await openHome(page);

		// WHEN: The user is created.
		await submitUser(page, name, email);

		// THEN: The server accepted both and stores them unchanged.
		await expect(page.getByRole('button', { name: new RegExp(prefix) })).toBeVisible();
		const stored = (await users(request)).find((user) => user.email === email);
		expect(stored?.name).toBe(name);

		// WHEN: A task with a 200-point title and a 2000-point description is added.
		await page.getByRole('button', { name: new RegExp(prefix) }).click();
		const title = 'T'.repeat(199) + EMOJI;
		const description = 'd'.repeat(1999) + EMOJI;
		await page.getByLabel('Task Title').fill(title);
		await page.getByLabel('Description').fill(description);
		await page.getByRole('button', { name: 'Add Task' }).click();

		// THEN: The server stored both, unchanged.
		await expect(page.getByRole('heading', { name: /Tasks \(1\)/ })).toBeVisible();
		const [task] = await tasksOf(request, stored!.id);
		expect([task?.title, task?.description]).toEqual([title, description]);
	});

	test('refuses one character more in the form, as the server does (sad path)', async ({
		page,
		request
	}) => {
		// GIVEN: A name of 101 code points.
		const suffix = uniqueSuffix();
		const tooLongName = 'n'.repeat(100) + EMOJI;
		const posts: string[] = [];
		page.on('request', (sent) => {
			if (sent.method() === 'POST') posts.push(sent.url());
		});
		await openHome(page);

		// WHEN: The form is submitted.
		await submitUser(page, tooLongName, `long-${suffix}@example.com`);

		// THEN: The message is shown and nothing is sent.
		await expect(page.getByText('Name must be at most 100 characters')).toBeVisible();
		expect(posts).toEqual([]);

		// AND: The server refuses the same value.
		const response = await request.post(`${API}/api/v1/users`, {
			data: { name: tooLongName, email: `long-${suffix}@example.com` }
		});
		expect(response.status()).toBe(400);
		expect(((await response.json()) as { error_code: string }).error_code).toBe(
			'VALIDATION_FAILED'
		);
	});

	test('refuses a well-formed email of 255 characters, as the server does (sad path)', async ({
		page,
		request
	}) => {
		// GIVEN: A well-formed address one character over the limit. (A value without "@" never
		// reaches the schema: the browser blocks it on the email field first.)
		const tooLong = `a${email254(uniqueSuffix())}`;
		expect(tooLong.length).toBe(255);
		await openHome(page);

		// WHEN: The form is submitted.
		await submitUser(page, 'Ada', tooLong);

		// THEN: Only the length message shows.
		await expect(page.getByText('Email must be at most 254 characters')).toBeVisible();
		await expect(page.getByText('Invalid email address')).toHaveCount(0);

		// AND: The server refuses it too.
		const response = await request.post(`${API}/api/v1/users`, {
			data: { name: 'Ada', email: tooLong }
		});
		expect(response.status()).toBe(400);
		expect(((await response.json()) as { error_code: string }).error_code).toBe(
			'VALIDATION_FAILED'
		);
	});

	test('the server refuses task titles and descriptions over the limits (sad path)', async ({
		request
	}) => {
		// GIVEN: A user.
		const suffix = uniqueSuffix();
		const created = await request.post(`${API}/api/v1/users`, {
			data: { name: 'Owner', email: `owner-${suffix}@example.com` }
		});
		const userId = ((await created.json()) as { data: UserRecord }).data.id;

		// WHEN / THEN: A title of 201 or a description of 2001 code points is refused.
		for (const data of [
			{ user_id: userId, title: 'T'.repeat(201) },
			{ user_id: userId, title: 'ok', description: 'd'.repeat(2000) + EMOJI },
			{ user_id: userId, title: '   ' }
		]) {
			const response = await request.post(`${API}/api/v1/tasks`, { data });
			expect(response.status()).toBe(400);
			expect(((await response.json()) as { error_code: string }).error_code).toBe(
				'VALIDATION_FAILED'
			);
		}
	});

	test('the server refuses unknown properties and null (contract)', async ({ request }) => {
		// GIVEN / WHEN / THEN: Both are INVALID_BODY, which the interface never sends.
		const unknown = await request.post(`${API}/api/v1/users`, {
			data: { name: 'Ada', email: `unknown-${uniqueSuffix()}@example.com`, role: 'admin' }
		});
		expect(unknown.status()).toBe(400);
		expect(((await unknown.json()) as { error_code: string }).error_code).toBe('INVALID_BODY');

		const created = await request.post(`${API}/api/v1/users`, {
			data: { name: 'Nul', email: `nul-${uniqueSuffix()}@example.com` }
		});
		const userId = ((await created.json()) as { data: UserRecord }).data.id;
		const task = await request.post(`${API}/api/v1/tasks`, {
			data: { user_id: userId, title: 'Task' }
		});
		const taskId = ((await task.json()) as { data: TaskRecord }).data.id;
		const nulled = await request.put(`${API}/api/v1/tasks/${taskId}`, {
			data: { description: null }
		});
		expect(nulled.status()).toBe(400);
		expect(((await nulled.json()) as { error_code: string }).error_code).toBe('INVALID_BODY');
	});
});
