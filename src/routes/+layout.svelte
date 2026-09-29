<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Notification from '$lib/ui/Notification.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
<Notification />
