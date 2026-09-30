import type { ZodError } from 'zod';

// Keeps only the issues of the form's own fields; the last issue of a field wins.
export function zodIssuesToFieldErrors<Field extends string>(
	error: ZodError,
	fields: readonly Field[]
): Partial<Record<Field, string>> {
	const fieldErrors: Partial<Record<Field, string>> = {};
	for (const issue of error.issues) {
		const field = issue.path[0];
		if (fields.includes(field as Field)) fieldErrors[field as Field] = issue.message;
	}
	return fieldErrors;
}
