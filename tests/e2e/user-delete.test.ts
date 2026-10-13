import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './support/axe';
import { ada, adaTasks, grace, mockApi, openHomeWithUser } from './support/mock-api';

// Deleting a user is undoable for 6 s: the row leaves at once, the DELETE waits, and a hidden page
// holds the wait instead of sending (USER-R19 to USER-R21). The API is mocked; the rules of the
// state are tested by user-delete.test.ts and page-lifecycle.test.ts. Kept here: the real timer,
// the real focus, the real requests, and the page being hidden and left (the wiring of
// +layout.svelte, which no unit test mounts).

const userDeletes = (calls: string[]) => calls.filter((call) => call === 'DELETE /users/{id}');
const taskDeletes = (calls: string[]) => calls.filter((call) => call === 'DELETE /tasks/{id}');
const undoButton = (page: Page) => page.getByRole('status').getByRole('button', { name: 'Undo' });
const deleteAda = (page: Page) =>
	page.getByRole('button', { name: 'Delete Ada Lovelace (ada@example.com)' });

// What a browser does with a page: it is hidden (another tab), shown again, or really left.
const setVisibility = (page: Page, state: 'hidden' | 'visible') =>
	page.evaluate((next) => {
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => next });
		document.dispatchEvent(new Event('visibilitychange'));
	}, state);
const leavePage = async (page: Page) => {
	await setVisibility(page, 'hidden');
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
};

test.describe('Undoable user deletion (mocked API)', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('a deletion made with the keyboard leaves the list, offers Undo with the focus on it, and Undo brings the row back unselected without any request (critères 19, 20, 24)', async ({
		page
	}) => {
		// GIVEN: A selected user with tasks, and a clock that the test moves.
		await page.clock.install();
		const api = await mockApi(page, { users: [ada, grace], tasks: adaTasks });
		await openHomeWithUser(page);

		// WHEN: Delete is pressed with the keyboard.
		await deleteAda(page).focus();
		await page.keyboard.press('Enter');

		// THEN: The row is out, the count is lower, the panel invites to select, the toast names the
		// user, Undo has the focus, and nothing was sent.
		await expect(page.getByRole('button', { name: /^Ada Lovelace [^(]/ })).toHaveCount(0);
		await expect(page.getByRole('heading', { name: 'Users (1)' })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Select a user to manage tasks' })
		).toBeVisible();
		await expect(
			page.getByRole('status').getByText('User and their tasks deleted: Ada Lovelace')
		).toBeVisible();
		await expect(undoButton(page)).toBeFocused();
		expect(userDeletes(api.calls)).toHaveLength(0);
		await expectNoAxeViolations(page);

		// WHEN: Undo is pressed with Enter, then much time passes and the page is left.
		await undoButton(page).press('Enter');
		await page.clock.runFor(60_000);
		await leavePage(page);

		// THEN: The row is back in place, unselected, with the focus on its selection button, and no
		// DELETE ever left.
		const row = page.getByRole('button', { name: /^Ada Lovelace [^(]/ });
		await expect(row).toBeFocused();
		// The ring is shown: Undo was pressed with the keyboard, so the restored row shows it too.
		expect(await row.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
		await expect(row).toHaveAttribute('aria-pressed', 'false');
		await expect(page.locator('li').first()).toContainText('Ada Lovelace');
		expect(userDeletes(api.calls)).toHaveLength(0);
		expect(taskDeletes(api.calls)).toHaveLength(0);
	});

	test('the DELETE leaves once when the 6 s are over, and the user stays out of the server data (critères 30, 33)', async ({
		page
	}) => {
		// GIVEN: A user with tasks.
		await page.clock.install();
		const api = await mockApi(page, { users: [ada, grace], tasks: adaTasks });
		await page.goto('/');
		await expect(deleteAda(page)).toBeVisible();

		// WHEN: Ada is deleted; neither the pointer nor the focus stays on the toast; time runs out.
		await deleteAda(page).click();
		await page.mouse.move(0, 0);
		await page.evaluate(() => (document.activeElement as HTMLElement).blur());
		await page.clock.runFor(6100);

		// THEN: One DELETE was sent, the server lost the user and their tasks, the toast is gone.
		await expect.poll(() => userDeletes(api.calls).length).toBe(1);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
		expect(api.users.map((user) => user.id)).toEqual([2]);
		expect(api.tasks).toEqual([]);
		await page.clock.runFor(60_000);
		expect(userDeletes(api.calls)).toHaveLength(1);
	});

	test('the DELETE leaves at once, once, when the toast is closed (critère 33)', async ({
		page
	}) => {
		await page.clock.install();
		const api = await mockApi(page, { users: [ada, grace] });
		await page.goto('/');

		await deleteAda(page).click();
		await page.getByRole('button', { name: 'Dismiss notification' }).click();

		await expect.poll(() => userDeletes(api.calls).length).toBe(1);
		await page.clock.runFor(60_000);
		expect(userDeletes(api.calls)).toHaveLength(1);
	});

	test('a hidden page sends nothing for a user and holds the window, but sends a task at once (critère 31, mutant D4)', async ({
		page
	}) => {
		// GIVEN: A task deletion and, 2 s later, a user deletion (the task of another user, so it
		// does not follow Ada).
		await page.clock.install({ time: 0 });
		await page.clock.pauseAt(1000);
		const api = await mockApi(page, { users: [ada, grace], tasks: [...adaTasks] });
		await openHomeWithUser(page);
		await page.getByRole('button', { name: 'Delete Review 2', exact: true }).click();
		await page.getByRole('button', { name: /^Grace Hopper [^(]/ }).waitFor();
		await page.mouse.move(0, 0);
		await page.evaluate(() => (document.activeElement as HTMLElement).blur());
		await page.getByRole('button', { name: 'Delete Grace Hopper (grace@example.com)' }).click();
		await page.mouse.move(0, 0);
		await page.evaluate(() => (document.activeElement as HTMLElement).blur());
		await page.clock.runFor(2000);

		// WHEN: The tab is hidden for 60 s.
		await setVisibility(page, 'hidden');
		await page.clock.runFor(60_000);

		// THEN: The task deletion left at hiding, the user one did not, and its toast still offers Undo.
		await expect.poll(() => taskDeletes(api.calls).length).toBe(1);
		expect(userDeletes(api.calls)).toHaveLength(0);
		await expect(
			page.getByRole('status').getByText('User and their tasks deleted: Grace Hopper')
		).toBeVisible();
		await expect(undoButton(page)).toBeVisible();

		// WHEN: The tab comes back; 3.9 s later, then 0.2 s more.
		await setVisibility(page, 'visible');
		await page.clock.runFor(3900);
		expect(userDeletes(api.calls)).toHaveLength(0);
		await page.clock.runFor(200);

		// THEN: The window ended with the 4 s it had left, and the request left once.
		await expect.poll(() => userDeletes(api.calls).length).toBe(1);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
	});

	test('leaving the page sends a waiting user and a waiting task once each (critère 36)', async ({
		page
	}) => {
		// GIVEN: A task of Ada's neighbour and a user deletion waiting, and a clock only the test moves.
		await page.clock.install({ time: 0 });
		await page.clock.pauseAt(1000);
		const api = await mockApi(page, {
			users: [ada, grace],
			tasks: [{ id: 30, title: 'Grace task', description: '', user_id: 2, completed: false }]
		});
		await page.goto('/');
		await page.getByRole('button', { name: /^Grace Hopper [^(]/ }).click();
		await page.getByRole('button', { name: 'Delete Grace task', exact: true }).click();
		await deleteAda(page).click();

		// WHEN: The page is hidden and then unloaded.
		await leavePage(page);

		// THEN: Both left, once, and no toast waits any more.
		await expect.poll(() => userDeletes(api.calls).length).toBe(1);
		await expect.poll(() => taskDeletes(api.calls).length).toBe(1);
		await page.clock.runFor(60_000);
		expect(userDeletes(api.calls)).toHaveLength(1);
		expect(taskDeletes(api.calls)).toHaveLength(1);
		await expect(page.locator('[data-toast]')).toHaveCount(0);
	});

	test('a refused deletion puts the user back with the same words whatever the refusal (critères 34, 35)', async ({
		page
	}) => {
		// GIVEN: A server that does not know the route (a backend not up to date).
		await page.clock.install();
		const api = await mockApi(page, { users: [ada, grace] });
		api.failNext('DELETE /users/{id}', { status: 404, error: 'No route', code: 'ROUTE_NOT_FOUND' });
		await page.goto('/');

		// WHEN: Ada is deleted and the window ends.
		await deleteAda(page).click();
		await page.mouse.move(0, 0);
		await page.evaluate(() => (document.activeElement as HTMLElement).blur());
		await page.clock.runFor(6100);

		// THEN: Ada is back in the list, the error says what is true, and the ROUTE_NOT_FOUND text of the
		// common mechanism does not.
		await expect(page.getByRole('button', { name: /^Ada Lovelace [^(]/ })).toBeVisible();
		await expect(page.getByRole('alert').getByText("We couldn't delete the user.")).toBeVisible();
		await expect(page.getByText('Resource not found')).toHaveCount(0);

		// WHEN: Grace was already deleted elsewhere (USER_NOT_FOUND) and is deleted here.
		api.users = api.users.filter((user) => user.id !== 2);
		await page.getByRole('button', { name: 'Delete Grace Hopper (grace@example.com)' }).click();
		await page.mouse.move(0, 0);
		await page.evaluate(() => (document.activeElement as HTMLElement).blur());
		await page.clock.runFor(6100);

		// THEN: Grace stays out and no new error appears (the first one has expired by now).
		await expect.poll(() => userDeletes(api.calls).length).toBe(2);
		await expect(page.getByRole('button', { name: /^Grace Hopper [^(]/ })).toHaveCount(0);
		await expect(page.getByRole('alert').locator('[data-toast]')).toHaveCount(0);
	});

	test('two quick clicks at one point delete only the first user (critère 41)', async ({
		page
	}) => {
		// GIVEN: Two adjacent users; the clock is frozen, so 500 ms never pass.
		await page.clock.install({ time: 0 });
		await page.clock.pauseAt(1000);
		await mockApi(page, { users: [ada, grace] });
		await page.goto('/');
		const box = (await deleteAda(page).boundingBox())!;

		// WHEN: The same point is clicked twice, quickly.
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

		// THEN: The neighbour moved under the pointer and was not deleted; one notification only.
		await expect(page.getByRole('button', { name: /^Grace Hopper [^(]/ })).toBeVisible();
		await expect(page.locator('[data-toast]')).toHaveCount(1);
	});

	test('a user created with the email of a user waiting for deletion goes after the DELETE (critère 37)', async ({
		page
	}) => {
		// GIVEN: Ada waiting for her deletion.
		await page.clock.install({ time: 0 });
		await page.clock.pauseAt(1000);
		const api = await mockApi(page, { users: [ada, grace] });
		await page.goto('/');
		await deleteAda(page).click();

		// WHEN: A user is created with her email, in capitals.
		await page.getByLabel('Name', { exact: true }).fill('Ada Again');
		await page.getByLabel('Email', { exact: true }).fill('ADA@example.com');
		await page.getByRole('button', { name: 'Create User' }).click();

		// THEN: The DELETE went first and the POST after; both succeeded.
		await expect(page.getByRole('button', { name: /^Ada Again [^(]/ })).toBeVisible();
		const order = api.calls.filter(
			(call) => call === 'DELETE /users/{id}' || call === 'POST /users'
		);
		expect(order).toEqual(['DELETE /users/{id}', 'POST /users']);
	});

	test('opening the statistics sends the waiting deletions first and counts without them (critère 38)', async ({
		page
	}) => {
		// GIVEN: A user deletion waiting (the clock runs: the page waits for the service first).
		await page.clock.install();
		const api = await mockApi(page, { users: [ada, grace], tasks: adaTasks });
		await page.goto('/');
		await deleteAda(page).click();

		// WHEN: The statistics page is opened from the application.
		await page.getByRole('link', { name: 'View Statistics' }).click();

		// THEN: The DELETE left once before the read, and the figures do not count Ada or her tasks.
		await expect(page.getByText('Average tasks per user')).toBeVisible();
		const calls = api.calls.filter((call) => call.includes('/users/{id}') || call === 'GET /stats');
		expect(calls.at(-1)).toBe('GET /stats');
		expect(userDeletes(calls)).toHaveLength(1);
		await expect(page.locator('[data-stat-value]').first()).toHaveText('1');
	});
});

test.describe('Undoable user deletion on a touch screen (mocked API)', () => {
	test.use({ hasTouch: true });

	test('a tap on Delete puts the focus on Undo, and the window does not run out while it stays there (critère 25)', async ({
		page
	}) => {
		await page.clock.install();
		const api = await mockApi(page, { users: [ada, grace] });
		await page.goto('/');

		await deleteAda(page).tap();
		await expect(undoButton(page)).toBeFocused();
		await page.clock.runFor(60_000);

		await expect(undoButton(page)).toBeVisible();
		expect(userDeletes(api.calls)).toHaveLength(0);
	});
});
