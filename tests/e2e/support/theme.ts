import type { Page } from '@playwright/test';

// What the theme looks like, read from the rendered page and never from a class name or an
// attribute: the resolved page colors (`--color-page-from` and `--color-page-to`, read through a
// probe element so that `light-dark()` is resolved for the scheme in force) and the system colors.

const luminanceOf = (page: Page, css: string): Promise<number> =>
	page.evaluate((value) => {
		const probe = document.createElement('div');
		probe.style.setProperty('background-color', value);
		document.body.append(probe);
		const painted = getComputedStyle(probe).backgroundColor;
		probe.remove();
		const context = document
			.createElement('canvas')
			.getContext('2d', { willReadFrequently: true })!;
		context.fillStyle = '#000';
		context.fillStyle = painted;
		context.fillRect(0, 0, 1, 1);
		const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
		const linear = (channel: number) => {
			const v = channel / 255;
			return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		};
		return 0.2126 * linear(red!) + 0.7152 * linear(green!) + 0.0722 * linear(blue!);
	}, css);

// Relative luminance (0 black, 1 white) of the two ends of the page gradient.
export async function pageLuminance(page: Page): Promise<{ from: number; to: number }> {
	return {
		from: await luminanceOf(page, 'var(--color-page-from)'),
		to: await luminanceOf(page, 'var(--color-page-to)')
	};
}

// Relative luminance of the system `Canvas` color: what a native control paints with (R09).
export const canvasLuminance = (page: Page) => luminanceOf(page, 'Canvas');

// Light pages are above 0.5 at both ends of the gradient (blue-50, indigo-100), dark ones below 0.1.
export async function resolvedTheme(page: Page): Promise<'light' | 'dark'> {
	const { from, to } = await pageLuminance(page);
	if (from > 0.5 && to > 0.5) return 'light';
	if (from < 0.1 && to < 0.1) return 'dark';
	throw new Error(`The page is neither light nor dark: gradient luminance ${from}, ${to}`);
}
