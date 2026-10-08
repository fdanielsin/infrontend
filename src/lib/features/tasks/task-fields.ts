import { tick } from 'svelte';

export const TASK_FIELDS = ['title', 'description'] as const;

export type FieldErrors = { title?: string; description?: string };

export async function focusFirstInvalidField(
	errors: FieldErrors,
	fields: Record<'title' | 'description', HTMLElement | undefined>
) {
	await tick();
	const invalidField = TASK_FIELDS.find((field) => errors[field]);
	if (invalidField) fields[invalidField]?.focus();
}
