import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { contrast, type Rgb } from './support/contrast';
import { PAIRS, type PairBackground } from './support/contrast-pairs';
import { ada, adaTasks, mockApi } from './support/mock-api';
import { rgbOf } from './support/theme';

// THEME-R08, criterion 16: every pair of the table (tests/e2e/support/contrast-pairs.ts) reaches its
// ratio in both themes, measured on the colors the page really paints (the tokens resolved for the
// scheme in force, the gradient by `--color-page-from` and `--color-page-to`). The theme is the choice
// of the cookie, so that the device does not matter; a second test lets the device choose (System).
// The API is mocked; the page is the production build.

const ORIGIN = `http://localhost:${process.env.E2E_PORT || 4173}`;
const setTheme = (context: BrowserContext, value: 'light' | 'dark') =>
	context.addCookies([{ name: 'theme', value, url: ORIGIN }]);

async function openHome(page: Page, path: string) {
	await mockApi(page, { users: [ada], tasks: adaTasks, stats: { users: 1, tasks: 2 } });
	const hydrated = page.waitForResponse((response) => response.url().includes('/api/v1/'));
	await page.goto(path);
	await hydrated;
}

// The failing pairs of a page, one line each; empty when every pair holds.
async function failures(page: Page, theme: 'light' | 'dark'): Promise<string[]> {
	const colors = new Map<string, Rgb>();
	const colorOf = async (token: string) => {
		if (!colors.has(token)) colors.set(token, await rgbOf(page, `var(${token})`));
		return colors.get(token)!;
	};
	const backgrounds = async (background: PairBackground): Promise<[string, Rgb][]> =>
		background === 'page'
			? [
					['page (start)', await colorOf('--color-page-from')],
					['page (end)', await colorOf('--color-page-to')]
				]
			: [[background, await colorOf(background)]];
	const failed: string[] = [];
	for (const pair of PAIRS) {
		if (pair.themes && !pair.themes.includes(theme)) continue;
		const foreground = await colorOf(pair.foreground);
		for (const background of pair.backgrounds) {
			for (const [name, color] of await backgrounds(background)) {
				const ratio = contrast(foreground, color);
				if (ratio < pair.minimum) {
					failed.push(
						`${theme}: ${pair.foreground} on ${name} is ${ratio.toFixed(2)}:1, ${pair.minimum}:1 needed (${pair.name})`
					);
				}
			}
		}
	}
	return failed;
}

test.describe('Contrast pairs (mocked API)', () => {
	for (const theme of ['light', 'dark'] as const) {
		for (const path of ['/', '/stats']) {
			test(`THEME-R08: every pair of the table reaches its ratio in the ${theme} theme on ${path} (happy path)`, async ({
				browser
			}) => {
				const context = await browser.newContext({
					colorScheme: theme === 'light' ? 'dark' : 'light'
				});
				// The device is the other one: the choice of the cookie is what decides.
				await setTheme(context, theme);
				const page = await context.newPage();
				await openHome(page, path);
				expect(await failures(page, theme)).toEqual([]);
				await context.close();
			});
		}

		test(`THEME-R08: System on a ${theme} device gives the same colors as the choice (boundary)`, async ({
			browser
		}) => {
			const context = await browser.newContext({ colorScheme: theme });
			const page = await context.newPage();
			await openHome(page, '/');
			expect(await failures(page, theme)).toEqual([]);
			await context.close();
		});
	}
});
