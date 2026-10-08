// Same breakpoint as the two-column grid of the home page (`md`).
export const TWO_COLUMNS_QUERY = '(min-width: 48rem)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

// Attachment of the task list heading. In a single column the tasks sit below the whole user list:
// after a selection the heading is scrolled into view and focused. Side by side the panel is already
// visible and the focus stays in the user list. Without matchMedia, nothing moves.
export function revealTasks(heading: HTMLElement) {
	try {
		if (typeof matchMedia !== 'function' || matchMedia(TWO_COLUMNS_QUERY).matches) return;
		const behavior = matchMedia(REDUCED_MOTION_QUERY).matches ? 'auto' : 'smooth';
		heading.scrollIntoView?.({ block: 'start', behavior });
	} catch {
		return;
	}
	heading.focus({ preventScroll: true });
}
