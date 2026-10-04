// The key that moves the focus to the next control, as a keyboard user does it.
//
// Safari on macOS skips links, buttons and checkboxes with Tab unless "Keyboard Navigation" is on
// in the system settings (or "Press Tab to highlight each item on a webpage" in Safari); Option+Tab
// reaches every control by default. Playwright's WebKit follows the host: Option+Tab on macOS, plain
// Tab on Linux (measured in CI). Sources:
// https://support.apple.com/en-mk/guide/safari/cpsh003
// https://www.a11yproject.com/posts/macos-browser-keyboard-navigation/
export function nextFocusKey(browserName: string): 'Tab' | 'Alt+Tab' {
	return browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
}
