import { defineConfig, devices } from '@playwright/test';

// Each worktree serves its E2E build on its own port (`E2E_PORT`), so that two runs never meet.
const PORT = Number(process.env.E2E_PORT || 4173);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
	throw new Error(`E2E_PORT must be a whole number from 1 to 65535, got "${process.env.E2E_PORT}"`);
}

// Chromium only by default (decision of 2026-10-15); `E2E_ALL_BROWSERS=1` brings Firefox and WebKit back.
const ALL_BROWSERS = process.env.E2E_ALL_BROWSERS === '1';

// The tests of tests/e2e/backend need a running backend; the CI leaves them out.
const IGNORED = process.env.E2E_MOCKED_ONLY ? ['backend/**'] : [];

// The dark replay (THEME-R08): the files that measure colors, run again on a device that is dark, with
// no theme cookie, so that the theme is System and resolves to dark. The guard file fails when the
// page is not dark, so that a replay that fell back to light cannot pass unnoticed.
const DARK_REPLAY = [
	'accessibility',
	'single-accent',
	'focus-and-errors',
	'field-borders',
	'readable-lists',
	'icons',
	'keyboard-focus',
	'availability',
	'task-sorting',
	'theme-replay-guard'
].map((name) => `${name}.test.ts`);

const projects = [
	{
		name: 'chromium',
		use: { ...devices['Desktop Chrome'] },
		testIgnore: [...IGNORED, 'theme-replay-guard.test.ts']
	},
	{
		name: 'chromium-dark',
		use: { ...devices['Desktop Chrome'], colorScheme: 'dark' as const },
		testMatch: DARK_REPLAY.map((file) => new RegExp(`${file.replace('.', '\\.')}$`)),
		testIgnore: IGNORED
	},
	{
		name: 'firefox',
		use: { ...devices['Desktop Firefox'] },
		testIgnore: [...IGNORED, 'theme-replay-guard.test.ts']
	},
	{
		name: 'webkit',
		use: { ...devices['Desktop Safari'] },
		testIgnore: [...IGNORED, 'theme-replay-guard.test.ts']
	}
];

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: /.*\.test\.ts/,
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},

	projects: ALL_BROWSERS ? projects : projects.filter(({ name }) => name.startsWith('chromium')),

	// A production build, not `vite dev`: the dev client reloads the page when its HMR websocket
	// drops (a stalled machine is enough), which wipes the state of a running test. The port is
	// `E2E_PORT`, 4173 (the default of `vite preview`) without it; a server already there is never
	// reused (it could serve another build): the run fails instead (`reuseExistingServer: false`,
	// `--strictPort`).
	webServer: {
		command: `bun run build && bun run preview -- --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		timeout: 240_000,
		reuseExistingServer: false
	}
});
