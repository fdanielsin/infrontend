<script lang="ts" generics="Props extends Record<string, unknown>">
	import { onDestroy, type Component } from 'svelte';
	import { setAppState, type AppState } from '$lib/state/app-state.svelte';

	// Provides the state built by the test, which keeps it to arrange and inspect.
	let {
		app,
		component: Tested,
		props
	}: { app: AppState; component: Component<Props>; props: Props } = $props();

	// A context is set once, while the component initialises; the test never swaps `app`.
	// svelte-ignore state_referenced_locally
	setAppState(app);
	// A toast left by a test must not send its deletion after the test.
	onDestroy(() => app.destroy());
</script>

<Tested {...props} />
