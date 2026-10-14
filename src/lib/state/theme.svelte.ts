import { writeThemeCookie, type ExplicitTheme, type ThemeChoice } from '$lib/theme/theme';

// The theme choice. It starts on what the server rendered (the cookie) and writes nothing then:
// only an explicit choice changes <html> and the cookie, so hydration never mutates the theme.
export class ThemeState {
	current = $state<ThemeChoice>('system');

	constructor(rendered: ExplicitTheme | null = null) {
		this.current = rendered ?? 'system';
	}

	set(choice: ThemeChoice) {
		this.current = choice;
		const root = document.documentElement;
		if (choice === 'system') root.removeAttribute('data-theme');
		else root.setAttribute('data-theme', choice);
		writeThemeCookie(choice, document);
	}
}
