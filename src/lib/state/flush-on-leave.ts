// Calls `flush` when the page is hidden (tab switch, close, navigation away) and, as a safety net,
// on pagehide. Hidden comes first and while the page is still alive, so a request that needs a CORS
// preflight can complete; callers must make `flush` safe to call twice.
export function flushOnLeave(flush: () => void): () => void {
	const onVisibilityChange = () => {
		if (document.visibilityState === 'hidden') flush();
	};
	document.addEventListener('visibilitychange', onVisibilityChange);
	window.addEventListener('pagehide', flush);
	return () => {
		document.removeEventListener('visibilitychange', onVisibilityChange);
		window.removeEventListener('pagehide', flush);
	};
}
