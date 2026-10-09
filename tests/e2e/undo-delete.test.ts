import { expect, test, type Page } from '@playwright/test';
import { nextFocusKey } from './support/keyboard';
import { ada, adaTasks, grace, mockApi, openHomeWithUser } from './support/mock-api';

// Deleting a task is undoable for 6 s: the row leaves at once, the DELETE waits. The API is mocked.

const deletes = (calls: string[]) => calls.filter((call) => call === 'DELETE /tasks/{id}');
const undoButton = (page: Page) => page.getByRole('status').getByRole('button', { name: 'Undo' });

// What a browser does as a page is left: it becomes hidden, then it is unloaded.
async function leavePage(page: Page) {
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
		document.dispatchEvent(new Event('visibilitychange'));
		window.dispatchEvent(new Event('pagehide'));
	});
}

test.describe('Undoable task deletion (mocked API)', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('Delete hides the row and offers Undo, without any request yet (happy path)', async ({
		page
	}) => {
		// GIVEN: A user with two tasks and a frozen clock.
		await page.clock.install();
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);

		// WHEN: The first task is deleted.
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();

		// THEN: It is out of the list, the toast names it, nothing was sent, and 5 s later still nothing.
		await expect(page.getByRole('checkbox', { name: 'Review', exact: true })).toHaveCount(0);
		await expect(page.getByRole('status').getByText('Task deleted: Review')).toBeVisible();
		await expect(undoButton(page)).toBeVisible();
		await page.clock.runFor(5000);
		expect(deletes(api.calls)).toHaveLength(0);
	});

	test('Undo puts the row back where it was, with the focus on its checkbox, and sends nothing (happy path)', async ({
		page
	}) => {
		// GIVEN: A task deleted with the keyboard-reachable Undo button focused.
		await page.clock.install();
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();
		await undoButton(page).focus();

		// WHEN: Undo is pressed with Enter, then the time would have run out.
		await undoButton(page).press('Enter');

		// THEN: The row is first again, focused (the toast did not take the focus elsewhere), the
		// toast is gone, and no DELETE ever leaves.
		const checkbox = page.getByRole('checkbox', { name: 'Review', exact: true });
		await expect(checkbox).toBeFocused();
		await expect(page.locator('[data-toast]')).toHaveCount(0);
		await expect(page.locator('li label').first()).toHaveText('Review');
		await page.clock.runFor(10_000);
		expect(deletes(api.calls)).toHaveLength(0);
	});

	test('Undo with the mouse restores the row and keeps it after the delay (happy path)', async ({
		page
	}) => {
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Delete Review 2' }).click();

		await undoButton(page).click();

		await expect(page.getByRole('checkbox', { name: 'Review 2', exact: true })).toBeVisible();
		await page.waitForTimeout(300);
		expect(deletes(api.calls)).toHaveLength(0);
	});

	test('the DELETE leaves once the 6 s are over, and the row stays out (happy path)', async ({
		page
	}) => {
		// GIVEN: A deleted task.
		await page.clock.install();
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();

		// WHEN: The pointer is away from the toast (hovering it pauses the timer), and the time runs out.
		await page.mouse.move(0, 0);
		await page.clock.runFor(6100);

		// THEN: One DELETE was sent, the toast is gone and the task is gone on the server.
		await expect.poll(() => deletes(api.calls).length).toBe(1);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
		expect(api.tasks.map((task) => task.id)).toEqual([11]);
		await expect(page.getByRole('checkbox', { name: 'Review', exact: true })).toHaveCount(0);
	});

	test('closing the toast sends the DELETE at once (happy path)', async ({ page }) => {
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();

		await page.getByRole('button', { name: 'Dismiss notification' }).click();

		await expect.poll(() => deletes(api.calls).length).toBe(1);
	});

	test('a task the server no longer knows stays out, with no error nor notice (limit)', async ({
		page
	}) => {
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		api.failNext('DELETE /tasks/{id}', {
			status: 404,
			error: 'Task not found',
			code: 'TASK_NOT_FOUND'
		});
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();

		await page.getByRole('button', { name: 'Dismiss notification' }).click();

		await expect.poll(() => deletes(api.calls).length).toBe(1);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
		await expect(page.getByRole('checkbox', { name: 'Review', exact: true })).toHaveCount(0);
	});

	test('a refused deletion puts the row back and shows the error (sad path)', async ({ page }) => {
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		api.failNext('DELETE /tasks/{id}', { status: 500, error: 'Database unavailable' });
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();

		await page.getByRole('button', { name: 'Dismiss notification' }).click();

		await expect(page.getByRole('alert').getByText('Database unavailable')).toBeVisible();
		await expect(page.locator('li label').first()).toHaveText('Review');
	});

	test('a connection that fails puts the row back and shows the error (exception)', async ({
		page
	}) => {
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.route('**/api/v1/tasks/10', (route) => route.abort('connectionrefused'));
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();

		await page.getByRole('button', { name: 'Dismiss notification' }).click();

		await expect(page.getByRole('alert')).not.toBeEmpty();
		await expect(page.getByRole('checkbox', { name: 'Review', exact: true })).toBeVisible();
	});

	test('selecting another user sends the pending deletion at once (limit)', async ({ page }) => {
		const api = await mockApi(page, { users: [ada, grace], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();

		await page.getByRole('button', { name: /Grace Hopper/ }).click();

		await expect.poll(() => deletes(api.calls).length).toBe(1);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
		expect(api.tasks.map((task) => task.id)).toEqual([11]);
	});

	test('leaving the page sends the pending deletion once, for hidden and pagehide together (limit)', async ({
		page
	}) => {
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();
		await page.getByRole('button', { name: 'Delete Review 2' }).click();

		await leavePage(page);

		await expect.poll(() => deletes(api.calls).length).toBe(2);
		await page.waitForTimeout(300);
		expect(deletes(api.calls)).toHaveLength(2);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
	});

	test('leaving the page with nothing pending sends nothing (boundary)', async ({ page }) => {
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);

		await leavePage(page);
		await page.waitForTimeout(200);

		expect(deletes(api.calls)).toHaveLength(0);
	});

	test('Tab reaches Undo then Dismiss and Enter on Undo works from the keyboard path (happy path)', async ({
		page,
		browserName
	}) => {
		// GIVEN: A task deleted from its Delete button, the focus then on the list heading.
		await page.clock.install();
		await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Delete Review 2' }).focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('heading', { name: 'Tasks (1)' })).toBeFocused();
		const lastControl = page.getByRole('button', { name: 'Delete Review', exact: true });
		await lastControl.focus();

		// WHEN: Tab goes into the toast.
		await page.keyboard.press(nextFocusKey(browserName));

		// THEN: Undo has the focus, and the toast waits for the keyboard user.
		await expect(undoButton(page)).toBeFocused();
		await page.clock.runFor(20_000);
		await expect(undoButton(page)).toBeVisible();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('checkbox', { name: 'Review 2', exact: true })).toBeFocused();
	});
});
