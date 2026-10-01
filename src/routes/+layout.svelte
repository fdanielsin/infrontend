<script lang="ts">
	import type { Snippet } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Notification from '$lib/ui/Notification.svelte';
	import { AppState, setAppState } from '$lib/state/app-state.svelte';

	let { children }: { children: Snippet } = $props();

	setAppState(new AppState());
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
<Notification />
