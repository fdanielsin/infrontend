<script lang="ts">
	import UserForm from '$lib/components/UserForm.svelte';
	import TaskForm from '$lib/components/TaskForm.svelte';
	import { fetchUsers, selectedUser } from '$lib/stores/user';
	import { onMount } from 'svelte';

	onMount(() => {
		fetchUsers();
	});
</script>

<svelte:head>
	<title>inBackend - Task Management</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
	<div class="mx-auto max-w-6xl">
		<header class="mb-8 text-center">
			<h1 class="text-4xl font-bold text-gray-900">📋 Task Manager</h1>
			<p class="mt-2 text-gray-600">Manage users and their tasks</p>
		</header>

		<div class="grid gap-8 lg:grid-cols-2">
			<div>
				<UserForm />
			</div>
			<div>
				<TaskForm user={$selectedUser} />
			</div>
		</div>
	</div>
</div>
