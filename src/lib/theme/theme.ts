// The theme of the interface (THEME-R01 to R06). The choice is a cookie, read by the server for
// the first render and written by the browser at an explicit choice only.

export type ExplicitTheme = 'light' | 'dark';
// What the selector shows: the two explicit themes, or the device setting.
export type ThemeChoice = ExplicitTheme | 'system';

const COOKIE_NAME = 'theme';
const ONE_YEAR = 60 * 60 * 24 * 365;
const ATTRIBUTES = 'Path=/; SameSite=Lax';

/**
 * The theme a `Cookie` header asks for, or null for "System". Strict on purpose: exactly one cookie
 * named `theme`, whose value is exactly `light` or `dark`. Anything else (case, spaces, encoding,
 * a second cookie of that name, a very long value) is "System", never an error.
 */
export function parseThemeCookie(header: string | null | undefined): ExplicitTheme | null {
	if (!header) return null;
	const values: string[] = [];
	for (const pair of header.split(';')) {
		const entry = pair.trimStart();
		const separator = entry.indexOf('=');
		if (separator !== -1 && entry.slice(0, separator) === COOKIE_NAME) {
			values.push(entry.slice(separator + 1));
		}
	}
	if (values.length !== 1) return null;
	if (values[0] === 'light') return 'light';
	if (values[0] === 'dark') return 'dark';
	return null;
}

/**
 * The attribute of `<html>` for a theme: one of three fixed literals, chosen after the validation,
 * never the received value. "System" has no attribute (the browser resolves it in CSS).
 */
export function themeAttribute(theme: ExplicitTheme | null): string {
	if (theme === 'light') return ' data-theme="light"';
	if (theme === 'dark') return ' data-theme="dark"';
	return '';
}

/**
 * Remembers the choice for the next visits: `light` or `dark` for a year, "System" removes the
 * cookie. A browser that ignores the write or throws only costs the memory, never the page.
 */
export function writeThemeCookie(choice: ThemeChoice, target: Document): void {
	try {
		target.cookie =
			choice === 'system'
				? `${COOKIE_NAME}=; ${ATTRIBUTES}; Max-Age=0`
				: `${COOKIE_NAME}=${choice}; ${ATTRIBUTES}; Max-Age=${ONE_YEAR}`;
	} catch {
		// Cookies refused: the choice holds for this page only.
	}
}
