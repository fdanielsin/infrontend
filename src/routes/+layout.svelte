<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ApiVersion from '$lib/features/availability/ApiVersion.svelte';
	import AvailabilityBanner from '$lib/features/availability/AvailabilityBanner.svelte';
	import type { ExplicitTheme } from '$lib/theme/theme';
	import SkipLink from '$lib/ui/SkipLink.svelte';
	import Notification from '$lib/ui/Notification.svelte';
	import { watchPageLifecycle } from '$lib/state/page-lifecycle';
	import { AppState, setAppState } from '$lib/state/app-state.svelte';

	let { children, data }: { children: Snippet; data?: { theme: ExplicitTheme | null } } = $props();

	// The theme is the server's at first render; the state never reads the cookie again.
	// svelte-ignore state_referenced_locally
	const app = new AppState(data?.theme ?? null);
	setAppState(app);
	// The root layout is never destroyed in production: this is for tests that mount it.
	onDestroy(() => app.destroy());
	// A deletion the user could still undo is sent when the page is hidden or left: it must not be lost.
	onMount(() => watchPageLifecycle(app));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<SkipLink />
<AvailabilityBanner />
{@render children()}
<ApiVersion />
<Notification />
