import { describe, expect, it, vi } from 'vitest';
import { focusFirstInvalidField, TASK_FIELDS } from '$lib/features/tasks/task-fields';

type Fields = Parameters<typeof focusFirstInvalidField>[1];

function focusable() {
	return { focus: vi.fn() } as unknown as HTMLElement & { focus: ReturnType<typeof vi.fn> };
}

describe('focusFirstInvalidField', () => {
	it('lists the title before the description (boundary)', () => {
		expect([...TASK_FIELDS]).toEqual(['title', 'description']);
	});

	it('focuses the title when only the title is invalid (happy path)', async () => {
		const title = focusable();
		const description = focusable();

		await focusFirstInvalidField({ title: 'Title is required' }, { title, description });

		expect(title.focus).toHaveBeenCalledTimes(1);
		expect(description.focus).not.toHaveBeenCalled();
	});

	it('focuses the description when only the description is invalid (happy path)', async () => {
		const title = focusable();
		const description = focusable();

		await focusFirstInvalidField({ description: 'Too long' }, { title, description });

		expect(description.focus).toHaveBeenCalledTimes(1);
		expect(title.focus).not.toHaveBeenCalled();
	});

	it('focuses the title only when both fields are invalid (boundary)', async () => {
		const title = focusable();
		const description = focusable();

		await focusFirstInvalidField(
			{ title: 'Required', description: 'Too long' },
			{ title, description }
		);

		expect(title.focus).toHaveBeenCalledTimes(1);
		expect(description.focus).not.toHaveBeenCalled();
	});

	it('looks up and focuses nothing when no field has an error (boundary)', async () => {
		// GIVEN: A record that answers for any key, and notes every key asked.
		const asked: Array<string | symbol> = [];
		const anything = focusable();
		const fields = new Proxy(
			{},
			{
				get: (_target, key) => {
					asked.push(key);
					return anything;
				}
			}
		) as Fields;

		// WHEN: There is no error, or only empty messages.
		await focusFirstInvalidField({}, fields);
		await focusFirstInvalidField({ title: '', description: '' }, fields);

		// THEN: No field is looked up, so none is focused.
		expect(asked).toEqual([]);
		expect(anything.focus).not.toHaveBeenCalled();
	});

	it('waits for the page to show the errors before moving the focus (limit)', async () => {
		const title = focusable();

		const pending = focusFirstInvalidField(
			{ title: 'Required' },
			{ title, description: focusable() }
		);

		expect(title.focus).not.toHaveBeenCalled();
		await pending;
		expect(title.focus).toHaveBeenCalledTimes(1);
	});

	it('does not throw when the invalid field is not on the page (exception)', async () => {
		const description = focusable();

		await expect(
			focusFirstInvalidField({ title: 'Required' }, { title: undefined, description })
		).resolves.toBeUndefined();

		expect(description.focus).not.toHaveBeenCalled();
	});
});
