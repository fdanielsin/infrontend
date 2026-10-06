<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ApiVersion from '$lib/features/availability/ApiVersion.svelte';
	import AvailabilityBanner from '$lib/features/availability/AvailabilityBanner.svelte';
	import Notification from '$lib/ui/Notification.svelte';
	import { AppState, setAppState } from '$lib/state/app-state.svelte';

	let { children }: { children: Snippet } = $props();

	const app = new AppState();
	setAppState(app);
	onDestroy(() => app.availability.destroy());
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<AvailabilityBanner />
{@render children()}
<ApiVersion />
<Notification />
