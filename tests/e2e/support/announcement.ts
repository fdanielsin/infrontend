import { expect, type Locator, type Page } from '@playwright/test';

// The live region of low-severity news (sort order, language, a row that moved): read by screen
// readers, never shown. Playwright counts a 1 px sr-only element as visible, so `toBeVisible`
// proves nothing here: the text is read from the region and its box is measured instead.
export const announcement = (page: Page): Locator => page.locator('[data-announcement]');

export async function expectAnnounced(page: Page, message: string) {
	const region = announcement(page);
	await expect(region).toHaveText(message);
	await expect(region).toHaveAttribute('aria-live', 'polite');
	await expect(region).toHaveAttribute('aria-atomic', 'true');
	const box = await region.boundingBox();
	expect(box?.width ?? 0).toBeLessThanOrEqual(1);
	expect(box?.height ?? 0).toBeLessThanOrEqual(1);
	await expect(page.locator('[data-toast]')).toHaveCount(0);
}

export async function expectSilent(page: Page) {
	await expect(announcement(page)).toHaveText('');
	await expect(page.locator('[data-toast]')).toHaveCount(0);
}
