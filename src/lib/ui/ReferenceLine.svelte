<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	type Tone = 'inverse' | 'danger';

	interface Props {
		reference: string;
		oncopy: (reference: string) => void;
		// `inverse` is for white-on-color surfaces such as toasts.
		tone?: Tone;
		class?: string;
	}

	let { reference, oncopy, tone = 'inverse', class: className }: Props = $props();

	// Whole class names, so Tailwind finds them.
	const BUTTON_CLASSES: Record<Tone, string> = {
		inverse:
			'border-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse',
		danger: 'border-danger hover:bg-danger/10'
	};
</script>

<!-- A server reference to quote to support: selectable as a whole, breaking anywhere when long. -->
<p class={['flex min-w-0 flex-wrap items-center gap-2 text-sm', className]}>
	<span class="min-w-0 break-all select-all">{m.reference_label({ reference })}</span>
	<button
		type="button"
		class={['min-h-6 rounded-control border px-2', BUTTON_CLASSES[tone]]}
		aria-label={m.reference_copy_named({ reference })}
		onclick={() => oncopy(reference)}
	>
		{m.reference_copy()}
	</button>
</p>
