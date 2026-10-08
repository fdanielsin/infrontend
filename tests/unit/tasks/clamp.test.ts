import { describe, expect, it } from 'vitest';
import { isOverflowing } from '$lib/features/tasks/clamp';

describe('isOverflowing', () => {
	it.each([
		[100, 100, false],
		[101, 100, false],
		[102, 100, true],
		[400, 72, true],
		[0, 0, false]
	])(
		'scrollHeight %i over clientHeight %i overflows: %s (boundary values)',
		(scroll, client, expected) => {
			// GIVEN / WHEN: A clamped element whose content is taller (or not) than its box.
			// THEN: Only a difference of more than one pixel (sub-pixel rounding) counts.
			expect(isOverflowing({ scrollHeight: scroll, clientHeight: client })).toBe(expected);
		}
	);

	it('is false for a detached element that has no layout (exception)', () => {
		// GIVEN / WHEN / THEN: jsdom reports 0 and 0.
		expect(isOverflowing(document.createElement('p'))).toBe(false);
	});
});
