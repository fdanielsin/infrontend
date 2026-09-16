<script lang="ts">
	import { users, loading, error, addUser } from '$lib/stores/user';
	let name = $state('');
	let email = $state('');

	async function handleSubmit() {
		await addUser(name, email);
		name = '';
		email = '';
	}
</script>

<div class="rounded-lg border border-gray-300 bg-white p-6 shadow">
	<h2 class="mb-4 text-xl font-bold">Create User</h2>

	{#if $error}
		<div class="mb-4 rounded bg-red-100 p-3 text-red-700">{$error}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
		<div>
			<label for="name" class="block text-sm font-medium text-gray-700">Name</label>
			<input
				id="name"
				type="text"
				bind:value={name}
				required
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			/>
		</div>

		<div>
			<label for="email" class="block text-sm font-medium text-gray-700">Email</label>
			<input
				id="email"
				type="email"
				bind:value={email}
				required
				class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
			/>
		</div>

		<button
			type="submit"
			disabled={$loading}
			class="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
		>
			{$loading ? 'Creating...' : 'Create User'}
		</button>
	</form>

	<div class="mt-6">
		<h3 class="mb-3 font-semibold">Users ({$users.length})</h3>
		{#if $users.length === 0}
			<p class="text-gray-500">No users yet</p>
		{:else}
			<ul class="space-y-2">
				{#each $users as user (user.id)}
					<li class="rounded bg-gray-100 p-3">
						<p class="font-medium">{user.name}</p>
						<p class="text-sm text-gray-600">{user.email}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
