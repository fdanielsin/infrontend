<script lang="ts">
	import { flushSync, tick, untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { ref } from '$lib/ui/attachments';
	import { focusIfInToast, focusUndoButton } from '$lib/ui/toast-focus';
	import Button from '$lib/ui/Button.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import Select from '$lib/ui/Select.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import type { User } from '$lib/api/client';
	import { TaskSchema } from '$lib/validation/schemas';
	import {
		TASK_FILTERS,
		filterTasks,
		isTaskFilter,
		matchesFilter,
		type TaskFilter
	} from './filter-tasks';
	import { isTaskOrder, sortTasks, type TaskOrder } from './sort-tasks';
	import { focusFirstInvalidField, type TaskFieldValidation } from './task-fields';
	import { revealTasks } from './reveal-tasks';
	import TaskItem from './TaskItem.svelte';

	const { tasks, taskOrder, taskFilter, locale, notifications } = getAppState();
	// The edit draft is owned by TaskForm: this list is unmounted whenever the selected user is null.
	let {
		user,
		editingTaskId = $bindable(),
		editingTitle = $bindable(),
		editingDescription = $bindable(),
		editFields
	}: {
		user: User;
		editingTaskId: number | null;
		editingTitle: string;
		editingDescription: string;
		editFields: TaskFieldValidation;
	} = $props();

	const remaining = $derived(tasks.tasks.filter((task) => !task.completed).length);
	const heading = $derived(
		tasks.tasks.length === 0
			? m.tasks_list_title()
			: remaining === 0
				? m.tasks_all_done()
				: m.tasks_progress({ remaining, total: tasks.tasks.length })
	);
	// Derived: the list of the server is never filtered or reordered in place.
	const visibleTasks = $derived(
		sortTasks(
			filterTasks(tasks.tasks, taskFilter.current, editingTaskId),
			taskOrder.current,
			locale.current
		)
	);
	const filterLabels = $derived<Record<TaskFilter, string>>({
		all: m.tasks_filter_all(),
		todo: m.tasks_filter_todo(),
		done: m.tasks_filter_done()
	});
	const filterOptions = $derived(
		TASK_FILTERS.map((value) => ({ value, label: filterLabels[value] }))
	);
	const filterOfTask = (task: { completed: boolean }): TaskFilter =>
		task.completed ? 'done' : 'todo';
	const orderOptions = $derived([
		{ value: 'created', label: m.tasks_order_created() },
		{ value: 'title', label: m.tasks_order_title() },
		{ value: 'status', label: m.tasks_order_status() }
	]);
	const positionOf = (taskId: number) => visibleTasks.findIndex((task) => task.id === taskId) + 1;

	let savingEdit = $state(false);

	const refs: Partial<
		Record<
			'tasksHeading' | 'editForm' | 'editTitleInput' | 'editDescriptionInput' | 'markAllCommand',
			HTMLElement
		>
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

	function chooseFilter(value: string) {
		if (!isTaskFilter(value) || value === taskFilter.current) return;
		taskFilter.set(value);
		const announcements: Record<TaskFilter, () => string> = {
			all: () => m.tasks_showing_all({ count: visibleTasks.length }),
			todo: () => m.tasks_showing_todo({ count: visibleTasks.length }),
			done: () => m.tasks_showing_done({ count: visibleTasks.length })
		};
		notifications.announce(announcements[value]());
	}

	// A task that appears while the filter hides it (created, or put back by Undo) is announced:
	// nothing on screen shows that it exists. A whole new list, or the first task, is not news.
	let knownIds = new Set<number>();
	$effect(() => {
		const listed = tasks.tasks;
		const added = listed.filter((task) => !knownIds.has(task.id));
		const nothingLeft = [...knownIds].every((id) => listed.some((task) => task.id === id));
		const [appeared] = added;
		if (appeared && added.length === 1 && knownIds.size > 0 && nothingLeft) {
			if (!matchesFilter(appeared, taskFilter.current)) {
				const title = appeared.title;
				const where = filterLabels[filterOfTask(appeared)];
				untrack(() => notifications.announce(m.tasks_shown_in_filter({ title, filter: where })));
			}
		}
		knownIds = new Set(listed.map((task) => task.id));
	});

	// A change that moves the row: the new position is announced (the row is gone from where the
	// user was, and moving a focused row in the DOM may drop its focus, restored by the caller).
	function announceMove(taskId: number, positionBefore: number) {
		const position = positionOf(taskId);
		if (position === 0 || position === positionBefore) return false;
		const title = tasks.tasks.find((task) => task.id === taskId)?.title ?? '';
		notifications.announce(m.tasks_moved({ title, position, count: visibleTasks.length }));
		return true;
	}

	function startEditing(task: { id: number; title: string; description: string }) {
		editingTaskId = task.id;
		editingTitle = task.title;
		editingDescription = task.description;
		editFields.reset();
	}

	function cancelEditing() {
		editingTaskId = null;
		editingTitle = '';
		editingDescription = '';
		editFields.reset();
	}

	function closeEditing(taskId: number) {
		cancelEditing();
		void focusAfterEditing(taskId);
	}

	async function handleEditTask() {
		if (editingTaskId === null || savingEdit) return;

		const errors = editFields.submit();
		if (errors.title || errors.description) {
			void focusFirstInvalidField(errors, {
				title: refs.editTitleInput,
				description: refs.editDescriptionInput
			});
			return;
		}
		const result = TaskSchema.parse({
			title: editingTitle,
			description: editingDescription,
			user_id: user.id,
			completed: false
		});

		const editedId = editingTaskId;
		const positionBefore = positionOf(editedId);
		savingEdit = true;
		const updated = await tasks.edit(editedId, result.title, result.description).finally(() => {
			savingEdit = false;
		});
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

	// Undo runs from the toast button, which is about to disappear: the row is rendered and focused
	// now, so that the toast does not move the focus elsewhere.
	function focusRestoredRow(taskId: number) {
		flushSync();
		(document.getElementById(`task-${taskId}`) ?? refs.tasksHeading)?.focus();
	}

	const focusHeading = () => refs.tasksHeading;

	async function handleRemoveTask(taskId: number) {
		tasks.remove(taskId, { onundo: focusRestoredRow, onleave: () => focusIfInToast(focusHeading) });
		await focusUndoButton(focusHeading);
	}

	// The command sends one request per task; the result is the toast with Undo (TASK-R22 to R26).
	// `marking` is true only while the tasks are being marked: Undo shows nothing on the command,
	// which is absent then, since every task is still done.
	let marking = $state(false);

	async function handleMarkAll() {
		if (marking || editingTaskId !== null) return;
		const hadFocus = document.activeElement === refs.markAllCommand;
		const userId = user.id;
		marking = true;
		try {
			await tasks.markAllDone({
				onundo: () => void focusAfterUndo(userId),
				onleave: () => focusIfInToast(focusHeading)
			});
		} finally {
			marking = false;
		}
		await tick();
		if (hadFocus && !refs.markAllCommand?.isConnected) await focusUndoButton(focusHeading);
	}

	// Undo is done: the command that came back takes the focus, unless the selected user changed.
	async function focusAfterUndo(userId: number) {
		await tick();
		if (userId === user.id && refs.markAllCommand?.isConnected) refs.markAllCommand.focus();
		else refs.tasksHeading?.focus();
	}

	// The toggle took the row out of the filter: the focus goes to the row that took its place (else
	// the list heading), and the announcement says where the task went.
	async function leaveFilter(taskId: number, neighbourId: number | undefined) {
		const task = tasks.tasks.find((listed) => listed.id === taskId);
		if (task) {
			const where = filterLabels[filterOfTask(task)];
			notifications.announce(m.tasks_moved_to_filter({ title: task.title, filter: where }));
		}
		await tick();
		const neighbour =
			neighbourId === undefined ? null : document.getElementById(`task-${neighbourId}`);
		(neighbour ?? refs.tasksHeading)?.focus();
	}

	async function handleToggleTask(checkbox: HTMLInputElement, taskId: number) {
		const nextCompleted = checkbox.checked;
		const positionBefore = positionOf(taskId);
		const rowBefore = positionBefore - 1;
		const neighbourId = (visibleTasks[rowBefore + 1] ?? visibleTasks[rowBefore - 1])?.id;
		const ok = await tasks.toggle(taskId, nextCompleted);
		if (ok) {
			if (positionOf(taskId) === 0) {
				await leaveFilter(taskId, neighbourId);
				return;
			}
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
		{heading}
	</h3>
	{#if tasks.tasks.length === 0}
		<div class="py-4 text-center">
			<Icon icon="list" size={24} class="mx-auto text-subtle" />
			<p class="mt-2 text-subtle">{m.tasks_empty()}</p>
			<p class="mt-1 text-sm text-subtle">{m.tasks_empty_hint()}</p>
		</div>
	{:else}
		<div class="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4">
			<Select
				id="task-filter"
				stacked
				icon="filter"
				label={m.tasks_filter_label()}
				value={taskFilter.current}
				options={filterOptions}
				onchange={chooseFilter}
			/>
			{#if tasks.tasks.length > 1}
				<Select
					id="task-order"
					stacked
					icon="sort"
					label={m.tasks_order_label()}
					value={taskOrder.current}
					options={orderOptions}
					onchange={chooseOrder}
				/>
			{/if}
			{#if remaining > 0}
				<Button
					variant="secondary"
					class="min-h-11 w-full sm:min-h-0 sm:w-auto"
					disabled={editingTaskId !== null}
					aria-busy={marking}
					onclick={() => void handleMarkAll()}
					{@attach ref(refs, 'markAllCommand')}
				>
					<Icon icon="check" size={20} class="mr-1 inline align-text-bottom" />
					{marking ? m.tasks_marking_all() : m.tasks_mark_all_done()}
				</Button>
			{/if}
		</div>
		{#if visibleTasks.length === 0}
			<div class="py-2">
				<p class="text-subtle">
					{taskFilter.current === 'done' ? m.tasks_empty_done() : m.tasks_empty_todo()}
				</p>
				<p class="mt-1 text-sm text-subtle">
					{taskFilter.current === 'done' ? m.tasks_empty_done_hint() : m.tasks_empty_todo_hint()}
				</p>
			</div>
		{:else}
			<ul class="@container space-y-2">
				{#each visibleTasks as task (task.id)}
					<TaskItem
						{task}
						editing={editingTaskId === task.id}
						saving={savingEdit}
						bind:editingTitle
						bind:editingDescription
						{editFields}
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
	{/if}
</div>
