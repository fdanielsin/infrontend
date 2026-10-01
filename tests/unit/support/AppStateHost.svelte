<script lang="ts" generics="Props extends Record<string, unknown>">
	import type { Component } from 'svelte';
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
</script>

<Tested {...props} />
