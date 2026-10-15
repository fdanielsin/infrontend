import { expect, test, type Page } from '@playwright/test';
import { expectNoAxeViolations } from './support/axe';
import { nextFocusKey } from './support/keyboard';
import { horizontalOverflow } from './support/layout';
import { LOCALES, setLocaleCookie, type Locale } from './support/locale';
import { ada, mockApi, openHomeWithUser, type MockTask } from './support/mock-api';

// "Mark all as done" (FP-04, TASK-R22 to R26) in a real browser, the API mocked. The rules of the
// store are tested by task-complete-all.test.ts, the presence, the labels and the focus of the
// component by TaskList.markAll.test.ts. Kept here: what jsdom does not see (layout at 320 px in
// four languages, the computed cursor and colours, the real keyboard, forced colours, axe).

const todo = (id: number): MockTask => ({
	id,
	title: `Todo ${id}`,
	description: '',
	user_id: 1,
	completed: false
});
const THREE = [todo(1), todo(2), todo(3)];

// The texts to guarantee are the table of the spec (tasks-completion.md, « Libellés »), written out.
const TEXTS: Record<Locale, { command: string; toast: string; undo: string }> = {
	en: {
		command: 'Mark all as done',
		toast: 'All tasks marked as done',
		undo: 'Undo'
	},
	fr: {
		command: 'Tout marquer comme terminé',
		toast: 'Toutes les tâches sont marquées comme terminées',
		undo: 'Annuler'
	},
	de: {
		command: 'Alle als erledigt markieren',
		toast: 'Alle Aufgaben als erledigt markiert',
		undo: 'Rückgängig'
	},
	es: {
		command: 'Marcar todo como hecho',
		toast: 'Todas las tareas marcadas como hechas',
		undo: 'Deshacer'
	}
};

const command = (page: Page, name = 'Mark all as done') =>
	page.getByRole('button', { name, exact: true });
const undoButton = (page: Page, name = 'Undo') =>
	page.getByRole('status').getByRole('button', { name });

// The requests to update a task wait for `release()`, then reach the mocked API.
async function holdUpdates(page: Page) {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	await page.route(/\/api\/v1\/tasks\/\d+$/, async (route) => {
		if (route.request().method() !== 'PUT') return route.fallback();
		await gate;
		return route.fallback();
	});
	return release;
}

test.describe('Mark all as done: layout and texts (mocked API)', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	for (const locale of LOCALES) {
		test(`TASK-R22: ${locale} at 320 px, the command takes a whole line and nothing scrolls sideways (boundary)`, async ({
			page,
			context
		}) => {
			// GIVEN: A narrow window, in one language, with three tasks to do.
			const { command: label, toast, undo } = TEXTS[locale];
			await page.setViewportSize({ width: 320, height: 800 });
			await setLocaleCookie(context, locale);
			await mockApi(page, { users: [ada], tasks: THREE });
			await page.goto('/');
			await page.getByRole('button', { name: /^Ada Lovelace [^(]/ }).click();
			const button = command(page, label);
			await expect(button).toBeVisible();

			// THEN: The text is the language's, on a whole line, at least 44 px high, not cut.
			const box = (await button.boundingBox())!;
			const bar = (await page
				.locator('#task-filter')
				.locator('xpath=ancestor::div[1]')
				.boundingBox())!;
			expect(box.height).toBeGreaterThanOrEqual(44);
			expect(box.width).toBeGreaterThanOrEqual(bar.width - 1);
			expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
			expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

			// WHEN: The command is activated.
			await button.click();

			// THEN: The toast and its Undo are in the same language, no raw key is shown.
			await expect(page.getByRole('status').getByText(toast)).toBeVisible();
			await expect(undoButton(page, undo)).toBeVisible();
			expect(await page.locator('body').innerText()).not.toMatch(/\btasks_[a-z_]+\b/);
			expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		});
	}

	for (const width of [640, 1280]) {
		test(`TASK-R22: at ${width} px the command sits on the bottom edge of the two lists (boundary)`, async ({
			page
		}) => {
			await page.setViewportSize({ width, height: 800 });
			await mockApi(page, { users: [ada], tasks: THREE });
			await openHomeWithUser(page);
			await expect(command(page)).toBeVisible();

			const bottom = async (locator: ReturnType<Page['locator']>) => {
				const box = (await locator.boundingBox())!;
				return box.y + box.height;
			};
			// AND: It keeps its own height (a button of 42 px), it is not stretched to the height of a list
			// with its label above (about 53 px).
			expect((await command(page).boundingBox())!.height).toBeLessThanOrEqual(46);
			for (const select of [page.locator('#task-filter'), page.locator('#task-order')]) {
				expect(
					Math.abs((await bottom(command(page))) - (await bottom(select)))
				).toBeLessThanOrEqual(1);
			}
		});
	}

	test('TASK-R22: at 768 px, where the list is narrow, the command goes to its own row instead of being squeezed (limit)', async ({
		page
	}) => {
		await page.setViewportSize({ width: 768, height: 800 });
		await mockApi(page, { users: [ada], tasks: THREE });
		await openHomeWithUser(page);
		await expect(command(page)).toBeVisible();

		const button = (await command(page).boundingBox())!;
		const order = (await page.locator('#task-order').boundingBox())!;
		// Under the lists, not beside them; its text on one line (it is not squeezed).
		expect(button.y).toBeGreaterThanOrEqual(order.y + order.height);
		expect(button.height).toBeLessThan(60);
		expect(await command(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
	});
});

test.describe('Mark all as done: look (mocked API)', () => {
	test('TASK-R22: is a secondary button, like the other choices, never the accent of the view (happy path)', async ({
		page
	}) => {
		// GIVEN: The page with a selected user, so that "Add Task" (primary) and "View Statistics"
		// (a link with the secondary look) are on it.
		await mockApi(page, { users: [ada], tasks: THREE });
		await openHomeWithUser(page);
		const paint = (locator: ReturnType<Page['locator']>) =>
			locator.evaluate((el) => {
				const s = getComputedStyle(el);
				return { background: s.backgroundColor, color: s.color, border: s.borderTopColor };
			});

		// THEN: The command is painted like a secondary button, and not like the primary one.
		const commandPaint = await paint(command(page));
		const secondary = await paint(page.getByRole('link', { name: 'View Statistics' }));
		const primary = await paint(page.getByRole('button', { name: 'Add Task', exact: true }));
		expect(commandPaint).toEqual(secondary);
		expect(commandPaint.background).not.toBe(primary.background);
	});
});

test.describe('Mark all as done: states and keyboard (mocked API)', () => {
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
	});

	test('TASK-R25: the keyboard marks, lands on Undo, and gets the command back after Undo (happy path)', async ({
		page,
		browserName
	}) => {
		// GIVEN: Three tasks to do; the focus on the list "Sort by".
		const api = await mockApi(page, { users: [ada], tasks: THREE });
		await openHomeWithUser(page);
		await page.locator('#task-order').focus();

		// WHEN: Tab goes to the command, which is the next control, and Enter activates it.
		await page.keyboard.press(nextFocusKey(browserName));
		await expect(command(page)).toBeFocused();
		await page.keyboard.press('Enter');

		// THEN: Every task was updated, the command is gone and Undo has the focus.
		await expect(page.getByRole('status').getByText('All tasks marked as done')).toBeVisible();
		await expect(command(page)).toHaveCount(0);
		await expect(undoButton(page)).toBeFocused();
		expect(api.requests.filter((r) => r.operation === 'PUT /tasks/{id}')).toHaveLength(3);
		await expectNoAxeViolations(page);

		// WHEN: Undo is pressed with Enter.
		await page.keyboard.press('Enter');

		// THEN: The tasks are to do again and the command, which came back, has the focus.
		await expect(command(page)).toBeFocused();
		expect(api.tasks.every((task) => !task.completed)).toBe(true);
	});

	test('TASK-R22: while sending the command keeps its look, says it is busy, shows the progress cursor and the focus (limit)', async ({
		page
	}) => {
		// GIVEN: Updates that wait, and the command focused.
		const api = await mockApi(page, { users: [ada], tasks: THREE });
		const release = await holdUpdates(page);
		await openHomeWithUser(page);
		const style = (locator: ReturnType<typeof command>) =>
			locator.evaluate((el) => {
				const s = getComputedStyle(el);
				return { cursor: s.cursor, color: s.color, border: s.borderTopColor };
			});
		const resting = await style(command(page));
		await command(page).focus();

		// WHEN: It is activated.
		await page.keyboard.press('Enter');

		// THEN: The text changes, the button is busy, not disabled, keeps the focus and the colours.
		const busy = command(page, 'Marking…');
		await expect(busy).toHaveAttribute('aria-busy', 'true');
		await expect(busy).toBeEnabled();
		await expect(busy).toBeFocused();
		const sending = await style(busy);
		expect(sending.cursor).toBe('progress');
		expect(sending.color).toBe(resting.color);
		expect(sending.border).toBe(resting.border);
		await expectNoAxeViolations(page);

		// AND: A second activation sends nothing more.
		await page.keyboard.press('Enter');
		release();
		await expect(page.getByRole('status').getByText('All tasks marked as done')).toBeVisible();
		expect(api.requests.filter((r) => r.operation === 'PUT /tasks/{id}')).toHaveLength(3);
	});

	test('TASK-R22: during an edit the command is inactive and looks so, also with forced colours (limit)', async ({
		page
	}) => {
		await mockApi(page, { users: [ada], tasks: THREE });
		await openHomeWithUser(page);
		await page.emulateMedia({ forcedColors: 'active' });
		const look = () =>
			command(page).evaluate((el) => {
				const s = getComputedStyle(el);
				return { color: s.color, borderWidth: s.borderTopWidth, borderStyle: s.borderTopStyle };
			});
		const enabled = await look();

		await page.getByRole('button', { name: 'Edit Todo 1', exact: true }).click();

		await expect(command(page)).toBeDisabled();
		const inactive = await look();
		expect(inactive.color).not.toBe(enabled.color);
		expect(inactive.borderStyle).not.toBe('none');
		expect(Number.parseFloat(inactive.borderWidth)).toBeGreaterThan(0);
		await expectNoAxeViolations(page);
	});

	test('TASK-R24: after a partial failure the Undo toast is above the error and the command stays (sad path)', async ({
		page
	}) => {
		await page.setViewportSize({ width: 320, height: 800 });
		const api = await mockApi(page, { users: [ada], tasks: THREE });
		api.failNext('PUT /tasks/{id}', {
			status: 500,
			error: 'Database unavailable',
			requestId: 'req-1'
		});
		await openHomeWithUser(page);
		await command(page).focus();

		await page.keyboard.press('Enter');

		const undoToast = page.getByRole('status').getByText('Tasks marked as done: 2');
		const errorToast = page.getByRole('alert').getByText("We couldn't mark every task as done.");
		await expect(undoToast).toBeVisible();
		await expect(errorToast).toBeVisible();
		const [undoBox, errorBox] = [
			(await undoToast.boundingBox())!,
			(await errorToast.boundingBox())!
		];
		expect(undoBox.y).toBeLessThan(errorBox.y);
		await expect(command(page)).toBeFocused();
		expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
		await expectNoAxeViolations(page);
	});

	test('TASK-R24: after a partial failure the focused command is not under the toasts, in a window of 320 x 640 px (boundary)', async ({
		page
	}) => {
		// GIVEN: A small window and three tasks, one of which will be refused.
		await page.setViewportSize({ width: 320, height: 640 });
		const api = await mockApi(page, { users: [ada], tasks: THREE });
		api.failNext('PUT /tasks/{id}', {
			status: 500,
			error: 'Database unavailable',
			requestId: 'req-1'
		});
		await openHomeWithUser(page);
		await command(page).focus();

		// WHEN: The command is activated with the keyboard, and the two toasts come.
		await page.keyboard.press('Enter');
		await expect(
			page.getByRole('alert').getByText("We couldn't mark every task as done.")
		).toBeVisible();
		await expect(command(page)).toBeFocused();

		// THEN: The command is wholly above the stack of toasts, which hides nothing of it.
		const control = (await command(page).boundingBox())!;
		const stack = (await page.getByRole('region', { name: 'Notifications' }).boundingBox())!;
		expect(control.y + control.height).toBeLessThanOrEqual(stack.y);
		expect(control.y).toBeGreaterThanOrEqual(0);
	});
});
