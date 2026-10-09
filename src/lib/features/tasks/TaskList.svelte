<script lang="ts">
	import { tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { ref } from '$lib/ui/attachments';
	import Select from '$lib/ui/Select.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import type { User } from '$lib/api/client';
	import { TaskSchema } from '$lib/validation/schemas';
	import { zodIssuesToFieldErrors } from '$lib/validation/field-errors';
	import { isTaskOrder, sortTasks, type TaskOrder } from './sort-tasks';
	import { focusFirstInvalidField, TASK_FIELDS, type FieldErrors } from './task-fields';
	import { revealTasks } from './reveal-tasks';
	import TaskItem from './TaskItem.svelte';

	const { tasks, taskOrder, locale, notifications } = getAppState();
	const status = tasks.status;
	// The edit draft is owned by TaskForm: this list is unmounted whenever the selected user is null.
	let {
		user,
		editingTaskId = $bindable(),
		editingTitle = $bindable(),
		editingDescription = $bindable(),
		editErrors = $bindable()
	}: {
		user: User;
		editingTaskId: number | null;
		editingTitle: string;
		editingDescription: string;
		editErrors: FieldErrors;
	} = $props();

	// Derived: the list of the server is never reordered in place.
	const sortedTasks = $derived(sortTasks(tasks.tasks, taskOrder.current, locale.current));
	const orderOptions = $derived([
		{ value: 'created', label: m.tasks_order_created() },
		{ value: 'title', label: m.tasks_order_title() },
		{ value: 'status', label: m.tasks_order_status() }
	]);
	const positionOf = (taskId: number) => sortedTasks.findIndex((task) => task.id === taskId) + 1;

	const refs: Partial<
		Record<'tasksHeading' | 'editForm' | 'editTitleInput' | 'editDescriptionInput', HTMLElement>
	> = {};
	const editButtons: Record<number, HTMLElement | undefined> = {};

	function registerEditButton(taskId: number): Attachment<HTMLElement> {
		return (button) => {
			editButtons[taskId] = button;
			return () => {
				if (editButtons[taskId] === button) delete editButtons[taskId];
			};
		};
	}

	// After the edit form closes, focus goes back to the task's Edit button, or
	// to the list heading when the task is gone.
	async function focusAfterEditing(taskId: number) {
		await tick();
		(editButtons[taskId] ?? refs.tasksHeading)?.focus();
	}

	function chooseOrder(value: string) {
		if (!isTaskOrder(value) || value === taskOrder.current) return;
		taskOrder.set(value);
		const announcements: Record<TaskOrder, () => string> = {
			created: m.tasks_sorted_created,
			title: m.tasks_sorted_title,
			status: m.tasks_sorted_status
		};
		notifications.announce(announcements[value]());
	}

	// A change that moves the row: the new position is announced (the row is gone from where the
	// user was, and moving a focused row in the DOM may drop its focus, restored by the caller).
	function announceMove(taskId: number, positionBefore: number) {
		const position = positionOf(taskId);
		if (position === 0 || position === positionBefore) return false;
		const title = tasks.tasks.find((task) => task.id === taskId)?.title ?? '';
		notifications.announce(m.tasks_moved({ title, position, count: tasks.tasks.length }));
		return true;
	}

	function startEditing(task: { id: number; title: string; description: string }) {
		editingTaskId = task.id;
		editingTitle = task.title;
		editingDescription = task.description;
		editErrors = {};
	}

	function cancelEditing() {
		editingTaskId = null;
		editingTitle = '';
		editingDescription = '';
		editErrors = {};
	}

	function closeEditing(taskId: number) {
		cancelEditing();
		void focusAfterEditing(taskId);
	}

	async function handleEditTask() {
		if (editingTaskId === null || status.loading) return;

		editErrors = {};
		const result = TaskSchema.safeParse({
			title: editingTitle,
			description: editingDescription,
			user_id: user.id,
			completed: false
		});
		if (!result.success) {
			editErrors = zodIssuesToFieldErrors(result.error, TASK_FIELDS);
			void focusFirstInvalidField(editErrors, {
				title: refs.editTitleInput,
				description: refs.editDescriptionInput
			});
			return;
		}

		const editedId = editingTaskId;
		const positionBefore = positionOf(editedId);
		const updated = await tasks.edit(editedId, result.data.title, result.data.description);
		const stillListed = tasks.tasks.some((task) => task.id === editedId);
		if (updated || !stillListed) closeEditing(editedId);
		if (updated) announceMove(editedId, positionBefore);
	}

	function cancelEditingOnEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape' || editingTaskId === null) return;
		if (refs.editForm?.contains(event.target as Node)) closeEditing(editingTaskId);
	}

	// A task row leaves the list (deleted, or gone on the server) with focus inside it.
	async function focusHeadingIfRowRemoved(taskId: number) {
		if (tasks.tasks.some((task) => task.id === taskId)) return;
		await tick();
		refs.tasksHeading?.focus();
	}

	async function handleRemoveTask(taskId: number) {
		await tasks.remove(taskId);
		await focusHeadingIfRowRemoved(taskId);
	}

	async function handleToggleTask(checkbox: HTMLInputElement, taskId: number) {
		const nextCompleted = checkbox.checked;
		const positionBefore = positionOf(taskId);
		const ok = await tasks.toggle(taskId, nextCompleted);
		if (ok) {
			if (announceMove(taskId, positionBefore)) {
				await tick();
				document.getElementById(`task-${taskId}`)?.focus();
			}
			return;
		}
		// Revert the native click if the update failed (see toggleTask).
		checkbox.checked = !nextCompleted;
		await focusHeadingIfRowRemoved(taskId);
	}
</script>

<svelte:window onkeydown={cancelEditingOnEscape} />

<div>
	<h3
		{@attach ref(refs, 'tasksHeading')}
		{@attach revealTasks}
		tabindex="-1"
		class="mb-3 font-semibold"
	>
		{m.tasks_list_heading({ count: tasks.tasks.length })}
	</h3>
	{#if tasks.tasks.length === 0}
		<p class="text-subtle">{m.tasks_empty()}</p>
		<p class="mt-1 text-sm text-subtle">{m.tasks_empty_hint()}</p>
	{:else}
		{#if tasks.tasks.length > 1}
			<div class="mb-3">
				<Select
					id="task-order"
					icon="sort"
					label={m.tasks_order_label()}
					value={taskOrder.current}
					options={orderOptions}
					onchange={chooseOrder}
				/>
			</div>
		{/if}
		<ul class="@container space-y-2">
			{#each sortedTasks as task (task.id)}
				<TaskItem
					{task}
					editing={editingTaskId === task.id}
					saving={status.loading}
					bind:editingTitle
					bind:editingDescription
					{editErrors}
					{refs}
					{registerEditButton}
					ontoggle={(checkbox: HTMLInputElement) => void handleToggleTask(checkbox, task.id)}
					onedit={() => startEditing(task)}
					onremove={() => void handleRemoveTask(task.id)}
					onsave={() => void handleEditTask()}
					oncancel={() => closeEditing(task.id)}
				/>
			{/each}
		</ul>
	{/if}
</div>
