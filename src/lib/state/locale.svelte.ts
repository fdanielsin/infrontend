import {
	baseLocale,
	extractLocaleFromCookie,
	extractLocaleFromNavigator,
	getLocale,
	locales,
	overwriteGetLocale,
	setLocale,
	type Locale
} from '$lib/paraglide/runtime';

// The server gets the language of the request from the middleware. The browser reads the same
// sources in the same order (cookie, browser language, English) without writing anything:
// Paraglide's own `getLocale` writes the cookie on its first call, which must only follow
// an explicit choice, and throws when cookies are refused.
function detectLocale(): Locale {
	if (typeof document === 'undefined') return getLocale();
	try {
		return extractLocaleFromCookie() ?? extractLocaleFromNavigator() ?? baseLocale;
	} catch {
		return extractLocaleFromNavigator() ?? baseLocale;
	}
}

export class LocaleState {
	current = $state<Locale>(detectLocale());
	readonly available = locales;

	constructor() {
		// In the browser, every message reads `current`: switching language re-renders them
		// without a reload. The server keeps resolving the language per request.
		if (typeof document !== 'undefined') overwriteGetLocale(() => this.current);
	}

	set(locale: Locale) {
		this.current = locale;
		document.documentElement.lang = locale;
		// The cookie keeps the choice for the next visit; refused cookies only cost that.
		try {
			void Promise.resolve(setLocale(locale, { reload: false })).catch(() => {});
		} catch {
			// Synchronous refusal (cookies disabled).
		}
	}
}
