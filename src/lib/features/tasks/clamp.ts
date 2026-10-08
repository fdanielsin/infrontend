// A clamped text overflows when its content is taller than its box; one pixel of difference is
// sub-pixel rounding, not hidden text.
export function isOverflowing({
	scrollHeight,
	clientHeight
}: Pick<HTMLElement, 'scrollHeight' | 'clientHeight'>) {
	return scrollHeight - clientHeight > 1;
}
