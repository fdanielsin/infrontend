import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './support/axe';
import { nextFocusKey } from './support/keyboard';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// Deleting a task is undoable for 6 s: the row leaves at once, the DELETE waits. The API is mocked.
// The rules of the store (the row back in place, a task already gone, a refusal, a change of user)
// are tested by task-undo.test.ts and TaskDelete.focus.test.ts. Kept here: the keyboard path in a
// real browser, the real timer and request, and the page being left (the wiring in +layout.svelte,
// which no unit test mounts).

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

	test('a deletion made and undone with the keyboard puts the row back in place and sends nothing (happy path)', async ({
		page,
		browserName
	}) => {
		// GIVEN: A user with two tasks, and a clock that the test moves.
		await page.clock.install();
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);

		// WHEN: The first task is deleted with the keyboard.
		await page.getByRole('button', { name: 'Delete Review', exact: true }).focus();
		await page.keyboard.press('Enter');

		// THEN: The row is out of the list, the toast names it, Undo has the focus, nothing was sent.
		await expect(page.getByRole('checkbox', { name: 'Review', exact: true })).toHaveCount(0);
		await expect(page.getByRole('status').getByText('Task deleted: Review')).toBeVisible();
		await expect(undoButton(page)).toBeFocused();
		expect(deletes(api.calls)).toHaveLength(0);

		// WHEN: The focus is on the last control of the page, and Tab goes into the toast.
		await page.getByRole('button', { name: 'Delete Review 2', exact: true }).focus();
		await page.keyboard.press(nextFocusKey(browserName));

		// THEN: Undo has the focus, and the toast waits for the keyboard user (WCAG 2.2.1), with no violation.
		await expect(undoButton(page)).toBeFocused();
		await page.clock.runFor(60_000);
		await expect(undoButton(page)).toBeVisible();
		expect(deletes(api.calls)).toHaveLength(0);
		await expectNoAxeViolations(page);

		// WHEN: Undo is pressed with Enter.
		await undoButton(page).press('Enter');

		// THEN: The row is first again and has the focus, the toast is gone, no DELETE ever leaves.
		await expect(page.getByRole('checkbox', { name: 'Review', exact: true })).toBeFocused();
		await expect(page.locator('li label').first()).toHaveText('Review');
		await expect(page.locator('[data-toast]')).toHaveCount(0);
		await page.clock.runFor(10_000);
		expect(deletes(api.calls)).toHaveLength(0);
	});

	test('the DELETE leaves when the 6 s are over, and when the toast of another task is closed (happy path)', async ({
		page
	}) => {
		// GIVEN: A user with two tasks, and a clock that the test moves.
		await page.clock.install();
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);

		// WHEN: A task is deleted; neither the pointer nor the focus is on its toast (either pauses
		// its timer); the time runs out.
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();
		await page.mouse.move(0, 0);
		await page.evaluate(() => (document.activeElement as HTMLElement).blur());
		await page.clock.runFor(6100);

		// THEN: One DELETE was sent, the toast is gone, the task is gone on the server and in the list.
		await expect.poll(() => deletes(api.calls).length).toBe(1);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
		expect(api.tasks.map((task) => task.id)).toEqual([11]);
		await expect(page.getByRole('checkbox', { name: 'Review', exact: true })).toHaveCount(0);

		// WHEN: Another task is deleted and its toast is closed.
		await page.getByRole('button', { name: 'Delete Review 2' }).click();
		await page.getByRole('button', { name: 'Dismiss notification' }).click();

		// THEN: Its DELETE leaves at once.
		await expect.poll(() => deletes(api.calls).length).toBe(2);
		expect(api.tasks).toEqual([]);
	});

	test('leaving the page sends every deletion still waiting (limit)', async ({ page }) => {
		// GIVEN: Two deletions that can still be undone, and a clock that only the test moves, so that
		// no toast can expire and send its DELETE by itself.
		await page.clock.install({ time: 0 });
		await page.clock.pauseAt(1000);
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();
		await page.getByRole('button', { name: 'Delete Review 2' }).click();

		// WHEN: The page becomes hidden, then it is unloaded.
		await leavePage(page);

		// THEN: Both DELETE leave, and no toast waits any more.
		await expect.poll(() => deletes(api.calls).length).toBe(2);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
		expect(api.tasks).toEqual([]);
	});

	test('a refused deletion puts the row back with the same words whatever the refusal (limit)', async ({
		page
	}) => {
		// GIVEN: A server that does not know the route (a backend not up to date).
		await page.clock.install();
		const api = await mockApi(page, { users: [ada], tasks: adaTasks });
		api.failNext('DELETE /tasks/{id}', { status: 404, error: 'No route', code: 'ROUTE_NOT_FOUND' });
		await openHomeWithUser(page);

		// WHEN: The task is deleted and the window ends.
		await page.getByRole('button', { name: 'Delete Review', exact: true }).click();
		await page.mouse.move(0, 0);
		await page.evaluate(() => (document.activeElement as HTMLElement).blur());
		await page.clock.runFor(6100);

		// THEN: The row is back and the error is the fixed text, not the common one of the route.
		await expect(page.getByRole('checkbox', { name: 'Review', exact: true })).toBeVisible();
		await expect(page.getByRole('alert').getByText("We couldn't delete the task.")).toBeVisible();
		await expect(page.getByText('Resource not found')).toHaveCount(0);
	});
});
