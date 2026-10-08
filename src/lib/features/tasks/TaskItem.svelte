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
	import ClampedText from './ClampedText.svelte';
	import { oneLine, submitOnEnter } from './title-field';

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

	// A 44 px target on touch screens, the smaller size kept for a fine pointer.
	const TOUCH_TARGET = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11';
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
		disabled={editing}
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
				multiline
				autoGrow
				rows={1}
				id={`edit-title-${task.id}`}
				errorId={`edit-title-error-${task.id}`}
				label={m.tasks_title_label()}
				bind:value={editingTitle}
				onkeydown={submitOnEnter}
				oninput={(event: Event & { currentTarget: HTMLElement }) => {
					const field = event.currentTarget;
					if (!(field instanceof HTMLTextAreaElement)) return;
					const title = oneLine(field.value);
					if (title !== field.value) field.value = title;
					editingTitle = title;
				}}
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
			<ClampedText id={`task-description-${task.id}`} text={task.description} title={task.title} />
		</div>
	{/if}
	<div class="col-start-2 flex items-center gap-2 @md:col-start-3 @md:row-start-1">
		{#if !editing}
			<Button
				variant="link"
				{@attach registerEditButton(task.id)}
				onclick={onedit}
				aria-label={m.tasks_edit_named({ title: task.title })}
				class={TOUCH_TARGET}
			>
				{m.tasks_edit()}
			</Button>
		{/if}
		<IconButton
			label={m.tasks_delete_named({ title: task.title })}
			onclick={onremove}
			disabled={editing}
			class={[TOUCH_TARGET, 'disabled:cursor-not-allowed disabled:opacity-50']}
		/>
	</div>
</li>
