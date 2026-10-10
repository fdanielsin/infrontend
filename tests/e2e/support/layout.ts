import type { Page } from '@playwright/test';

// How far the page is wider than the window (WCAG 1.4.10): 0 or less means no sideways scroll.
export const horizontalOverflow = (page: Page): Promise<number> =>
	page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
