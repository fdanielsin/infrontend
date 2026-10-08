<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import { m } from '$lib/paraglide/messages';
	import { isOverflowing } from './clamp';

	// `title` names the task for the toggle: several rows must not share one accessible name.
	let { id, text, title }: { id: string; text: string; title?: string } = $props();

	let expanded = $state(false);
	let overflowing = $state(false);

	// Measured once clamped, and again when the box changes (width, language). Expanded, the text
	// always "fits", so the last measure is kept and the way back stays available.
	function measure(element: HTMLElement) {
		void text;
		const update = () => {
			if (!expanded) overflowing = isOverflowing(element);
		};
		update();
		try {
			const observer = new ResizeObserver(update);
			observer.observe(element);
			return () => observer.disconnect();
		} catch {
			return;
		}
	}
</script>

<p {id} class={['text-sm text-muted', !expanded && 'line-clamp-3']} {@attach measure}>{text}</p>
{#if overflowing || expanded}
	<Button
		variant="link"
		class="pointer-coarse:min-h-11"
		aria-expanded={expanded}
		aria-controls={id}
		aria-label={title === undefined
			? undefined
			: expanded
				? m.tasks_show_less_named({ title })
				: m.tasks_show_more_named({ title })}
		onclick={() => (expanded = !expanded)}
	>
		{expanded ? m.tasks_show_less() : m.tasks_show_more()}
	</Button>
{/if}
