import './zod-config';
import { z } from 'zod';
import { m } from '$lib/paraglide/messages';
import { isValidEmail } from './email';

// An issue carries the key of its message, not its text: the interface translates it when
// it renders, so an error already shown follows a change of language.
const VALIDATION_MESSAGES = {
	validation_name_required: m.validation_name_required,
	validation_email_invalid: m.validation_email_invalid,
	validation_title_required: m.validation_title_required,
	validation_user_id_positive: m.validation_user_id_positive,
	validation_name_max: m.validation_name_max,
	validation_email_max: m.validation_email_max,
	validation_title_max: m.validation_title_max,
	validation_description_max: m.validation_description_max
};

export type ValidationKey = keyof typeof VALIDATION_MESSAGES;

function isValidationKey(key: string): key is ValidationKey {
	return Object.hasOwn(VALIDATION_MESSAGES, key);
}

export function validationMessage(key: string): string {
	return isValidationKey(key) ? VALIDATION_MESSAGES[key]() : key;
}

const NAME_REQUIRED: ValidationKey = 'validation_name_required';
const EMAIL_INVALID: ValidationKey = 'validation_email_invalid';
const TITLE_REQUIRED: ValidationKey = 'validation_title_required';
const USER_ID_POSITIVE: ValidationKey = 'validation_user_id_positive';

// The server measures a text in Unicode code points (Go runes) before trimming it, so a limit
// counts the raw value that way: `.max()` would count UTF-16 units and refuse an emoji on the
// limit. When the limit fails, `.pipe` skips the next rules: only the "too long" message shows.
function boundedText(limit: number, tooLong: ValidationKey) {
	return z.string().refine((value) => [...value].length <= limit, tooLong);
}

export const UserSchema = z.object({
	name: boundedText(100, 'validation_name_max').pipe(z.string().trim().min(1, NAME_REQUIRED)),
	email: boundedText(254, 'validation_email_max').pipe(
		z.string().trim().refine(isValidEmail, EMAIL_INVALID)
	)
});

export const TaskSchema = z.object({
	title: boundedText(200, 'validation_title_max').pipe(z.string().trim().min(1, TITLE_REQUIRED)),
	description: boundedText(2000, 'validation_description_max').pipe(z.string().trim()),
	user_id: z.number().positive(USER_ID_POSITIVE),
	completed: z.boolean().optional().default(false)
});

export type UserFormData = z.infer<typeof UserSchema>;
export type TaskFormData = z.infer<typeof TaskSchema>;
