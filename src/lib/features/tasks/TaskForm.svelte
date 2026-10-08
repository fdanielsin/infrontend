<script lang="ts">
	import { tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { focusOnMount, ref } from '$lib/ui/attachments';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import IconButton from '$lib/ui/IconButton.svelte';
	import Select from '$lib/ui/Select.svelte';
	import TextField from '$lib/ui/TextField.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';
	import type { User } from '$lib/api/client';
	import { TaskSchema, validationMessage } from '$lib/validation/schemas';
	import { zodIssuesToFieldErrors } from '$lib/validation/field-errors';
	import { isTaskOrder, sortTasks, type TaskOrder } from './sort-tasks';

	type FieldErrors = { title?: string; description?: string };

	const { tasks, taskOrder, locale, notifications } = getAppState();
	const status = tasks.status;
	const TASK_FIELDS = ['title', 'description'] as const;
	let { user = null }: { user: User | null } = $props();

	// Derived: the list of the server is never reordered in place.
	const sortedTasks = $derived(sortTasks(tasks.tasks, taskOrder.current, locale.current));
	const orderOptions = $derived([
		{ value: 'created', label: m.tasks_order_created() },
		{ value: 'title', label: m.tasks_order_title() },
		{ value: 'status', label: m.tasks_order_status() }
	]);
	const positionOf = (taskId: number) => sortedTasks.findIndex((task) => task.id === taskId) + 1;

	let taskTitle = $state('');
	let taskDescription = $state('');
	let fieldErrors = $state.raw<FieldErrors>({});
	let editingTaskId = $state<number | null>(null);
	let editingTitle = $state('');
	let editingDescription = $state('');
	let editErrors = $state.raw<FieldErrors>({});

	const refs: Partial<
		Record<
			| 'tasksHeading'
			| 'titleInput'
			| 'descriptionInput'
			| 'editForm'
			| 'editTitleInput'
			| 'editDescriptionInput',
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

	async function focusFirstInvalidField(
		errors: FieldErrors,
		fields: Record<'title' | 'description', HTMLElement | undefined>
	) {
		await tick();
		const invalidField = TASK_FIELDS.find((field) => errors[field]);
		if (invalidField) fields[invalidField]?.focus();
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
		notifications.add(announcements[value](), 'info');
	}

	// A change that moves the row: the new position is announced (the row is gone from where the
	// user was, and moving a focused row in the DOM may drop its focus, restored by the caller).
	function announceMove(taskId: number, positionBefore: number) {
		const position = positionOf(taskId);
		if (position === 0 || position === positionBefore) return false;
		const title = tasks.tasks.find((task) => task.id === taskId)?.title ?? '';
		notifications.add(m.tasks_moved({ title, position, count: tasks.tasks.length }), 'info');
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
		if (editingTaskId === null) return;

		editErrors = {};
		const result = TaskSchema.safeParse({
			title: editingTitle,
			description: editingDescription,
			user_id: user?.id ?? 0,
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

	async function handleAddTask() {
		if (user) {
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
			const created = await tasks.add(result.data.title, result.data.description, user.id);
			if (created) {
				taskTitle = '';
				taskDescription = '';
			}
		}
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

{#if !user}
	<Card>
		<p class="text-subtle">{m.tasks_select_user()}</p>
	</Card>
{:else}
	<div class="space-y-6">
		<Card>
			<h2 class="mb-4 text-xl font-bold wrap-anywhere">{m.tasks_for_user({ name: user.name })}</h2>

			{#if status.error}
				<Alert class="mb-4">{status.error}</Alert>
			{/if}

			<form
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

				<Button variant="success" type="submit" disabled={status.loading}>
					{status.loading ? m.tasks_adding() : m.tasks_add_button()}
				</Button>
			</form>

			<div>
				<h3 {@attach ref(refs, 'tasksHeading')} tabindex="-1" class="mb-3 font-semibold">
					{m.tasks_list_heading({ count: tasks.tasks.length })}
				</h3>
				{#if tasks.tasks.length === 0}
					<p class="text-subtle">{m.tasks_empty()}</p>
				{:else}
					{#if tasks.tasks.length > 1}
						<div class="mb-3">
							<Select
								id="task-order"
								label={m.tasks_order_label()}
								value={taskOrder.current}
								options={orderOptions}
								onchange={chooseOrder}
							/>
						</div>
					{/if}
					<ul class="@container space-y-2">
						{#each sortedTasks as task (task.id)}
							<li
								class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-control bg-surface-muted p-3 @md:grid-cols-[auto_minmax(0,1fr)_auto]"
							>
								<input
									id={`task-${task.id}`}
									type="checkbox"
									checked={task.completed}
									onchange={(event) => void handleToggleTask(event.currentTarget, task.id)}
									aria-label={editingTaskId === task.id ? task.title : undefined}
									class="mt-1 h-4 w-4"
								/>
								{#if editingTaskId === task.id}
									<form
										{@attach ref(refs, 'editForm')}
										class="min-w-0 space-y-2"
										onsubmit={(e) => {
											e.preventDefault();
											void handleEditTask();
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
											error={editErrors.description
												? validationMessage(editErrors.description)
												: undefined}
										/>
										<div class="flex flex-wrap gap-2">
											<Button variant="strong" type="submit" disabled={status.loading}>
												{m.tasks_save()}
											</Button>
											<Button variant="outline" onclick={() => closeEditing(task.id)}>
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
									{#if editingTaskId !== task.id}
										<Button
											variant="link"
											{@attach registerEditButton(task.id)}
											onclick={() => startEditing(task)}
											aria-label={m.tasks_edit_named({ title: task.title })}
										>
											{m.tasks_edit()}
										</Button>
									{/if}
									<IconButton
										label={m.tasks_delete_named({ title: task.title })}
										onclick={() => void handleRemoveTask(task.id)}
									/>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</Card>
	</div>
{/if}
