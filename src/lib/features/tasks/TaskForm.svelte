<script lang="ts">
	import { ref } from '$lib/ui/attachments';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import type { User } from '$lib/api/client';
	import { TaskSchema, validationMessage } from '$lib/validation/schemas';
	import { zodIssuesToFieldErrors } from '$lib/validation/field-errors';
	import { focusFirstInvalidField, TASK_FIELDS, type FieldErrors } from './task-fields';
	import TaskList from './TaskList.svelte';

	const { tasks } = getAppState();
	let { user = null }: { user: User | null } = $props();

	let submitting = $state(false);
	let taskTitle = $state('');
	let taskDescription = $state('');
	let fieldErrors = $state.raw<FieldErrors>({});
	let editingTaskId = $state<number | null>(null);
	let editingTitle = $state('');
	let editingDescription = $state('');
	let editErrors = $state.raw<FieldErrors>({});

	const refs: Partial<Record<'titleInput' | 'descriptionInput', HTMLElement>> = {};

	async function handleAddTask() {
		if (user && !submitting) {
			fieldErrors = {};
			const result = TaskSchema.safeParse({
				title: taskTitle,
				description: taskDescription,
				user_id: user.id,
				completed: false
			});
			if (!result.success) {
				fieldErrors = zodIssuesToFieldErrors(result.error, TASK_FIELDS);
				void focusFirstInvalidField(fieldErrors, {
					title: refs.titleInput,
					description: refs.descriptionInput
				});
				return;
			}
			submitting = true;
			const created = await tasks
				.add(result.data.title, result.data.description, user.id)
				.finally(() => {
					submitting = false;
				});
			if (created) {
				taskTitle = '';
				taskDescription = '';
			}
		}
	}
</script>

{#if !user}
	<Card>
		<p class="text-subtle">{m.tasks_select_user()}</p>
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
						error={fieldErrors.title ? validationMessage(fieldErrors.title) : undefined}
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
						error={fieldErrors.description ? validationMessage(fieldErrors.description) : undefined}
					/>
				</div>

				<Button type="submit" block aria-busy={submitting ? 'true' : undefined}>
					<Icon icon="plus" class="mr-1 inline align-text-bottom" />
					{submitting ? m.tasks_adding() : m.tasks_add_button()}
				</Button>
			</form>

			<TaskList
				{user}
				bind:editingTaskId
				bind:editingTitle
				bind:editingDescription
				bind:editErrors
			/>
		</Card>
	</div>
{/if}
