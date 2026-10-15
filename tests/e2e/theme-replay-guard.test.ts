import { expect, test } from '@playwright/test';
import { ada, adaTasks, mockApi } from './support/mock-api';
import { resolvedTheme } from './support/theme';

// THEME-R08: the dark replay (the `chromium-dark` project of playwright.config.ts) runs the files that
// measure colors on a dark device. If it silently ran in light, every contrast it reports would be
// the light theme's: this file fails then. It runs in that project only.
test.describe('Dark replay guard (mocked API)', () => {
	test('THEME-R08: the replay runs on a dark device and the pages are dark, with no theme cookie (happy path)', async ({
		page,
		context
	}, testInfo) => {
		expect(testInfo.project.name).toBe('chromium-dark');
		await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 1, tasks: 2 } });
		for (const path of ['/', '/stats']) {
			await page.goto(path);
			expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(
				true
			);
			expect(await resolvedTheme(page), path).toBe('dark');
		}
		expect((await context.cookies()).filter((cookie) => cookie.name === 'theme')).toEqual([]);
		await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
	});
});
