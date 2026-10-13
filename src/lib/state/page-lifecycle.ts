import type { AppState } from './app-state.svelte';
import { flushOnLeave } from './flush-on-leave';

// What the application does with the deletions still waiting as the page changes: a task is sent
// as soon as the page is hidden (TASK-R18), what waits for the return is paused and goes on when
// the page is back; whatever still waits is sent when the page is left.
export function watchPageLifecycle(app: AppState): () => void {
	return flushOnLeave({
		onHidden: () => void app.tasks.onHidden(),
		onVisible: () => app.tasks.onVisible(),
		onLeave: () => void app.tasks.commitPending({ keepalive: true })
	});
}
