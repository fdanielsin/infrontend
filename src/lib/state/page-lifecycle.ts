import type { AppState } from './app-state.svelte';
import { flushOnLeave } from './flush-on-leave';

// What the application does with the deletions still waiting as the page changes: a task is sent
// as soon as the page is hidden (TASK-R18); a user waits for the return (USER-R20), his window is
// paused and goes on with the time left; whatever still waits is sent when the page is left.
export function watchPageLifecycle(app: AppState): () => void {
	return flushOnLeave({
		onHidden: () => void Promise.all([app.tasks.onHidden(), app.users.onHidden()]),
		onVisible: () => {
			app.tasks.onVisible();
			app.users.onVisible();
		},
		onLeave: () => void app.commitPending({ keepalive: true })
	});
}
