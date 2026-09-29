import { writable } from 'svelte/store';

// Shared between the `users` and `tasks` features: both report their pending
// request and last error through these two stores.
export const loading = writable(false);
export const error = writable<string | null>(null);
