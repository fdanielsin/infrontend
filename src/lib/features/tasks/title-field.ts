// The title is one logical line: a line break typed or pasted becomes a space.
export function oneLine(value: string) {
	return value.replace(/\r\n|\r|\n/g, ' ');
}

// Enter saves the edit instead of adding a line; Shift+Enter does nothing. An IME composition
// keeps its own Enter (keyCode 229 covers Safari, where compositionend comes before the key).
export function submitOnEnter(event: KeyboardEvent & { currentTarget: HTMLElement }) {
	if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
	event.preventDefault();
	const field = event.currentTarget;
	if (!event.shiftKey && field instanceof HTMLTextAreaElement) field.form?.requestSubmit();
}
