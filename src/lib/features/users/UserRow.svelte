<script lang="ts">
	import { tick } from 'svelte';
	import type { User } from '$lib/api/client';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import { zodIssuesToFieldErrors } from '$lib/validation/field-errors';
	import { createFieldValidation } from '$lib/validation/field-validation.svelte';
	import { UserSchema, validationMessage } from '$lib/validation/schemas';
	import { focusAndSelect, ref } from '$lib/ui/attachments';
	import Button from '$lib/ui/Button.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import TextField from '$lib/ui/TextField.svelte';

	let {
		user,
		selected,
		editing,
		editLocked,
		onselect,
		onstartedit,
		onstopedit,
		ondelete
	}: {
		user: User;
		selected: boolean;
		// This row is the one being edited.
		editing: boolean;
		// Another row is being edited: one row at a time.
		editLocked: boolean;
		onselect: () => void;
		onstartedit: () => void;
		onstopedit: () => void;
		ondelete: () => void;
	} = $props();

	const { users } = getAppState();
	let draft = $state('');
	let saving = $state(false);
	const refs: { edit?: HTMLElement; input?: HTMLElement } = {};

	// Only the name is checked here; the email of the schema is a placeholder, never sent.
	const fields = createFieldValidation<'name'>({
		fields: ['name'],
		values: () => ({ name: draft }),
		check: () => {
			const result = UserSchema.safeParse({ name: draft, email: 'a@example.com' });
			return result.success ? {} : zodIssuesToFieldErrors(result.error, ['name']);
		}
	});
	const nameError = $derived.by(() => {
		const key = fields.error('name');
		return key ? validationMessage(key) : undefined;
	});

	// A 44 px target on touch screens, the smaller size kept for a fine pointer.
	const TOUCH_TARGET = 'pointer-coarse:min-h-11 pointer-coarse:min-w-11';

	function startEditing() {
		draft = user.name;
		fields.reset();
		onstartedit();
	}

	async function stopEditing() {
		onstopedit();
		await tick();
		refs.edit?.focus();
	}

	async function save() {
		if (saving) return;
		if (fields.submit().name) {
			await tick();
			refs.input?.focus();
			return;
		}
		const name = UserSchema.shape.name.parse(draft);
		if (name === user.name) {
			void stopEditing();
			return;
		}
		saving = true;
		const outcome = await users.rename(user.id, name).finally(() => (saving = false));
		// A refusal keeps the form open with what was typed; anything else ends it.
		if (outcome !== 'failed') void stopEditing();
	}

	// An input method composition keeps its own Enter (keyCode 229 covers Safari).
	function ignoreCompositionEnter(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) {
			event.preventDefault();
		}
	}

	// Escape closes the form, and only when it is pressed inside it.
	function cancelOnEscape(event: KeyboardEvent) {
		if (event.key === 'Escape') void stopEditing();
	}
</script>

<li
	class={[
		'group relative grid grid-cols-1 items-center rounded-control @md:grid-cols-[minmax(0,1fr)_auto]',
		selected ? 'border-l-4 border-accent bg-surface-selected' : 'bg-surface-muted',
		!selected && !editing && 'hover:bg-surface-hover'
	]}
>
	{#if editing}
		<!-- Escape closes the form: the key is handled where it is pressed, inside the form. -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<form
			class="min-w-0 space-y-1 p-3"
			novalidate
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
			onkeydown={cancelOnEscape}
		>
			<TextField
				compact
				labelHidden
				id={`user-name-${user.id}`}
				errorId={`user-name-error-${user.id}`}
				label={m.users_name_label()}
				bind:value={draft}
				onkeydown={ignoreCompositionEnter}
				oninput={() => fields.input('name')}
				onblur={(event: FocusEvent) => fields.blur('name', event)}
				error={nameError}
				valid={fields.status('name') === 'valid'}
				{@attach focusAndSelect}
				{@attach ref(refs, 'input')}
			/>
			<span class="block text-sm wrap-anywhere text-muted">{user.email}</span>
			<!-- The inactive cross sits at the end of this row, under the narrow layout: room is kept for it. -->
			<div class="flex flex-wrap gap-2 pt-1 pr-12 @md:pr-0">
				<Button type="submit" size="sm" aria-busy={saving ? 'true' : undefined}>
					{m.users_save()}
				</Button>
				<Button variant="secondary" size="sm" onclick={() => void stopEditing()}>
					{m.users_cancel()}
				</Button>
			</div>
		</form>
	{:else}
		<!-- The selection is a fill, a bar and a check (not a ring, which is the focus). The bar
		     replaces 4px of padding so the text does not move. The 4px margin keeps the focus
		     ring (2px offset and 2px width, the same everywhere) inside the row and off Edit; the
		     padding (py-2 for p-3, and 4px less on the left) keeps the text and the height of the row. -->
		<button
			id={`user-select-${user.id}`}
			type="button"
			class={[
				'm-1 flex min-h-11 w-[calc(100%-0.5rem)] min-w-0 items-center gap-3 rounded-control px-3 py-2 text-left',
				selected ? 'pl-2' : 'pl-3'
			]}
			aria-pressed={selected}
			onclick={onselect}
		>
			<span class="min-w-0 flex-1">
				<span class="block font-medium wrap-anywhere">{user.name}</span>
				<span class="block text-sm wrap-anywhere text-muted">{user.email}</span>
			</span>
			<Icon icon={selected ? 'check' : 'nav-arrow-right'} class="text-muted" />
		</button>
	{/if}
	<!-- A sibling of the form, never inside it. While the row is edited and narrow, it is laid over the
	     row of Save and Cancel instead of making a band of its own under them. -->
	<div
		class={[
			'flex items-center justify-end gap-2',
			editing
				? 'absolute right-3 bottom-3 @md:static @md:px-3 @md:py-3 @md:pl-0'
				: 'px-3 pb-3 @md:py-3 @md:pl-0'
		]}
	>
		{#if !editing}
			<Button
				variant="link"
				{@attach ref(refs, 'edit')}
				onclick={startEditing}
				disabled={editLocked}
				aria-label={m.users_edit_named({ name: user.name, email: user.email })}
				class={[TOUCH_TARGET, 'group-hover:underline disabled:cursor-not-allowed']}
			>
				<Icon icon="edit-pencil" size={16} class="mr-1 inline align-text-bottom" />
				{m.users_edit()}
			</Button>
		{/if}
		<IconButton
			label={m.users_delete_named({ name: user.name, email: user.email })}
			onclick={ondelete}
			disabled={editing}
			class="disabled:cursor-not-allowed disabled:text-disabled disabled:hover:text-disabled"
		/>
	</div>
</li>
