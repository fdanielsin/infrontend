import { z } from 'zod';
import { m } from '$lib/paraglide/messages';

// An issue carries the key of its message, not its text: the interface translates it when
// it renders, so an error already shown follows a change of language.
const VALIDATION_MESSAGES = {
	validation_name_min: m.validation_name_min,
	validation_email_invalid: m.validation_email_invalid,
	validation_title_required: m.validation_title_required,
	validation_user_id_positive: m.validation_user_id_positive
};

export type ValidationKey = keyof typeof VALIDATION_MESSAGES;

function isValidationKey(key: string): key is ValidationKey {
	return Object.hasOwn(VALIDATION_MESSAGES, key);
}

export function validationMessage(key: string): string {
	return isValidationKey(key) ? VALIDATION_MESSAGES[key]() : key;
}

const NAME_MIN: ValidationKey = 'validation_name_min';
const EMAIL_INVALID: ValidationKey = 'validation_email_invalid';
const TITLE_REQUIRED: ValidationKey = 'validation_title_required';
const USER_ID_POSITIVE: ValidationKey = 'validation_user_id_positive';

export const UserSchema = z.object({
	name: z.string().min(2, NAME_MIN),
	email: z.string().email(EMAIL_INVALID)
});

export const TaskSchema = z.object({
	title: z.string().min(1, TITLE_REQUIRED),
	description: z.string(),
	user_id: z.number().positive(USER_ID_POSITIVE),
	completed: z.boolean().optional().default(false)
});

export type UserFormData = z.infer<typeof UserSchema>;
export type TaskFormData = z.infer<typeof TaskSchema>;
