import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectAnnounced, expectSilent } from './support/announcement';
import { ada, mockApi, openHomeWithUser, type MockTask } from './support/mock-api';

// What only a browser sees of the task filter: the choice kept across a real reload, the real
// focus after a task leaves the filter, and the narrowest screen. The API is mocked.
const task = (id: number, title: string, completed = false): MockTask => ({
	id,
	title,
	description: `About ${title}`,
	user_id: 1,
	completed
});
// To do: Banana and Cherry. Done: apple.
const MIXED = [task(1, 'Banana'), task(2, 'apple', true), task(3, 'Cherry')];

const titles = (page: Page) => page.locator('li label').allTextContents();
const filterSelect = (page: Page) => page.getByLabel('Show', { exact: true });

test.describe('Task filter (mocked API)', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('keeps the choice after a reload, without announcing it (happy path)', async ({ page }) => {
		// GIVEN: The done tasks chosen.
		await mockApi(page, { users: [ada], tasks: MIXED });
		await openHomeWithUser(page);
		await filterSelect(page).selectOption('done');
		await expect.poll(() => titles(page)).toEqual(['apple']);

		// WHEN: The page is reloaded and the user selected again.
		await page.reload();
		await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();

		// THEN: The choice and its list are back, and nothing is announced.
		await expect(filterSelect(page)).toHaveValue('done');
		await expect.poll(() => titles(page)).toEqual(['apple']);
		await expectSilent(page);
	});

	test('moves the focus to the next task when a tick takes one out of the list (happy path)', async ({
		page
	}) => {
		// GIVEN: The tasks to do, with the focus on the first checkbox.
		await mockApi(page, { users: [ada], tasks: MIXED });
		await openHomeWithUser(page);
		await filterSelect(page).selectOption('todo');
		const banana = page.getByRole('checkbox', { name: 'Banana' });
		await banana.focus();

		// WHEN: It is ticked from the keyboard.
		await page.keyboard.press('Space');

		// THEN: It leaves the list, the focus is on the next task, and the move is announced.
		await expect.poll(() => titles(page)).toEqual(['Cherry']);
		await expect(page.getByRole('checkbox', { name: 'Cherry' })).toBeFocused();
		await expectAnnounced(page, 'Banana: moved to Done');
	});

	test('fits on a 320 px screen with its sort neighbour, with no axe violation (limit)', async ({
		page
	}) => {
		// GIVEN: The narrowest screen, a long title, and an empty filter shown.
		await page.setViewportSize({ width: 320, height: 700 });
		await mockApi(page, {
			users: [ada],
			tasks: [task(1, 'x'.repeat(200)), task(2, 'b'), task(3, 'a')]
		});
		await openHomeWithUser(page);

		// WHEN: Done is chosen, which leaves nothing to show.
		await filterSelect(page).selectOption('done');

		// THEN: Both selectors and the empty message fit, and axe finds nothing.
		await expect(page.getByText('No completed tasks')).toBeVisible();
		await expect(page.getByLabel('Sort by', { exact: true })).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
		const { violations } = await new AxeBuilder({ page }).analyze();
		expect(violations.map((violation) => violation.id)).toEqual([]);
	});
});
