export interface LeaveHandlers {
	// The page is hidden (tab switch, locked screen, close, navigation away), still alive: a request
	// that needs a CORS preflight can complete.
	onHidden: () => void;
	// The page is visible again.
	onVisible: () => void;
	// The page is being left, for good or into the back/forward cache. Handlers must be safe to call
	// after onHidden: a deletion is sent once.
	onLeave: () => void;
}

// Routes the lifecycle of the page to the handlers, and returns the cleanup.
export function flushOnLeave({ onHidden, onVisible, onLeave }: LeaveHandlers): () => void {
	const onVisibilityChange = () => {
		if (document.visibilityState === 'hidden') onHidden();
		else onVisible();
	};
	document.addEventListener('visibilitychange', onVisibilityChange);
	window.addEventListener('pagehide', onLeave);
	return () => {
		document.removeEventListener('visibilitychange', onVisibilityChange);
		window.removeEventListener('pagehide', onLeave);
	};
}
