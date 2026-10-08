import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealTasks, TWO_COLUMNS_QUERY } from '$lib/features/tasks/reveal-tasks';

function heading() {
	const element = document.createElement('h3');
	element.tabIndex = -1;
	element.scrollIntoView = vi.fn();
	vi.spyOn(element, 'focus');
	document.body.append(element);
	return element;
}

// A matchMedia whose answer depends on the query: `queries` lists those that match.
function stubMatchMedia(queries: string[]) {
	vi.stubGlobal(
		'matchMedia',
		vi.fn((query: string) => ({ matches: queries.includes(query), media: query }))
	);
}

describe('revealTasks', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('scrolls to the heading and focuses it in a single column (happy path)', () => {
		// GIVEN: A narrow viewport.
		stubMatchMedia([]);
		const element = heading();

		// WHEN: The tasks are revealed.
		revealTasks(element);

		// THEN: The heading is scrolled to its start, smoothly, then focused without a second scroll.
		expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
		expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
	});

	it('does nothing when the two columns are side by side (limit)', () => {
		// GIVEN: A viewport at the breakpoint of the two-column grid (48rem, boundary value).
		stubMatchMedia([TWO_COLUMNS_QUERY]);
		const element = heading();

		// WHEN: The tasks are revealed.
		revealTasks(element);

		// THEN: Neither the scroll nor the focus moves.
		expect(TWO_COLUMNS_QUERY).toBe('(min-width: 48rem)');
		expect(element.scrollIntoView).not.toHaveBeenCalled();
		expect(element.focus).not.toHaveBeenCalled();
	});

	it('does not animate the scroll under prefers-reduced-motion (limit)', () => {
		// GIVEN: A narrow viewport and a user who asks for reduced motion.
		stubMatchMedia(['(prefers-reduced-motion: reduce)']);
		const element = heading();

		// WHEN: The tasks are revealed.
		revealTasks(element);

		// THEN: The scroll is immediate.
		expect(element.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
	});

	it('does nothing without matchMedia (exception)', () => {
		// GIVEN: An environment with no matchMedia (jsdom).
		vi.stubGlobal('matchMedia', undefined);
		const element = heading();

		// WHEN / THEN: Nothing is moved and nothing throws.
		expect(() => revealTasks(element)).not.toThrow();
		expect(element.scrollIntoView).not.toHaveBeenCalled();
		expect(element.focus).not.toHaveBeenCalled();
	});

	it('still focuses the heading when scrollIntoView is missing (exception)', () => {
		// GIVEN: A narrow viewport and an element with no scrollIntoView.
		stubMatchMedia([]);
		const element = heading();
		Object.defineProperty(element, 'scrollIntoView', { value: undefined });

		// WHEN / THEN: The focus still moves and nothing throws.
		expect(() => revealTasks(element)).not.toThrow();
		expect(element.focus).toHaveBeenCalledWith({ preventScroll: true });
	});

	it('does nothing when matchMedia throws (exception)', () => {
		// GIVEN: A matchMedia that throws.
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => {
				throw new Error('blocked');
			})
		);
		const element = heading();

		// WHEN / THEN: The page stays as it is.
		expect(() => revealTasks(element)).not.toThrow();
		expect(element.focus).not.toHaveBeenCalled();
	});
});
