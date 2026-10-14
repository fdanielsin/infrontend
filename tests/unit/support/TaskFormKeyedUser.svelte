<script lang="ts">
	import TaskForm from '$lib/features/tasks/TaskForm.svelte';
	import Notification from '$lib/ui/Notification.svelte';
	import type { User } from '$lib/api/client';

	// Like the page: the panel of tasks is made again for each selected user ({#key}), so the one of
	// the first user is destroyed while its requests may still be on their way.
	let { first, second }: { first: User; second: User } = $props();
	let selected = $state<User | null>(null);
	const current = $derived(selected ?? first);
</script>

<button type="button" onclick={() => (selected = second)}>Select the second user</button>
{#key current.id}
	<TaskForm user={current} />
{/key}
<Notification />
