<script lang="ts">
	import { tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { focusOnMount, ref } from '$lib/ui/attachments';
	import { getAppState } from '$lib/state/app-state.svelte';
	import type { User } from '$lib/api/client';
	import { TaskSchema } from '$lib/validation/schemas';
	import { zodIssuesToFieldErrors } from '$lib/validation/field-errors';

	type FieldErrors = { title?: string; description?: string };

	const { tasks } = getAppState();
	const status = tasks.status;
	const TASK_FIELDS = ['title', 'description'] as const;
	let { user = null }: { user: User | null } = $props();

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
		const updated = await tasks.edit(editedId, result.data.title, result.data.description);
		const stillListed = tasks.tasks.some((task) => task.id === editedId);
		if (updated || !stillListed) closeEditing(editedId);
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
		const ok = await tasks.toggle(taskId, nextCompleted);
		if (ok) return;
		// Revert the native click if the update failed (see toggleTask).
		checkbox.checked = !nextCompleted;
		await focusHeadingIfRowRemoved(taskId);
	}
</script>

<svelte:window onkeydown={cancelEditingOnEscape} />

{#if !user}
	<div class="rounded-lg border border-gray-300 bg-white p-6 shadow">
		<p class="text-gray-500">Select a user to manage tasks</p>
	</div>
{:else}
	<div class="space-y-6">
		<div class="rounded-lg border border-gray-300 bg-white p-6 shadow">
			<h2 class="mb-4 text-xl font-bold">Tasks for {user.name}</h2>

			{#if status.error}
				<div class="mb-4 rounded bg-red-100 p-3 text-red-700">{status.error}</div>
			{/if}

			<form
				onsubmit={(e) => {
					e.preventDefault();
					void handleAddTask();
				}}
				class="mb-6 space-y-4"
			>
				<div>
					<label for="title" class="block text-sm font-medium text-gray-700">Task Title</label>
					<input
						id="title"
						type="text"
						bind:value={taskTitle}
						{@attach ref(refs, 'titleInput')}
						required
						aria-invalid={!!fieldErrors.title}
						aria-describedby={fieldErrors.title ? 'title-error' : undefined}
						class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
					/>
					{#if fieldErrors.title}<p id="title-error" class="mt-1 text-sm text-red-600">
							{fieldErrors.title}
						</p>{/if}
				</div>

				<div>
					<label for="description" class="block text-sm font-medium text-gray-700">
						Description
					</label>
					<textarea
						id="description"
						bind:value={taskDescription}
						{@attach ref(refs, 'descriptionInput')}
						class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
						rows="3"
						aria-invalid={!!fieldErrors.description}
						aria-describedby={fieldErrors.description ? 'description-error' : undefined}></textarea>
					{#if fieldErrors.description}<p id="description-error" class="mt-1 text-sm text-red-600">
							{fieldErrors.description}
						</p>{/if}
				</div>

				<button
					type="submit"
					disabled={status.loading}
					class="w-full rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800 disabled:bg-gray-400"
				>
					{status.loading ? 'Adding...' : 'Add Task'}
				</button>
			</form>

			<div>
				<h3 {@attach ref(refs, 'tasksHeading')} tabindex="-1" class="mb-3 font-semibold">
					Tasks ({tasks.tasks.length})
				</h3>
				{#if tasks.tasks.length === 0}
					<p class="text-gray-500">No tasks yet</p>
				{:else}
					<ul class="space-y-2">
						{#each tasks.tasks as task (task.id)}
							<li class="flex items-start rounded bg-gray-100 p-3">
								<input
									id={`task-${task.id}`}
									type="checkbox"
									checked={task.completed}
									onchange={(event) => void handleToggleTask(event.currentTarget, task.id)}
									aria-label={editingTaskId === task.id ? task.title : undefined}
									class="mt-1 mr-3 h-4 w-4"
								/>
								{#if editingTaskId === task.id}
									<form
										{@attach ref(refs, 'editForm')}
										class="flex-1 space-y-2"
										onsubmit={(e) => {
											e.preventDefault();
											void handleEditTask();
										}}
									>
										<label class="sr-only" for={`edit-title-${task.id}`}>Task Title</label>
										<input
											id={`edit-title-${task.id}`}
											type="text"
											bind:value={editingTitle}
											{@attach focusOnMount}
											{@attach ref(refs, 'editTitleInput')}
											aria-invalid={!!editErrors.title}
											aria-describedby={editErrors.title
												? `edit-title-error-${task.id}`
												: undefined}
											class="w-full rounded border border-gray-300 px-2 py-1"
										/>
										{#if editErrors.title}<p
												id={`edit-title-error-${task.id}`}
												class="text-sm text-red-700"
											>
												{editErrors.title}
											</p>{/if}
										<label class="sr-only" for={`edit-description-${task.id}`}>Description</label>
										<textarea
											id={`edit-description-${task.id}`}
											bind:value={editingDescription}
											{@attach ref(refs, 'editDescriptionInput')}
											aria-invalid={!!editErrors.description}
											aria-describedby={editErrors.description
												? `edit-description-error-${task.id}`
												: undefined}
											class="w-full rounded border border-gray-300 px-2 py-1"
											rows="2"></textarea>
										{#if editErrors.description}<p
												id={`edit-description-error-${task.id}`}
												class="text-sm text-red-700"
											>
												{editErrors.description}
											</p>{/if}
										<div class="flex gap-2">
											<button
												type="submit"
												disabled={status.loading}
												class="min-h-6 rounded bg-blue-700 px-2 py-1 text-sm text-white"
											>
												Save
											</button>
											<button
												type="button"
												onclick={() => closeEditing(task.id)}
												class="min-h-6 rounded border px-2 py-1 text-sm"
											>
												Cancel
											</button>
										</div>
									</form>
								{:else}
									<div class="flex-1">
										<label
											for={`task-${task.id}`}
											class={[
												'block',
												task.completed ? 'text-gray-600 line-through' : 'font-medium'
											]}
										>
											{task.title}
										</label>
										<p class="text-sm text-gray-600">{task.description}</p>
									</div>
									<button
										type="button"
										{@attach registerEditButton(task.id)}
										onclick={() => startEditing(task)}
										aria-label={`Edit ${task.title}`}
										class="ml-2 min-h-6 rounded px-1 text-blue-700 hover:text-blue-900"
									>
										Edit
									</button>
								{/if}
								<button
									type="button"
									onclick={() => void handleRemoveTask(task.id)}
									aria-label={`Delete ${task.title}`}
									class="ml-2 inline-flex min-h-6 min-w-6 items-center justify-center rounded text-red-700 hover:text-red-900"
								>
									<svg
										aria-hidden="true"
										viewBox="0 0 20 20"
										class="h-4 w-4"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path d="M5 5l10 10M15 5L5 15" />
									</svg>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</div>
{/if}
