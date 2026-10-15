import type { Locator } from '@playwright/test';

// Computed-style contrast measures shared by the E2E tests (never on class names).

export type Rgb = [number, number, number];

export interface Measure {
	color: Rgb;
	// Colors of the backgrounds the element can sit on, nearest first; the page gradient gives
	// its two ends.
	backgrounds: Rgb[];
}

function luminance([red, green, blue]: Rgb): number {
	const linear = (channel: number) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

export function contrast(first: Rgb, second: Rgb): number {
	const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
	return (light! + 0.05) / (dark! + 0.05);
}

// Resolves any CSS color (the palette is in oklch) to sRGB through a canvas, and walks up from
// the element's parent to the first opaque background (an outline or a border is drawn against
// what surrounds the element, not against its own fill); the page gradient is read from `--color-page-from` and `--color-page-to`.
export async function measure(
	locator: Locator,
	property: 'outlineColor' | 'color' | 'borderTopColor' | 'borderLeftColor',
	from: 'parent' | 'self' = 'parent'
): Promise<Measure> {
	return locator.evaluate(
		(element, [prop, origin]) => {
			const context = document
				.createElement('canvas')
				.getContext('2d', { willReadFrequently: true })!;
			const resolve = (css: string): [number, number, number, number] => {
				context.clearRect(0, 0, 1, 1);
				context.fillStyle = '#000';
				context.fillStyle = css;
				context.fillRect(0, 0, 1, 1);
				const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
				return [red!, green!, blue!, alpha!];
			};
			const rgb = (css: string): [number, number, number] =>
				resolve(css).slice(0, 3) as [number, number, number];
			// The two ends of the gradient, as painted for the scheme in force: read through a probe, since the
			// tokens are `light-dark()` values that only resolve on an element.
			const painted = (token: string) => {
				const probe = document.createElement('div');
				probe.style.setProperty('background-color', `var(${token})`);
				document.body.append(probe);
				const color = getComputedStyle(probe).backgroundColor;
				probe.remove();
				return rgb(color);
			};
			const gradient = [painted('--color-page-from'), painted('--color-page-to')];
			const backgrounds: [number, number, number][] = [];
			for (
				let node: Element | null = origin === 'self' ? element : element.parentElement;
				node;
				node = node.parentElement
			) {
				const style = getComputedStyle(node);
				if (style.backgroundImage.includes('gradient')) {
					backgrounds.push(...gradient);
					break;
				}
				const [red, green, blue, alpha] = resolve(style.backgroundColor);
				if (alpha === 255) {
					backgrounds.push([red, green, blue]);
					break;
				}
			}
			return {
				color: rgb(getComputedStyle(element)[prop]),
				backgrounds
			};
		},
		[property, from] as const
	);
}

export function worstContrast({ color, backgrounds }: Measure): number {
	return Math.min(...backgrounds.map((background) => contrast(color, background)));
}
