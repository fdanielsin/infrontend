<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { ref } from '$lib/ui/attachments';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import type { User } from '$lib/api/client';
	import { TaskSchema, validationMessage } from '$lib/validation/schemas';
	import { createFieldValidation } from '$lib/validation/field-validation.svelte';
	import { focusFirstInvalidField, taskFieldValidation } from './task-fields';
	import TaskList from './TaskList.svelte';

	const { tasks, users } = getAppState();
	let { user = null }: { user: User | null } = $props();

	let submitting = $state(false);
	let taskTitle = $state('');
	let taskDescription = $state('');
	let editingTaskId = $state<number | null>(null);
	let editingTitle = $state('');
	let editingDescription = $state('');
	// `user` is never null where the forms are rendered (the template checks it first).
	const userId = () => user?.id ?? 0;
	const addFields = createFieldValidation(
		taskFieldValidation(() => ({ title: taskTitle, description: taskDescription }), userId)
	);
	const editFields = createFieldValidation(
		taskFieldValidation(() => ({ title: editingTitle, description: editingDescription }), userId)
	);
	const errorOf = (fields: typeof addFields, field: 'title' | 'description') => {
		const key = fields.error(field);
		return key ? validationMessage(key) : undefined;
	};

	const refs: Partial<Record<'titleInput' | 'descriptionInput' | 'invitation', HTMLElement>> = {};

	// A task was added for a user found deleted: the panel went back to its invitation, and the focus
	// goes to its title (USER-R23).
	onMount(() => {
		if (user || !users.consumeGone('panel')) return;
		void tick().then(() => refs.invitation?.focus());
	});

	async function handleAddTask() {
		if (user && !submitting) {
			const errors = addFields.submit();
			if (errors.title || errors.description) {
				void focusFirstInvalidField(errors, {
					title: refs.titleInput,
					description: refs.descriptionInput
				});
				return;
			}
			const result = TaskSchema.parse({
				title: taskTitle,
				description: taskDescription,
				user_id: user.id,
				completed: false
			});
			submitting = true;
			const created = await tasks.add(result.title, result.description, user.id).finally(() => {
				submitting = false;
			});
			if (created) {
				taskTitle = '';
				taskDescription = '';
				addFields.reset();
			}
		}
	}
</script>

{#if !user}
	<Card padding="lg" class="text-center sm:py-12">
		<Icon icon="group" size={24} class="mx-auto text-subtle" />
		<h2 {@attach ref(refs, 'invitation')} tabindex="-1" class="mt-3 text-xl font-bold">
			{m.tasks_select_user()}
		</h2>
		<p class="mt-1 text-sm text-subtle">{m.tasks_select_user_hint()}</p>
	</Card>
{:else}
	<div class="space-y-6">
		<Card>
			<h2 class="mb-4 text-xl font-bold wrap-anywhere">{m.tasks_for_user({ name: user.name })}</h2>

			<form
				novalidate
				onsubmit={(e) => {
					e.preventDefault();
					void handleAddTask();
				}}
				class="mb-6 space-y-4"
			>
				<div>
					<TextField
						id="title"
						label={m.tasks_title_label()}
						bind:value={taskTitle}
						{@attach ref(refs, 'titleInput')}
						required
						error={errorOf(addFields, 'title')}
						valid={addFields.status('title') === 'valid'}
						oninput={() => addFields.input('title')}
						onblur={(event: FocusEvent) => addFields.blur('title', event)}
					/>
				</div>

				<div>
					<TextField
						id="description"
						multiline
						rows={3}
						label={m.tasks_description_label()}
						bind:value={taskDescription}
						{@attach ref(refs, 'descriptionInput')}
						error={errorOf(addFields, 'description')}
						valid={addFields.status('description') === 'valid'}
						oninput={() => addFields.input('description')}
						onblur={(event: FocusEvent) => addFields.blur('description', event)}
					/>
				</div>

				<Button type="submit" block aria-busy={submitting ? 'true' : undefined}>
					<Icon icon="plus" class="mr-1 inline align-text-bottom" />
					{submitting ? m.tasks_adding() : m.tasks_add_button()}
				</Button>
			</form>

			<TaskList {user} bind:editingTaskId bind:editingTitle bind:editingDescription {editFields} />
		</Card>
	</div>
{/if}
