<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import Icon from '$lib/ui/Icon.svelte';
	import Button from '$lib/ui/Button.svelte';

	type Tone = 'inverse' | 'danger';

	interface Props {
		reference: string;
		oncopy: (reference: string) => void;
		// `inverse` is for white-on-color surfaces such as toasts.
		tone?: Tone;
		class?: string;
	}

	let { reference, oncopy, tone = 'inverse', class: className }: Props = $props();
</script>

<!-- A server reference to quote to support: selectable as a whole, breaking anywhere when long. -->
<p class={['flex min-w-0 flex-wrap items-center gap-2 text-sm', className]}>
	<span class="min-w-0 break-all select-all">{m.reference_label({ reference })}</span>
	<Button
		variant="secondary"
		size="sm"
		{tone}
		aria-label={m.reference_copy_named({ reference })}
		onclick={() => oncopy(reference)}
	>
		<Icon icon="copy" size={16} class="mr-1 inline align-text-bottom" />
		{m.reference_copy()}
	</Button>
</p>
