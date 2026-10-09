// What the server prints for `<Icon icon="xmark" size={16} />` (svelte/server `render`). The server
// test pins it, the hydration test hydrates over it: an Icon whose server and client markup
// differ fails one of the two.
export const XMARK_16_SERVER_MARKUP =
	'<!--[--><!--[--><svg viewBox="0 0 24 24" width="1.2em" height="1.2em" ' +
	'class="size-4 shrink-0 [&amp;_*]:[vector-effect:non-scaling-stroke]" aria-hidden="true" ' +
	'focusable="false" data-icon="xmark"><path fill="none" stroke="currentColor" stroke-linecap="round" ' +
	'stroke-linejoin="round" stroke-width="1.5" ' +
	'd="M6.758 17.243L12.001 12m5.243-5.243L12 12m0 0L6.758 6.757M12.001 12l5.243 5.243">' +
	'</path></svg><!--]--><!--]-->';
