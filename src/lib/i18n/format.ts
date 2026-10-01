import { getLocale } from '$lib/paraglide/runtime';

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
	return new Intl.NumberFormat(getLocale(), options).format(value);
}
