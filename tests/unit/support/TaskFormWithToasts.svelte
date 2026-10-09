<script lang="ts">
	import TaskForm from '$lib/features/tasks/TaskForm.svelte';
	import Notification from '$lib/ui/Notification.svelte';
	import type { User } from '$lib/api/client';

	let { user }: { user: User } = $props();
</script>

<TaskForm {user} />
<Notification />
