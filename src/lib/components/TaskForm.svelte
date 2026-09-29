<script lang="ts">
	import {
		userTasks,
		loading,
		error,
		addTask,
		editTask,
		toggleTask,
		removeTask
	} from '$lib/stores/user';
	import type { User } from '$lib/api/client';
	import { TaskSchema } from '$lib/validation/schemas';

	let { user = null }: { user: User | null } = $props();

	let taskTitle = $state('');
	let taskDescription = $state('');
	let fieldErrors = $state<{ title?: string; description?: string }>({});
	let editingTaskId = $state<number | null>(null);
	let editingTitle = $state('');
	let editingDescription = $state('');
	let editErrors = $state<{ title?: string; description?: string }>({});

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
			for (const issue of result.error.issues) {
				const field = issue.path[0];
				if (field === 'title' || field === 'description') editErrors[field] = issue.message;
			}
			return;
		}

		const updated = await editTask(editingTaskId, result.data.title, result.data.description);
		if (updated) cancelEditing();
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
				for (const issue of result.error.issues) {
					const field = issue.path[0];
					if (field === 'title' || field === 'description') fieldErrors[field] = issue.message;
				}
				return;
			}
			const created = await addTask(result.data.title, result.data.description, user.id);
			if (created) {
				taskTitle = '';
				taskDescription = '';
			}
		}
	}
</script>

{#if !user}
	<div class="rounded-lg border border-gray-300 bg-white p-6 shadow">
		<p class="text-gray-500">Select a user to manage tasks</p>
	</div>
{:else}
	<div class="space-y-6">
		<div class="rounded-lg border border-gray-300 bg-white p-6 shadow">
			<h2 class="mb-4 text-xl font-bold">Tasks for {user.name}</h2>

			{#if $error}
				<div class="mb-4 rounded bg-red-100 p-3 text-red-700" role="alert">{$error}</div>
			{/if}

			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleAddTask();
				}}
				class="mb-6 space-y-4"
			>
				<div>
					<label for="title" class="block text-sm font-medium text-gray-700">Task Title</label>
					<input
						id="title"
						type="text"
						bind:value={taskTitle}
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
					disabled={$loading}
					class="w-full rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:bg-gray-400"
				>
					{$loading ? 'Adding...' : 'Add Task'}
				</button>
			</form>

			<div>
				<h3 class="mb-3 font-semibold">Tasks ({$userTasks.length})</h3>
				{#if $userTasks.length === 0}
					<p class="text-gray-500">No tasks yet</p>
				{:else}
					<ul class="space-y-2">
						{#each $userTasks as task (task.id)}
							<li class="flex items-start rounded bg-gray-100 p-3">
								<input
									id={`task-${task.id}`}
									type="checkbox"
									checked={task.completed}
									onchange={(event: Event & { currentTarget: HTMLInputElement }) => {
										const checkbox = event.currentTarget;
										const nextCompleted = checkbox.checked;
										toggleTask(task.id, nextCompleted).then((ok) => {
											// The browser already flipped the checkbox natively on
											// click. If the update failed, Svelte won't undo that on
											// its own (see toggleTask's comment), so revert the DOM
											// element we already hold directly.
											if (!ok) checkbox.checked = !nextCompleted;
										});
									}}
									aria-label={`Mark ${task.title} as ${task.completed ? 'incomplete' : 'complete'}`}
									class="mt-1 mr-3"
								/>
								{#if editingTaskId === task.id}
									<form
										class="flex-1 space-y-2"
										onsubmit={(e) => {
											e.preventDefault();
											handleEditTask();
										}}
									>
										<label class="sr-only" for={`edit-title-${task.id}`}>Task Title</label>
										<input
											id={`edit-title-${task.id}`}
											type="text"
											bind:value={editingTitle}
											aria-invalid={!!editErrors.title}
											class="w-full rounded border border-gray-300 px-2 py-1"
										/>
										{#if editErrors.title}<p class="text-sm text-red-600">
												{editErrors.title}
											</p>{/if}
										<label class="sr-only" for={`edit-description-${task.id}`}>Description</label>
										<textarea
											id={`edit-description-${task.id}`}
											bind:value={editingDescription}
											aria-invalid={!!editErrors.description}
											class="w-full rounded border border-gray-300 px-2 py-1"
											rows="2"></textarea>
										{#if editErrors.description}<p class="text-sm text-red-600">
												{editErrors.description}
											</p>{/if}
										<div class="flex gap-2">
											<button
												type="submit"
												disabled={$loading}
												class="rounded bg-blue-600 px-2 py-1 text-sm text-white"
											>
												Save
											</button>
											<button
												type="button"
												onclick={cancelEditing}
												class="rounded border px-2 py-1 text-sm"
											>
												Cancel
											</button>
										</div>
									</form>
								{:else}
									<div class="flex-1">
										<p class={task.completed ? 'text-gray-500 line-through' : 'font-medium'}>
											{task.title}
										</p>
										<p class="text-sm text-gray-600">{task.description}</p>
									</div>
									<button
										type="button"
										onclick={() => startEditing(task)}
										aria-label={`Edit ${task.title}`}
										class="ml-2 text-blue-600 hover:text-blue-800"
									>
										Edit
									</button>
								{/if}
								<button
									type="button"
									onclick={() => removeTask(task.id)}
									aria-label={`Delete ${task.title}`}
									class="ml-2 text-red-600 hover:text-red-800"
								>
									×
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</div>
{/if}
