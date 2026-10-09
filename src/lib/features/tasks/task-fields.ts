import { tick } from 'svelte';
import { TaskSchema } from '$lib/validation/schemas';
import { zodIssuesToFieldErrors } from '$lib/validation/field-errors';
import type { createFieldValidation } from '$lib/validation/field-validation.svelte';

export const TASK_FIELDS = ['title', 'description'] as const;

export type FieldErrors = { title?: string; description?: string };
export type TaskFieldValidation = ReturnType<
	typeof createFieldValidation<(typeof TASK_FIELDS)[number]>
>;

// The options of the field validation of a task form (new task or edit): one rule, the schema.
export function taskFieldValidation(
	values: () => Record<(typeof TASK_FIELDS)[number], string>,
	userId: () => number
) {
	return {
		fields: TASK_FIELDS,
		optional: ['description'] as const,
		values,
		check: () => {
			const result = TaskSchema.safeParse({ ...values(), user_id: userId(), completed: false });
			return result.success ? {} : zodIssuesToFieldErrors(result.error, TASK_FIELDS);
		}
	};
}

export async function focusFirstInvalidField(
	errors: FieldErrors,
	fields: Record<'title' | 'description', HTMLElement | undefined>
) {
	await tick();
	const invalidField = TASK_FIELDS.find((field) => errors[field]);
	if (invalidField) fields[invalidField]?.focus();
}
