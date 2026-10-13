import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './support/axe';
import { ada, grace, mockApi, openHomeWithUser } from './support/mock-api';

// Renaming a user in the list (USER-R22, USER-R23). The email is text, never a field, and only the
// name is sent (USER-R18). The API is mocked; the rules of the state are in user-delete.test.ts.

const editAda = (page: Page) =>
	page.getByRole('button', { name: 'Edit Ada Lovelace (ada@example.com)' });
const nameField = (page: Page) => page.locator('#user-name-1');

test.describe('Rename a user (mocked API)', () => {
	test('Edit opens the field with the text selected, Enter saves the name alone and the focus returns to Edit (critères 18, 42, 43)', async ({
		page
	}) => {
		// GIVEN: A selected user.
		const api = await mockApi(page, { users: [ada, grace] });
		await openHomeWithUser(page);

		// WHEN: Edit is activated with the keyboard.
		await editAda(page).focus();
		await page.keyboard.press('Enter');

		// THEN: The field has the focus with its text selected, the email is text, the actions around
		// are inactive, and there is no violation.
		await expect(nameField(page)).toBeFocused();
		expect(await nameField(page).evaluate((input: HTMLInputElement) => input.selectionEnd)).toBe(
			'Ada Lovelace'.length
		);
		await expect(
			page.locator('li', { has: nameField(page) }).getByText('ada@example.com')
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Delete Ada Lovelace (ada@example.com)' })
		).toBeDisabled();
		await expect(
			page.getByRole('button', { name: 'Edit Grace Hopper (grace@example.com)' })
		).toBeDisabled();
		await expectNoAxeViolations(page);

		// WHEN: The name is replaced and Enter pressed.
		await page.keyboard.type('Ada King');
		await page.keyboard.press('Enter');

		// THEN: The list and the task panel show the new name, nothing was announced as a toast, the
		// body sent was the name alone, and the focus is back on Edit.
		await expect(page.getByRole('button', { name: /^Ada King [^(]/ })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Tasks for Ada King' })).toBeVisible();
		await expect(page.locator('[data-toast]')).toHaveCount(0);
		expect(api.requests.find((request) => request.operation === 'PUT /users/{id}')?.body).toEqual({
			name: 'Ada King'
		});
		await expect(
			page.getByRole('button', { name: 'Edit Ada King (ada@example.com)' })
		).toBeFocused();
	});

	test('Escape closes without any request and keeps the name (critère 43)', async ({ page }) => {
		const api = await mockApi(page, { users: [ada, grace] });
		await page.goto('/');
		await editAda(page).click();

		await page.keyboard.type('Never saved');
		await page.keyboard.press('Escape');

		await expect(page.getByRole('button', { name: /^Ada Lovelace [^(]/ })).toBeVisible();
		await expect(editAda(page)).toBeFocused();
		expect(api.calls.filter((call) => call === 'PUT /users/{id}')).toHaveLength(0);
	});

	test('an empty name shows its message under the field, keeps the focus there and sends nothing (critère 45)', async ({
		page
	}) => {
		const api = await mockApi(page, { users: [ada, grace] });
		await page.goto('/');
		await editAda(page).click();

		await page.keyboard.press('Delete');
		await page.keyboard.press('Enter');

		await expect(page.getByText('Name is required').first()).toBeVisible();
		await expect(nameField(page)).toBeFocused();
		await expect(nameField(page)).toHaveAttribute('aria-invalid', 'true');
		expect(api.calls.filter((call) => call === 'PUT /users/{id}')).toHaveLength(0);
	});

	test('a server refusal keeps the form open with what was typed and shows an error (critère 45)', async ({
		page
	}) => {
		const api = await mockApi(page, { users: [ada, grace] });
		api.failNext('PUT /users/{id}', { status: 500, error: 'Boom', code: 'INTERNAL_ERROR' });
		await page.goto('/');
		await editAda(page).click();

		await page.keyboard.type('Ada King');
		await page.keyboard.press('Enter');

		await expect(page.getByRole('alert').locator('[data-toast]')).toHaveCount(1);
		await expect(nameField(page)).toHaveValue('Ada King');
		await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
	});

	test('a user deleted elsewhere leaves the list, the form closes and it is said once, without an error (critère 48)', async ({
		page
	}) => {
		const api = await mockApi(page, { users: [ada, grace] });
		await page.goto('/');
		await editAda(page).click();
		api.users = api.users.filter((user) => user.id !== 1);

		await page.keyboard.type('Ada King');
		await page.keyboard.press('Enter');

		await expect(page.getByRole('button', { name: /^Ada [^(]/ })).toHaveCount(0);
		await expect(nameField(page)).toHaveCount(0);
		await expect(page.getByRole('status').getByText('User already deleted')).toHaveCount(1);
		await expect(page.getByRole('alert').locator('[data-toast]')).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'Users (1)' })).toBeFocused();
		await expect(
			page.getByRole('button', { name: 'Edit Grace Hopper (grace@example.com)' })
		).toBeEnabled();
	});
});
