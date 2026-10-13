import { tick } from 'svelte';

// The row that had the focus is gone: the focus goes to the Undo button of the newest toast, which
// pauses its timer while it stays there (WCAG 2.2.1), or to the fallback when there is none.
export async function focusUndoButton(fallback: () => HTMLElement | undefined) {
	await tick();
	const buttons = document.querySelectorAll<HTMLElement>('[data-toast-action]');
	const undo = buttons[buttons.length - 1];
	// Firefox shows no focus ring on a button focused by script after the focused control went
	// away; `focusVisible` asks for it (ignored where unsupported).
	if (undo) undo.focus({ focusVisible: true });
	else fallback()?.focus();
}

// The toast leaves with the focus on it: back to the fallback, not to <body>. A focus that went
// elsewhere in the meantime stays where it is.
export function focusIfInToast(fallback: () => HTMLElement | undefined) {
	const active = document.activeElement;
	if (!active || active === document.body || active.closest('[data-toast]')) fallback()?.focus();
}
