import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

/**
 * End-to-end tests run through the SWA CLI on :4280, the only place where the route rules and
 * roles from staticwebapp.config.json are enforced locally (:7071 trusts any forged principal).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4280',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    // Static, anonymous and served only once the SWA CLI is up, which itself waits for Vite and
    // the Functions host.
    url: 'http://localhost:4280/login.html',
    reuseExistingServer: !CI,
    // A first run also bundles the API and starts the Functions host.
    timeout: 180_000,
    // Like Ctrl+C in a terminal, so Azurite can flush its files; force-killed after the timeout.
    gracefulShutdown: { signal: 'SIGINT', timeout: 15_000 },
    stdout: CI ? 'pipe' : 'ignore',
  },
});
