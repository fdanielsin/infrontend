import { vi } from 'vitest';

// jsdom has no layout: this stands in for it. `heights` gives the content and box heights of every
// element (by default 0 and 0), and `resize()` runs the observers like a real resize would.
export function stubLayout() {
	const heights = { scroll: 0, client: 0, width: 0 };
	const callbacks = new Set<() => void>();
	vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => heights.scroll);
	vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => heights.client);
	vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => heights.width);
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(callback: () => void) {
				callbacks.add(callback);
			}
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
	return {
		heights,
		resize() {
			callbacks.forEach((callback) => callback());
		}
	};
}
