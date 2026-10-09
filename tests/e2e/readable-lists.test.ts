import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, type MockTask, type MockUser } from './support/mock-api';
import { contrast, measure, worstContrast } from './support/contrast';
import { nextFocusKey } from './support/keyboard';

// Readable lists (mocked API, production build): whole-row user buttons, a selection that is not the
// focus, the task list brought into view in a single column, descriptions clamped to three lines,
// a title field that grows. Real layout is needed here: jsdom has none.

const ADA: MockUser = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' };
const GRACE: MockUser = { id: 2, name: 'Grace Hopper', email: 'grace@example.com' };
const PROSE = 'Some words that can wrap on several lines, one after the other. '.repeat(40).trim();
const task = (id: number, over: Partial<MockTask> = {}): MockTask => ({
	id,
	title: `Task ${id}`,
	description: 'Short',
	user_id: 1,
	completed: false,
	...over
});

async function overflowingX(page: Page) {
	return page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth
	);
}

test.describe('User rows', () => {
	test('a click on the very edge of the row selects the user (happy path)', async ({ page }) => {
		// GIVEN: Two users.
		await mockApi(page, { users: [ADA, GRACE] });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		const row = page.getByRole('button', { name: /Grace Hopper/ });
		const box = (await row.boundingBox())!;

		// WHEN: The padding at the right end of the row is clicked.
		await page.mouse.click(box.x + box.width - 3, box.y + box.height / 2);

		// THEN: The user is selected, with a check and without any ring.
		await expect(row).toHaveAttribute('aria-pressed', 'true');
		await expect(row.locator('[data-icon="check"]')).toBeVisible();
		expect(await row.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
		expect(box.height).toBeGreaterThanOrEqual(44);
	});

	test('keeps the selected and the focused states apart, with enough contrast (limit)', async ({
		page,
		browserName
	}) => {
		// GIVEN: A selected user, focused with the keyboard, and another one.
		await mockApi(page, { users: [ADA, GRACE] });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		const selected = page.getByRole('button', { name: /Ada Lovelace/ });
		const other = page.getByRole('button', { name: /Grace Hopper/ });
		await selected.click();
		await expect(selected).toHaveAttribute('aria-pressed', 'true');
		const next = nextFocusKey(browserName);
		await page.keyboard.press(next);
		await page.keyboard.press(next.replace('Tab', 'Shift+Tab'));
		await expect(selected).toBeFocused();

		// THEN: The focus is an outline outside the row; the selection is a fill and a bar.
		const style = await selected.evaluate((element) => {
			const css = getComputedStyle(element);
			return {
				outlineStyle: css.outlineStyle,
				outlineWidth: css.outlineWidth,
				barWidth: css.borderLeftWidth,
				fill: css.backgroundColor
			};
		});
		expect(style.outlineStyle).toBe('solid');
		expect(style.outlineWidth).toBe('2px');
		expect(style.barWidth).toBe('4px');
		const otherFill = await other.evaluate((element) => getComputedStyle(element).backgroundColor);
		expect(style.fill).not.toBe(otherFill);

		// THEN: The name and the e-mail reach 4.5:1 on the selected row, the bar and the check 3:1.
		const name = selected.getByText('Ada Lovelace');
		const mail = selected.getByText('ada@example.com');
		const nameRatio = worstContrast(await measure(name, 'color', 'parent'));
		const mailRatio = worstContrast(await measure(mail, 'color', 'parent'));
		const bar = await measure(selected, 'borderLeftColor', 'self');
		const barRatio = contrast(bar.color, bar.backgrounds[0]!);
		const checkRatio = worstContrast(await measure(selected.locator('svg'), 'color', 'parent'));
		test.info().annotations.push({
			type: 'selected-row-contrast',
			description: `name ${nameRatio.toFixed(2)}, e-mail ${mailRatio.toFixed(2)}, bar ${barRatio.toFixed(2)}, check ${checkRatio.toFixed(2)}`
		});
		expect(nameRatio).toBeGreaterThanOrEqual(4.5);
		expect(mailRatio).toBeGreaterThanOrEqual(4.5);
		expect(barRatio).toBeGreaterThanOrEqual(3);
		expect(checkRatio).toBeGreaterThanOrEqual(3);
	});

	test('reaches 4.5:1 on the row under the pointer (limit)', async ({ page }) => {
		await mockApi(page, { users: [ADA, GRACE] });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		const row = page.getByRole('button', { name: /Grace Hopper/ });
		await row.hover();
		const name = row.getByText('Grace Hopper');
		const mail = row.getByText('grace@example.com');
		const nameRatio = worstContrast(await measure(name, 'color', 'parent'));
		const mailRatio = worstContrast(await measure(mail, 'color', 'parent'));
		test.info().annotations.push({
			type: 'hovered-row-contrast',
			description: `name ${nameRatio.toFixed(2)}, e-mail ${mailRatio.toFixed(2)}`
		});
		expect(nameRatio).toBeGreaterThanOrEqual(4.5);
		expect(mailRatio).toBeGreaterThanOrEqual(4.5);
	});

	test('stays marked in forced-colors mode (limit)', async ({ page, browserName }) => {
		test.skip(browserName !== 'chromium', 'forced colors emulation is Chromium-only');
		await mockApi(page, { users: [ADA, GRACE] });
		await page.emulateMedia({ forcedColors: 'active' });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		const selected = page.getByRole('button', { name: /Ada Lovelace/ });
		await selected.click();
		await expect(selected.locator('[data-icon="check"]')).toBeVisible();
		expect(await selected.evaluate((element) => getComputedStyle(element).borderLeftWidth)).toBe(
			'4px'
		);
	});
});

test.describe('Showing the tasks after a selection', () => {
	for (const width of [375, 320]) {
		test(`brings the task heading into view and focuses it at ${width} px (happy path)`, async ({
			page
		}) => {
			// GIVEN: Many users, so that the tasks are far below the list.
			const users = Array.from({ length: 25 }, (_, index) => ({
				id: index + 1,
				name: `User ${index + 1}`,
				email: `user${index + 1}@example.com`
			}));
			await mockApi(page, { users, tasks: [task(10)] });
			await page.setViewportSize({ width, height: 700 });
			await page.goto('/');

			// WHEN: A user in the list is chosen.
			await page.getByRole('button', { name: /User 3\b/ }).click();

			// THEN: The tasks heading is in the window and focused.
			const heading = page.getByRole('heading', { name: /^Tasks \(/ });
			await expect(heading).toBeFocused();
			await expect(heading).toBeInViewport();
		});
	}

	test('leaves the focus on the user list with two columns (limit)', async ({ page }) => {
		await mockApi(page, { users: [ADA, GRACE], tasks: [task(10)] });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		const row = page.getByRole('button', { name: /Ada Lovelace/ });
		await row.focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('heading', { name: /^Tasks \(/ })).toBeVisible();
		await expect(row).toBeFocused();
	});

	test('stops at the breakpoint: 768 px is two columns, 767 px is one (boundary values)', async ({
		page
	}) => {
		await mockApi(page, { users: [ADA], tasks: [task(10)] });
		await page.setViewportSize({ width: 768, height: 800 });
		await page.goto('/');
		const row = page.getByRole('button', { name: /Ada Lovelace/ });
		await row.focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('heading', { name: /^Tasks \(/ })).toBeVisible();
		await expect(row).toBeFocused();

		await page.setViewportSize({ width: 767, height: 800 });
		await page.goto('/');
		await page.getByRole('button', { name: /Ada Lovelace/ }).focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('heading', { name: /^Tasks \(/ })).toBeFocused();
	});
});

test.describe('No user selected', () => {
	test('the task panel is an empty state with an icon, a title and what to do (happy path)', async ({
		page
	}) => {
		// GIVEN: Users, none of them selected, on a wide screen.
		await mockApi(page, { users: [ADA, GRACE] });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		const heading = page.getByRole('heading', { level: 2, name: 'Select a user to manage tasks' });
		const hint = page.getByText('Pick a user in the list to see their tasks and add new ones.');
		await expect(heading).toBeVisible();
		const panel = heading.locator('xpath=..');
		const createUserY = (await page.getByRole('heading', { name: 'Create User' }).boundingBox())!.y;

		// THEN: An icon of 24 px hidden from assistive technology, a centered title and hint, a panel
		// tall enough to be a place of its own and shorter than the column beside it.
		const icon = panel.locator('[data-icon="group"]');
		const iconBox = (await icon.boundingBox())!;
		expect([iconBox.width, iconBox.height]).toEqual([24, 24]);
		await expect(icon).toHaveAttribute('aria-hidden', 'true');
		expect(await heading.evaluate((element) => getComputedStyle(element).textAlign)).toBe('center');
		expect(await hint.evaluate((element) => getComputedStyle(element).textAlign)).toBe('center');
		expect(worstContrast(await measure(hint, 'color'))).toBeGreaterThanOrEqual(4.5);
		const panelBox = (await panel.boundingBox())!;
		const leftColumn = (await page.getByRole('heading', { name: /Users \(\d+\)/ }).boundingBox())!;
		expect(panelBox.height).toBeGreaterThanOrEqual(160);
		expect(panelBox.height).toBeLessThan(leftColumn.y + leftColumn.height - panelBox.y);

		// WHEN: A user is chosen.
		await page.getByRole('button', { name: /Ada Lovelace/ }).click();
		await expect(page.getByRole('heading', { name: 'Tasks for Ada Lovelace' })).toBeVisible();

		// THEN: The left column did not move.
		expect((await page.getByRole('heading', { name: 'Create User' }).boundingBox())!.y).toBe(
			createUserY
		);
	});
});

test.describe('Long descriptions', () => {
	for (const width of [1280, 768, 320]) {
		for (const [label, description] of [
			['with spaces', PROSE.slice(0, 2000)],
			['without space', 'D'.repeat(2000)]
		] as const) {
			test(`clamps 2000 characters ${label} at ${width} px and expands them (limit)`, async ({
				page
			}) => {
				// GIVEN: A task with the longest description.
				await mockApi(page, { users: [ADA], tasks: [task(10, { description }), task(11)] });
				await page.setViewportSize({ width, height: 800 });
				await page.goto('/');
				await page.getByRole('button', { name: /Ada Lovelace/ }).click();
				const text = page.locator('#task-description-10');
				const more = page.getByRole('button', { name: 'Show more: Task 10' });

				// THEN: Three lines at most, a button on that row only, no sideways scroll.
				await expect(more).toBeVisible();
				await expect(page.locator('#task-description-11')).toBeVisible();
				await expect(page.getByRole('button', { name: /Show (more|less): Task 11/ })).toHaveCount(
					0
				);
				const lineHeight = await text.evaluate((element) =>
					parseFloat(getComputedStyle(element).lineHeight)
				);
				const clamped = (await text.boundingBox())!.height;
				expect(clamped).toBeLessThanOrEqual(lineHeight * 3 + 1);
				expect(await overflowingX(page)).toBe(false);

				// WHEN: It is expanded, then collapsed.
				await more.click();
				const expanded = (await text.boundingBox())!.height;
				expect(expanded).toBeGreaterThan(clamped * 2);
				expect(await overflowingX(page)).toBe(false);
				await page.getByRole('button', { name: 'Show less: Task 10' }).click();

				// THEN: It is clamped again.
				expect((await text.boundingBox())!.height).toBeLessThanOrEqual(lineHeight * 3 + 1);
			});
		}
	}

	test('shows no button for a description that fits in three lines (boundary values)', async ({
		page
	}) => {
		await mockApi(page, { users: [ADA], tasks: [task(10, { description: 'Three\nlines\nonly' })] });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		await page.getByRole('button', { name: /Ada Lovelace/ }).click();
		await expect(page.locator('#task-description-10')).toBeVisible();
		await expect(page.getByRole('button', { name: /Show more/ })).toHaveCount(0);
	});

	test('follows the width: the button appears when the column narrows (happy path)', async ({
		page
	}) => {
		await mockApi(page, { users: [ADA], tasks: [task(10, { description: PROSE.slice(0, 110) })] });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		await page.getByRole('button', { name: /Ada Lovelace/ }).click();
		await expect(page.locator('#task-description-10')).toBeVisible();
		await expect(page.getByRole('button', { name: /Show more/ })).toHaveCount(0);
		await page.setViewportSize({ width: 320, height: 800 });
		await expect(page.getByRole('button', { name: 'Show more: Task 10' })).toBeVisible();
		await page.setViewportSize({ width: 1280, height: 800 });
		await expect(page.getByRole('button', { name: /Show more/ })).toHaveCount(0);
	});
});

test.describe('Editing a task', () => {
	test('grows the title field to show 200 characters at 320 px, and saves with Enter (limit)', async ({
		page
	}) => {
		// GIVEN: A task with a 200-character title, unbroken.
		const title = 'T'.repeat(200);
		const api = await mockApi(page, { users: [ADA], tasks: [task(10, { title })] });
		await page.setViewportSize({ width: 320, height: 800 });
		await page.goto('/');
		await page.getByRole('button', { name: /Ada Lovelace/ }).click();

		// WHEN: The task is edited.
		await page.getByRole('button', { name: `Edit ${title}` }).click();
		const field = page.locator('#edit-title-10');

		// THEN: The whole title is visible (no inner scroll), no sideways scroll, a textbox for AT.
		await expect(field).toBeFocused();
		expect(
			await field.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)
		).toBe(true);
		expect(await overflowingX(page)).toBe(false);
		await expect(page.getByRole('textbox', { name: 'Task Title' }).first()).toBeVisible();
		const checkbox = page.getByRole('checkbox', { name: title });
		await expect(checkbox).toBeDisabled();
		await expect(page.getByRole('button', { name: `Delete ${title}` })).toBeDisabled();

		// WHEN: The title is emptied then shortened and Enter pressed.
		const before = (await field.boundingBox())!.height;
		await field.fill('Brief');
		expect((await field.boundingBox())!.height).toBeLessThan(before);
		await field.press('Enter');

		// THEN: It is saved as one line.
		await expect(page.getByText('Brief', { exact: true })).toBeVisible();
		expect(api.calls).toContain('PUT /tasks/{id}');
		await expect(page.getByRole('checkbox', { name: 'Brief' })).toBeEnabled();
	});

	test('measures the touch targets on a coarse pointer (limit)', async ({
		browser,
		browserName
	}) => {
		test.skip(browserName === 'firefox', 'Firefox has no touch emulation (isMobile)');
		const context = await browser.newContext({
			viewport: { width: 375, height: 800 },
			hasTouch: true,
			isMobile: true
		});
		const page = await context.newPage();
		const api = await mockApi(page, {
			users: [ADA],
			tasks: [task(10, { description: 'D'.repeat(2000) })]
		});
		await page.goto('/');
		await page.getByRole('button', { name: /Ada Lovelace/ }).tap();
		for (const name of ['Edit Task 10', 'Delete Task 10', 'Show more: Task 10']) {
			const box = (await page.getByRole('button', { name }).boundingBox())!;
			expect.soft(box.height, name).toBeGreaterThanOrEqual(44);
		}
		for (const name of ['Edit Task 10', 'Delete Task 10']) {
			const box = (await page.getByRole('button', { name }).boundingBox())!;
			expect.soft(box.width, name).toBeGreaterThanOrEqual(44);
		}
		// The checkbox answers a tap anywhere in a 44 px square around it, and is still drawn at 16 px.
		const checkbox = page.getByRole('checkbox', { name: 'Task 10' });
		await checkbox.scrollIntoViewIfNeeded();
		const box = (await checkbox.boundingBox())!;
		expect([box.width, box.height]).toEqual([16, 16]);
		const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		for (const [dx, dy] of [
			[-21, -21],
			[21, -21],
			[-21, 21],
			[21, 21]
		] as const) {
			const answer = await page.evaluate(
				([x, y]) => {
					const hit = document.elementFromPoint(x!, y!);
					const control = document.getElementById('task-10');
					const answers = hit === control || hit?.parentElement?.contains(control);
					return answers ? 'the checkbox' : `${hit?.tagName} ${hit?.className}`;
				},
				[center.x + dx, center.y + dy]
			);
			expect.soft(answer, `corner ${dx},${dy}`).toBe('the checkbox');
		}
		await page.touchscreen.tap(center.x - 21, center.y - 21);
		await expect(checkbox).toBeChecked();
		// The extra target is not read: the checkbox keeps its role and name, and axe finds nothing.
		await expect(page.getByRole('checkbox', { name: 'Task 10' })).toHaveCount(1);
		const target = page.locator('#task-10 + [data-touch-target]');
		await expect(target).toHaveAttribute('aria-hidden', 'true');
		expect(await target.evaluate((element) => element.tabIndex)).toBe(-1);
		// One tap, one change: WebKit must not toggle the box twice.
		expect(api.calls.filter((call) => call === 'PUT /tasks/{id}')).toHaveLength(1);
		expect(await checkbox.getAttribute('aria-hidden')).toBeNull();
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
		await context.close();
	});

	test('keeps the checkbox at 16 px with no wider hit area for a fine pointer (boundary values)', async ({
		page
	}) => {
		await mockApi(page, { users: [ADA], tasks: [task(10)] });
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		await page.getByRole('button', { name: /Ada Lovelace/ }).click();

		const box = (await page.getByRole('checkbox', { name: 'Task 10' }).boundingBox())!;
		const hitAside = await page.evaluate(
			([x, y]) => {
				const hit = document.elementFromPoint(x!, y!);
				return hit instanceof HTMLLabelElement && hit.control?.id === 'task-10';
			},
			[box.x - 10, box.y + box.height / 2]
		);

		expect([box.width, box.height]).toEqual([16, 16]);
		expect(hitAside).toBe(false);
	});
});
