import type { Attachment } from 'svelte/attachments';

export function focusOnMount(element: HTMLElement) {
	element.focus();
}

// Focuses a text field and selects its text: typing replaces it, an arrow key keeps it.
export function focusAndSelect(element: HTMLElement) {
	element.focus();
	if (element instanceof HTMLInputElement) element.select();
}

// Stores the element under `key` while it is mounted. On removal the entry is
// cleared only if it still holds this element: when another element took the
// key first (edit moved to a task higher in the list), it must stay.
export function ref<K extends string>(
	refs: Partial<Record<K, HTMLElement>>,
	key: K
): Attachment<HTMLElement> {
	return (element) => {
		refs[key] = element;
		return () => {
			if (refs[key] === element) delete refs[key];
		};
	};
}
