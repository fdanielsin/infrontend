<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api/client';
	import { m } from '$lib/paraglide/messages';
	import { getAppState } from '$lib/state/app-state.svelte';

	const { availability } = getAppState();

	let version = $state<string | null>(null);

	// Informative only: a failure shows nothing, and never blocks or reports an error.
	async function load() {
		const result = await api.health();
		if (result.success) version = result.data.version;
	}

	// Not asked while the service is down: the recovery asks again.
	onMount(() => availability.runWhenAvailable(load));
</script>

<!-- The room of one line is reserved: the version arriving must not move the page. -->
<footer class="flex min-h-12 items-center justify-center px-4 py-2 text-sm text-muted">
	{#if version}
		<p class="min-w-0 break-all">{m.api_version({ version })}</p>
	{/if}
</footer>
