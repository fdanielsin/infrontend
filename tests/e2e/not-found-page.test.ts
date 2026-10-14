import { expect, test } from '@playwright/test';
import { nextFocusKey } from './support/keyboard';
import { mockApi } from './support/mock-api';

// A page that does not exist still has the landmark the skip link points at (#70). The API is mocked.

test('the skip link of the 404 page moves the focus to the main landmark (happy path)', async ({
	page,
	browserName
}) => {
	// GIVEN: An address that does not exist.
	await mockApi(page);
	const response = await page.goto('/does-not-exist');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');

	// WHEN: The skip link is reached by the keyboard and activated.
	await page.keyboard.press(nextFocusKey(browserName));
	const link = page.getByRole('link', { name: 'Skip to main content' });
	await expect(link).toBeFocused();
	await page.keyboard.press('Enter');

	// THEN: The landmark has the focus, and a way back to the home page is in it.
	await expect(page.locator('main#main-content')).toBeFocused();
	await expect(page.locator('main').getByRole('link', { name: 'Back to home' })).toHaveAttribute(
		'href',
		'/'
	);
});
