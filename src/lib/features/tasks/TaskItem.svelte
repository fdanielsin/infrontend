<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { focusOnMount, ref } from '$lib/ui/attachments';
	import Button from '$lib/ui/Button.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Task } from '$lib/api/client';
	import { validationMessage } from '$lib/validation/schemas';
	import type { TaskFieldValidation } from './task-fields';
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
		editFields,
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
		editFields: TaskFieldValidation;
		refs: EditRefs;
		registerEditButton: (taskId: number) => Attachment<HTMLElement>;
		ontoggle: (checkbox: HTMLInputElement) => void;
		onedit: () => void;
		onremove: () => void;
		onsave: () => void;
		oncancel: () => void;
	} = $props();

	const errorOf = (field: 'title' | 'description') => {
		const key = editFields.error(field);
		return key ? validationMessage(key) : undefined;
	};

	function tapCheckbox(event: MouseEvent & { currentTarget: HTMLElement }) {
		if (event.target instanceof HTMLInputElement) return;
		event.currentTarget.querySelector('input')?.click();
	}

	// A 44 px target on touch screens, the smaller size kept for a fine pointer.
	const TOUCH_TARGET = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11';
	// Under the pointer, the row says it can be edited: its "Edit" button, the way to do it, is underlined.
	const EDIT_HINT = 'group-hover:underline';
</script>

<li
	class="group grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-control bg-surface-muted p-3 hover:bg-surface-hover @md:grid-cols-[auto_minmax(0,1fr)_auto]"
>
	<!-- A tap on the extra touch target is forwarded to the checkbox, which keeps the keyboard
	     and the accessible name; this wrapper is not a control. -->
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<span class="relative mt-1 h-4 w-4" onclick={tapCheckbox}>
		<input
			id={`task-${task.id}`}
			type="checkbox"
			checked={task.completed}
			onchange={(event) => ontoggle(event.currentTarget)}
			aria-label={editing ? task.title : undefined}
			disabled={editing}
			class="block h-4 w-4"
		/>
		<!-- Touch screens only: a 44 px target around the 16 px box. -->
		<span
			data-touch-target
			aria-hidden="true"
			class="absolute top-1/2 left-1/2 hidden size-11 -translate-x-1/2 -translate-y-1/2 pointer-coarse:block"
		></span>
	</span>
	{#if editing}
		<form
			{@attach ref(refs, 'editForm')}
			class="min-w-0 space-y-2"
			novalidate
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
					editFields.input('title');
				}}
				{@attach focusOnMount}
				{@attach ref(refs, 'editTitleInput')}
				error={errorOf('title')}
				valid={editFields.status('title') === 'valid'}
				onblur={() => editFields.blur('title')}
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
				error={errorOf('description')}
				valid={editFields.status('description') === 'valid'}
				oninput={() => editFields.input('description')}
				onblur={() => editFields.blur('description')}
			/>
			<div class="flex flex-wrap gap-2">
				<Button type="submit" aria-busy={saving ? 'true' : undefined}>
					{m.tasks_save()}
				</Button>
				<Button variant="secondary" onclick={oncancel}>
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
				class={[TOUCH_TARGET, EDIT_HINT]}
			>
				<Icon icon="edit-pencil" size={16} class="mr-1 inline align-text-bottom" />
				{m.tasks_edit()}
			</Button>
		{/if}
		<IconButton
			label={m.tasks_delete_named({ title: task.title })}
			onclick={onremove}
			disabled={editing}
			class="disabled:cursor-not-allowed disabled:opacity-50"
		/>
	</div>
</li>
