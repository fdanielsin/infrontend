<script lang="ts">
	import { userTasks, loading, error, addTask, toggleTask, removeTask } from '$lib/stores/user';
	import type { User } from '$lib/api/client';

	let { user = null }: { user: User | null } = $props();

	let taskTitle = $state('');
	let taskDescription = $state('');

	async function handleAddTask() {
		if (user) {
			await addTask(taskTitle, taskDescription, user.id);
			taskTitle = '';
			taskDescription = '';
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
				<div class="mb-4 rounded bg-red-100 p-3 text-red-700">{$error}</div>
			{/if}

			<form on:submit|preventDefault={handleAddTask} class="mb-6 space-y-4">
				<div>
					<label for="title" class="block text-sm font-medium text-gray-700">Task Title</label>
					<input
						id="title"
						type="text"
						bind:value={taskTitle}
						required
						class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
					/>
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
					/>
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
						{#each $userTasks as task}
							<li class="flex items-start rounded bg-gray-100 p-3">
								<input
									type="checkbox"
									checked={task.completed}
									on:change={() => toggleTask(task.id, !task.completed)}
									class="mt-1 mr-3"
								/>
								<div class="flex-1">
									<p class={task.completed ? 'line-through text-gray-500' : 'font-medium'}>
										{task.title}
									</p>
									<p class="text-sm text-gray-600">{task.description}</p>
								</div>
								<button
									on:click={() => removeTask(task.id)}
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
