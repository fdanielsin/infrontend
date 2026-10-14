import { expect, test } from '@playwright/test';
import { nextFocusKey } from './support/keyboard';
import { ada, grace, mockApi } from './support/mock-api';

// The focus ring of the button that selects a user stays inside its row and never touches the
// Edit button next to it (WCAG 2.4.11: a focus indicator hidden or crowded by neighbours). The
// ring is an outline: its box is the button grown by the offset and the width. The API is mocked.

for (const width of [1280, 320]) {
	test.describe(`Focus ring of the selection button at ${width} px (mocked API)`, () => {
		test.use({ viewport: { width, height: 800 } });

		for (const selected of [true, false]) {
			test(`${selected ? 'selected' : 'unselected'} row: the ring is inside the row and clear of Edit (happy path)`, async ({
				page,
				browserName
			}) => {
				// GIVEN: Two users, the first one selected or not.
				await mockApi(page, { users: [ada, grace] });
				await page.goto('/');
				const button = page.locator('#user-select-1');
				await expect(button).toBeVisible();
				if (selected) await button.click();

				// WHEN: The keyboard puts the focus on that button.
				await page.locator('body').click({ position: { x: 1, y: 1 } });
				for (
					let tabs = 0;
					tabs < 10 && !(await button.evaluate((b) => b === document.activeElement));
					tabs++
				) {
					await page.keyboard.press(nextFocusKey(browserName));
				}
				await expect(button).toBeFocused();

				// THEN: The outline, measured, lies inside the row and does not meet the Edit button.
				const measured = await button.evaluate((element) => {
					const style = getComputedStyle(element);
					const grow = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
					const box = element.getBoundingClientRect();
					const row = element.closest('li')!.getBoundingClientRect();
					const edit = element
						.closest('li')!
						.querySelector('button:not([aria-pressed]):not([aria-label^="Delete"])')!
						.getBoundingClientRect();
					return {
						style: style.outlineStyle,
						ring: {
							left: box.left - grow,
							right: box.right + grow,
							top: box.top - grow,
							bottom: box.bottom + grow
						},
						row: { left: row.left, right: row.right, top: row.top, bottom: row.bottom },
						edit: { left: edit.left, right: edit.right, top: edit.top, bottom: edit.bottom }
					};
				});
				expect(measured.style).toBe('solid');
				expect(measured.ring.left).toBeGreaterThanOrEqual(measured.row.left);
				expect(measured.ring.right).toBeLessThanOrEqual(measured.row.right);
				expect(measured.ring.top).toBeGreaterThanOrEqual(measured.row.top);
				expect(measured.ring.bottom).toBeLessThanOrEqual(measured.row.bottom);
				const meetsEdit =
					measured.ring.left < measured.edit.right &&
					measured.ring.right > measured.edit.left &&
					measured.ring.top < measured.edit.bottom &&
					measured.ring.bottom > measured.edit.top;
				expect(meetsEdit).toBe(false);
			});
		}
	});
}

// The margin that holds the ring inside the row is paid for by the padding of the button: the row
// is as high as before (12 px above and under the two lines of text), and the text has not moved.
for (const width of [1280, 320]) {
	test.describe(`Selection row height at ${width} px (mocked API)`, () => {
		test.use({ viewport: { width, height: 800 } });

		test('the text starts 12 px under the top of the row and the button adds no height (happy path)', async ({
			page
		}) => {
			// GIVEN: Two users, the first one selected.
			await mockApi(page, { users: [ada, grace] });
			await page.goto('/');
			await page.locator('#user-select-1').click();

			// THEN: Per row, the button is its two text lines plus 12 px above and under (the
			// outer margin and the padding together), and the name sits 12 px from the top and 16 px
			// from the left, as before the margin existed.
			const rows = await page.evaluate(() =>
				[1, 2].map((id) => {
					const button = document.getElementById(`user-select-${id}`)!;
					const li = button.closest('li')!.getBoundingClientRect();
					const box = button.getBoundingClientRect();
					const lines = button.querySelector('span')!.getBoundingClientRect();
					return {
						aboveText: lines.top - li.top,
						underText: box.bottom - lines.bottom + (li.bottom - box.bottom),
						left: lines.left - li.left
					};
				})
			);
			for (const row of rows) {
				expect(row.aboveText).toBeCloseTo(12, 0);
				expect(row.left).toBeCloseTo(16, 0);
			}
			// Row 1 and 2 ends at the same distance under the text only when no extra band exists
			// at 1280 px (the actions sit beside the button there).
			if (width >= 640) {
				for (const row of rows) expect(row.underText).toBeCloseTo(12, 0);
			}
		});
	});
}
