<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { focusOnMount, ref } from '$lib/ui/attachments';
	import Button from '$lib/ui/Button.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Task } from '$lib/api/client';
	import { validationMessage } from '$lib/validation/schemas';
	import type { FieldErrors } from './task-fields';

	type EditRefs = Partial<
		Record<'editForm' | 'editTitleInput' | 'editDescriptionInput', HTMLElement>
	>;

	let {
		task,
		editing,
		saving,
		editingTitle = $bindable(),
		editingDescription = $bindable(),
		editErrors,
		refs,
		registerEditButton,
		ontoggle,
		onedit,
		onremove,
		onsave,
		oncancel
	}: {
		task: Task;
		editing: boolean;
		saving: boolean;
		editingTitle: string;
		editingDescription: string;
		editErrors: FieldErrors;
		refs: EditRefs;
		registerEditButton: (taskId: number) => Attachment<HTMLElement>;
		ontoggle: (checkbox: HTMLInputElement) => void;
		onedit: () => void;
		onremove: () => void;
		onsave: () => void;
		oncancel: () => void;
	} = $props();
</script>

<li
	class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-control bg-surface-muted p-3 @md:grid-cols-[auto_minmax(0,1fr)_auto]"
>
	<input
		id={`task-${task.id}`}
		type="checkbox"
		checked={task.completed}
		onchange={(event) => ontoggle(event.currentTarget)}
		aria-label={editing ? task.title : undefined}
		class="mt-1 h-4 w-4"
	/>
	{#if editing}
		<form
			{@attach ref(refs, 'editForm')}
			class="min-w-0 space-y-2"
			onsubmit={(e) => {
				e.preventDefault();
				onsave();
			}}
		>
			<TextField
				compact
				labelHidden
				id={`edit-title-${task.id}`}
				errorId={`edit-title-error-${task.id}`}
				label={m.tasks_title_label()}
				bind:value={editingTitle}
				{@attach focusOnMount}
				{@attach ref(refs, 'editTitleInput')}
				error={editErrors.title ? validationMessage(editErrors.title) : undefined}
			/>
			<TextField
				compact
				labelHidden
				multiline
				rows={2}
				id={`edit-description-${task.id}`}
				errorId={`edit-description-error-${task.id}`}
				label={m.tasks_description_label()}
				bind:value={editingDescription}
				{@attach ref(refs, 'editDescriptionInput')}
				error={editErrors.description ? validationMessage(editErrors.description) : undefined}
			/>
			<div class="flex flex-wrap gap-2">
				<Button variant="strong" type="submit" disabled={saving}>
					{m.tasks_save()}
				</Button>
				<Button variant="outline" onclick={oncancel}>
					{m.tasks_cancel()}
				</Button>
			</div>
		</form>
	{:else}
		<div class="min-w-0 wrap-anywhere">
			<label
				for={`task-${task.id}`}
				class={['block', task.completed ? 'text-muted line-through' : 'font-medium']}
			>
				{task.title}
			</label>
			<p class="text-sm text-muted">{task.description}</p>
		</div>
	{/if}
	<div class="col-start-2 flex items-center gap-2 @md:col-start-3 @md:row-start-1">
		{#if !editing}
			<Button
				variant="link"
				{@attach registerEditButton(task.id)}
				onclick={onedit}
				aria-label={m.tasks_edit_named({ title: task.title })}
			>
				{m.tasks_edit()}
			</Button>
		{/if}
		<IconButton label={m.tasks_delete_named({ title: task.title })} onclick={onremove} />
	</div>
</li>
