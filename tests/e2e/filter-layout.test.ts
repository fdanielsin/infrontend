import { expect, test, type Page } from '@playwright/test';
import { LOCALES, switchLanguage, type Locale } from './support/locale';
import { adaTasks, ada, mockApi } from './support/mock-api';

// The two selectors of the task list (Show, Sort by) are laid out the same way in every language:
// the label above its selector, both starting at the same left edge, the two blocks side by side
// from 640 px and one under the other below. A label of another length moves nothing (remark of
// qa3 on #77: the selector sat at another place in each language, and one wrapped under its label
// in German and Spanish at 320 px). The API is mocked.

interface Layout {
	// Each selector starts at the left edge of its label and under it.
	stacked: boolean;
	// The two blocks share a row.
	sideBySide: boolean;
	// Left edge of the first block, relative to the list: the same for every language.
	left: number;
}

async function layoutOf(page: Page): Promise<Layout> {
	return page.evaluate(() => {
		const blocks = ['task-filter', 'task-order'].map((id) => {
			const select = document.getElementById(id)!.getBoundingClientRect();
			const label = document.querySelector(`label[for="${id}"]`)!.getBoundingClientRect();
			return { select, label };
		});
		const [filter, order] = blocks as [(typeof blocks)[0], (typeof blocks)[0]];
		const list = document.querySelector('ul')!.getBoundingClientRect();
		return {
			stacked: blocks.every(
				({ select, label }) =>
					Math.abs(select.left - label.left) <= 1 && select.top >= label.bottom - 1
			),
			sideBySide: Math.abs(filter.select.top - order.select.top) <= 1,
			left: Math.round(filter.label.left - list.left)
		};
	});
}

for (const width of [1280, 640, 320]) {
	test.describe(`Task selectors at ${width} px (mocked API)`, () => {
		test.use({ viewport: { width, height: 900 } });

		test(`laid out identically in ${LOCALES.join(', ')} (happy path)`, async ({ page }) => {
			// GIVEN: A user with tasks, so that the selectors are shown.
			await mockApi(page, { users: [ada], tasks: adaTasks });
			await page.goto('/');
			await page.locator('#user-select-1').click();
			await expect(page.locator('#task-filter')).toBeVisible();

			// WHEN: The layout is measured in each language.
			const layouts = new Map<Locale, Layout>();
			for (const locale of LOCALES) {
				await switchLanguage(page, locale);
				layouts.set(locale, await layoutOf(page));
			}

			// THEN: Label above selector in each, the blocks side by side from 640 px, and no
			// language differs from English.
			const english = layouts.get('en')!;
			expect(english.stacked).toBe(true);
			expect(english.sideBySide).toBe(width >= 640);
			for (const locale of LOCALES) expect(layouts.get(locale), locale).toEqual(english);
		});
	});
}
