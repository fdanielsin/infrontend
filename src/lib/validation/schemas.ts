// src/lib/validation/schemas.ts
import { z } from 'zod';

export const UserSchema = z.object({
	name: z.string().min(2, 'Name must be at least 2 characters'),
	email: z.string().email('Invalid email address')
});

export const TaskSchema = z.object({
	title: z.string().min(1, 'Title is required'),
	description: z.string().min(3, 'Description must be at least 3 characters'),
	user_id: z.number().positive('User ID must be positive'),
	completed: z.boolean().optional().default(false)
});

export type UserFormData = z.infer<typeof UserSchema>;
export type TaskFormData = z.infer<typeof TaskSchema>;
