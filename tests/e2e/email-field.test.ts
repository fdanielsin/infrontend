import { expect, test } from '@playwright/test';
import { mockApi } from './support/mock-api';

// The browser rewrites the value of an <input type="email">: it strips the spaces around it and
// Chrome turns an international domain into punycode, in `.value` and so in the request. The form
// keeps a text field: the typed text stays as it is, the schema trims what is sent, and judges it
// with the rule of the server. The API is mocked.

test.describe('E-mail field (mocked API)', () => {
	test('keeps an international address as typed, sends it trimmed and lists it (happy path)', async ({
		page
	}) => {
		// GIVEN: The home page, with its users loaded.
		await mockApi(page);
		const usersLoaded = page.waitForResponse(
			(response) =>
				response.url().endsWith('/api/v1/users') && response.request().method() === 'GET'
		);
		await page.goto('/');
		await usersLoaded;

		// WHEN: An address with an international domain and spaces around it is typed.
		const email = page.getByLabel('Email', { exact: true });
		await page.getByLabel('Name', { exact: true }).fill('Ivan');
		await email.fill('  ivan@пример.рф  ');

		// THEN: The field still holds exactly what was typed.
		await expect(email).toHaveValue('  ivan@пример.рф  ');

		// WHEN: The form is submitted.
		const sent = page.waitForRequest(
			(request) => request.url().endsWith('/api/v1/users') && request.method() === 'POST'
		);
		await page.getByRole('button', { name: 'Create User' }).click();

		// THEN: The request carries the address trimmed, in Unicode, and the list shows it.
		expect((await sent).postDataJSON()).toEqual({ name: 'Ivan', email: 'ivan@пример.рф' });
		await expect(page.getByText('ivan@пример.рф')).toBeVisible();
	});

	test('refuses before sending what the server refuses, under the field and with the focus (sad path)', async ({
		page
	}) => {
		// GIVEN: The home page, a name, and a record of every request that creates something.
		await mockApi(page);
		const posts: string[] = [];
		page.on('request', (request) => {
			if (request.method() === 'POST') posts.push(request.url());
		});
		const usersLoaded = page.waitForResponse(
			(response) =>
				response.url().endsWith('/api/v1/users') && response.request().method() === 'GET'
		);
		await page.goto('/');
		await usersLoaded;
		const email = page.getByLabel('Email', { exact: true });
		await page.getByLabel('Name', { exact: true }).fill('Ada');

		// WHEN / THEN: Each of these addresses is refused by the server; the form refuses it first, with
		// its message under the field and the focus back on it.
		for (const address of [
			'a@b-.com',
			`${'a'.repeat(65)}@b.co`,
			`a@${'b'.repeat(64)}.co`,
			`a@b.${'c'.repeat(25)}`
		]) {
			await email.fill(address);
			await page.getByRole('button', { name: 'Create User' }).click();
			await expect(email).toBeFocused();
			await expect(email).toHaveAttribute('aria-invalid', 'true');
			await expect(page.locator('#email-error')).toHaveText('Invalid email address');
		}

		// AND: Nothing was sent.
		expect(posts).toEqual([]);
	});
});
