<script lang="ts">
	import TaskForm from '$lib/features/tasks/TaskForm.svelte';
	import Notification from '$lib/ui/Notification.svelte';
	import type { User } from '$lib/api/client';

	// A page whose selected user a test can change, like a click on another row.
	let { first, second }: { first: User; second: User } = $props();
	let selected = $state<User | null>(null);
	const current = $derived(selected ?? first);
</script>

<button type="button" onclick={() => (selected = second)}>Select the second user</button>
<TaskForm user={current} />
<Notification />
