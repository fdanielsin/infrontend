import type { Component } from 'svelte';
import { render } from '@testing-library/svelte';
import type { AppState } from '$lib/state/app-state.svelte';
import AppStateHost from './AppStateHost.svelte';

// Renders a component that reads the application state from its context.
export function renderWithApp<Props extends Record<string, unknown>>(
	app: AppState,
	component: Component<Props>,
	props = {} as Props
) {
	return render(AppStateHost<Props>, { props: { app, component, props } });
}
