import { defineConfig, devices } from '@playwright/test';

// Each worktree serves its E2E build on its own port (`E2E_PORT`), so that two runs never meet.
const PORT = Number(process.env.E2E_PORT || 4173);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
	throw new Error(`E2E_PORT must be a whole number from 1 to 65535, got "${process.env.E2E_PORT}"`);
}

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: /.*\.test\.ts/,
	// The tests of tests/e2e/backend need a running backend; the CI leaves them out.
	testIgnore: process.env.E2E_MOCKED_ONLY ? 'backend/**' : undefined,
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] }
		},
		{
			name: 'webkit',
			use: { ...devices['Desktop Safari'] }
		}
	],

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
