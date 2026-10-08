import { expect, test, type Locator, type Page } from '@playwright/test';
import { nextFocusKey } from './support/keyboard';
import { ada, adaTasks, mockApi, openHomeWithUser } from './support/mock-api';

// Keyboard and focus behavior in a real browser, with a mocked API. Actions use
// the keyboard (focus + Enter) so that every engine behaves like a keyboard user.

async function press(locator: Locator, key = 'Enter') {
	await locator.focus();
	await locator.press(key);
}

function editTitle(page: Page) {
	return page.getByLabel('Task Title').nth(1);
}

test.describe('Keyboard and focus (mocked API)', () => {
	test.describe('task list', () => {
		test.beforeEach(async ({ page }) => {
			await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
		});

		test('Edit focuses the title field, Escape closes and returns to Edit (happy path)', async ({
			page
		}) => {
			// GIVEN: The task list of the selected user.
			const edit = page.getByRole('button', { name: 'Edit Review', exact: true });

			// WHEN: Edit is activated from the keyboard.
			await press(edit);

			// THEN: The title field has the focus.
			await expect(editTitle(page)).toBeFocused();
			await expect(editTitle(page)).toHaveValue('Review');

			// WHEN: Escape is pressed.
			await editTitle(page).fill('Draft');
			await editTitle(page).press('Escape');

			// THEN: The edit is closed without saving and Edit has the focus back.
			await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
			await expect(page.getByRole('checkbox', { name: 'Review', exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Edit Review', exact: true })).toBeFocused();
		});

		test('Save returns the focus to the Edit button of the renamed task (happy path)', async ({
			page
		}) => {
			// GIVEN: An edit in progress.
			await press(page.getByRole('button', { name: 'Edit Review', exact: true }));
			await editTitle(page).fill('Reviewed');

			// WHEN: The edit is submitted with Enter.
			await editTitle(page).press('Enter');

			// THEN: The focus is on the Edit button of the task.
			await expect(page.getByRole('button', { name: 'Edit Reviewed', exact: true })).toBeFocused();
		});

		test('an invalid edit focuses its title field, described by the error (sad path)', async ({
			page
		}) => {
			// GIVEN: An edit whose title is emptied, the focus on Save.
			await press(page.getByRole('button', { name: 'Edit Review', exact: true }));
			await editTitle(page).fill('');

			// WHEN: Save is activated.
			await press(page.getByRole('button', { name: 'Save' }));

			// THEN: The title field is focused and described by the error.
			await expect(editTitle(page)).toBeFocused();
			await expect(editTitle(page)).toHaveAttribute('aria-invalid', 'true');
			await expect(editTitle(page)).toHaveAccessibleDescription('Title is required');
		});

		test('Escape in the add form leaves an edit open (sad path)', async ({ page }) => {
			// GIVEN: An edit in progress.
			await press(page.getByRole('button', { name: 'Edit Review', exact: true }));
			await editTitle(page).fill('Draft');

			// WHEN: Escape is pressed in the add form.
			await page.getByLabel('Task Title').first().press('Escape');

			// THEN: The draft is still being edited.
			await expect(editTitle(page)).toHaveValue('Draft');
		});

		test('switching from a lower to a higher edit keeps Escape and the invalid-field focus working (limit)', async ({
			page
		}) => {
			// GIVEN: The second task is edited, then the first one.
			await press(page.getByRole('button', { name: 'Edit Review 2', exact: true }));
			await press(page.getByRole('button', { name: 'Edit Review', exact: true }));
			await expect(editTitle(page)).toHaveValue('Review');

			// WHEN: The title is emptied and saved.
			await editTitle(page).fill('');
			await press(page.getByRole('button', { name: 'Save' }));

			// THEN: The invalid field has the focus.
			await expect(editTitle(page)).toBeFocused();

			// WHEN: Escape is pressed.
			await editTitle(page).press('Escape');

			// THEN: The edit closes and its Edit button has the focus.
			await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
			await expect(page.getByRole('button', { name: 'Edit Review', exact: true })).toBeFocused();
		});

		test('deleting a task moves the focus to the list heading (happy path)', async ({ page }) => {
			// WHEN: The first task is deleted from the keyboard.
			await press(page.getByRole('button', { name: 'Delete Review', exact: true }));

			// THEN: The heading with the new count has the focus.
			await expect(page.getByRole('heading', { name: 'Tasks (1)' })).toBeFocused();
		});

		test('checking a task already deleted on the server moves the focus to the list heading (limit)', async ({
			page
		}) => {
			// GIVEN: The first task is gone on the server.
			const checkbox = page.getByRole('checkbox', { name: 'Review', exact: true });
			await page.route('**/api/v1/tasks/10', (route) =>
				route.fulfill({
					status: 404,
					headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
					body: JSON.stringify({
						success: false,
						error: 'Task not found',
						error_code: 'TASK_NOT_FOUND'
					})
				})
			);

			// WHEN: It is checked with the Space key.
			await press(checkbox, 'Space');

			// THEN: The line is gone and the heading has the focus.
			await expect(checkbox).toHaveCount(0);
			await expect(page.getByRole('heading', { name: 'Tasks (1)' })).toBeFocused();
		});
	});

	test('an invalid user name moves the focus to the name field (sad path)', async ({ page }) => {
		// GIVEN: The home page.
		await mockApi(page);
		const usersLoaded = page.waitForResponse((response) =>
			response.url().endsWith('/api/v1/users')
		);
		await page.goto('/');
		await usersLoaded;
		await page.getByLabel('Name', { exact: true }).fill('   ');
		await page.getByLabel('Email', { exact: true }).fill('a@example.com');

		// WHEN: The form is submitted from its button.
		await press(page.getByRole('button', { name: 'Create User' }));

		// THEN: The name field is focused and described by its error.
		await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
		await expect(page.getByLabel('Name', { exact: true })).toHaveAccessibleDescription(
			'Name is required'
		);
	});

	test.describe('toasts', () => {
		async function twoErrorToasts(page: Page) {
			const api = await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			for (const title of ['Review', 'Review 2']) {
				api.failNext('PUT /tasks/{id}', { status: 500, error: `Cannot update ${title}` });
				await press(page.getByRole('checkbox', { name: title, exact: true }), 'Space');
				await expect(page.getByRole('alert').getByText(`Cannot update ${title}`)).toBeVisible();
			}
			return page.getByRole('alert').getByRole('button', { name: 'Dismiss notification' });
		}

		test('a hovered toast stays, then leaves after the time left (happy path)', async ({
			page
		}) => {
			// GIVEN: A fake clock and an error toast. A 400, not a 500: a server error stays until it
			// is closed (tests/e2e/persistent-errors.test.ts), and this test is about the time left.
			await page.clock.install();
			const api = await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			api.failNext('PUT /tasks/{id}', { status: 400, error: 'Database unavailable' });
			await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
			const toast = page.getByRole('alert').getByText('Database unavailable');
			await expect(toast).toBeVisible();

			// WHEN: It is hovered far longer than its 6 s.
			await toast.hover();
			await page.clock.runFor(20_000);

			// THEN: It is still shown.
			await expect(toast).toBeVisible();

			// WHEN: The pointer leaves.
			await page.mouse.move(0, 0);
			await page.clock.runFor(6_000);

			// THEN: It is gone.
			await expect(toast).toHaveCount(0);
		});

		test('a toast reached with Tab stays paused, and dismissing it returns the focus (happy path)', async ({
			page,
			browserName
		}) => {
			// GIVEN: A fake clock, an error toast, the focus on the last control of the page.
			await page.clock.install();
			const api = await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			api.failNext('PUT /tasks/{id}', { status: 500, error: 'Database unavailable' });
			await press(page.getByRole('checkbox', { name: 'Review', exact: true }), 'Space');
			await expect(page.getByRole('alert').getByText('Database unavailable')).toBeVisible();
			const lastControl = page.getByRole('button', { name: 'Delete Review 2' });
			await lastControl.focus();

			// WHEN: Tab moves the focus into the toast, and time passes.
			await page.keyboard.press(nextFocusKey(browserName));
			const dismiss = page.getByRole('alert').getByRole('button', { name: 'Dismiss notification' });
			await expect(dismiss).toBeFocused();
			await page.clock.runFor(20_000);

			// THEN: The toast is still there.
			await expect(page.getByRole('alert').getByText('Database unavailable')).toBeVisible();

			// WHEN: It is dismissed with Enter.
			await dismiss.press('Enter');

			// THEN: The toast is gone and the focus is back where the user came from.
			await expect(page.getByRole('alert').getByText('Database unavailable')).toHaveCount(0);
			await expect(lastControl).toBeFocused();
		});

		test('dismissing a toast moves the focus to the next one of the region (happy path)', async ({
			page
		}) => {
			// GIVEN: Two error toasts.
			const dismissButtons = await twoErrorToasts(page);
			const second = page.getByRole('alert').getByText('Cannot update Review 2');

			// WHEN: The first one is dismissed from the keyboard.
			await press(dismissButtons.first());

			// THEN: The dismiss button of the next one has the focus.
			await expect(dismissButtons).toHaveCount(1);
			await expect(second).toBeVisible();
			await expect(dismissButtons.first()).toBeFocused();
		});

		test('dismissing the last toast moves the focus to the previous one (boundary)', async ({
			page
		}) => {
			// GIVEN: Two error toasts.
			const dismissButtons = await twoErrorToasts(page);
			const first = page.getByRole('alert').getByText('Cannot update Review', { exact: true });

			// WHEN: The last one is dismissed from the keyboard.
			await press(dismissButtons.last());

			// THEN: The dismiss button of the previous one has the focus.
			await expect(dismissButtons).toHaveCount(1);
			await expect(first).toBeVisible();
			await expect(dismissButtons.first()).toBeFocused();
		});

		test('the entry animation is off with reduced motion (limit)', async ({ page }) => {
			// GIVEN: A toast shown with and without the reduced motion preference.
			const api = await mockApi(page, { users: [ada], tasks: adaTasks });
			await openHomeWithUser(page);
			api.failNext('PUT /tasks/{id}', { status: 500, error: 'Database unavailable' });
			await page.getByRole('checkbox', { name: 'Review', exact: true }).click();
			const toast = page.getByRole('alert').getByText('Database unavailable').locator('..');
			const animation = () => toast.evaluate((element) => getComputedStyle(element).animationName);

			// WHEN / THEN: Without preference, it slides in; with reduce, there is no animation.
			await page.emulateMedia({ reducedMotion: 'no-preference' });
			expect(await animation()).toMatch(/slideIn/);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			expect(await animation()).toBe('none');
		});
	});
});
