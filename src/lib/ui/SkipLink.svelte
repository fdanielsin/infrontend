<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	// SvelteKit takes over a link to an anchor and leaves the focus where it was; the landmark
	// (tabindex -1) takes it by script, so that the next Tab starts inside the page.
	function skipToContent(event: MouseEvent) {
		const main = document.getElementById('main-content');
		if (!main) return;
		event.preventDefault();
		main.focus();
		main.scrollIntoView();
	}
</script>

<!-- The first focusable element of every page (WCAG 2.4.1): hidden until it takes the focus. -->
<a
	href="#main-content"
	class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-action-strong focus:shadow-card-raised"
	onclick={skipToContent}
>
	{m.skip_to_content()}
</a>
