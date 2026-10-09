<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ApiVersion from '$lib/features/availability/ApiVersion.svelte';
	import AvailabilityBanner from '$lib/features/availability/AvailabilityBanner.svelte';
	import Notification from '$lib/ui/Notification.svelte';
	import { flushOnLeave } from '$lib/state/flush-on-leave';
	import { AppState, setAppState } from '$lib/state/app-state.svelte';

	let { children }: { children: Snippet } = $props();

	const app = new AppState();
	setAppState(app);
	onDestroy(() => app.availability.destroy());
	// A deletion the user could still undo is sent when the page is left: it must not be lost.
	onMount(() => flushOnLeave(() => void app.tasks.commitPending({ keepalive: true })));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<AvailabilityBanner />
{@render children()}
<ApiVersion />
<Notification />
