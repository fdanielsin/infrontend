import { defineConfig, devices } from '@playwright/test';

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
		baseURL: 'http://localhost:4173',
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
	// drops (a stalled machine is enough), which wipes the state of a running test. 4173 is also the
	// default port of `vite preview`, so a server already there is never reused (it could serve
	// another build): the run fails instead (`reuseExistingServer: false`, `--strictPort`).
	webServer: {
		command: 'bun run build && bun run preview -- --port 4173 --strictPort',
		url: 'http://localhost:4173',
		timeout: 240_000,
		reuseExistingServer: false
	}
});
