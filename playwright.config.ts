import { defineConfig, devices } from '@playwright/test';

const STUB_PORT = 4319;
const STUB_BASE = `http://127.0.0.1:${STUB_PORT}`;

// The provider and the counter store are both stubbed at the HTTP boundary by
// tests/fixtures/stub-server.ts (T007a), never by mocking project code. Nothing here touches a real
// provider, so the suite never consumes the 150/day ceiling (research D11).
export default defineConfig({
  testDir: './tests/e2e',
  /**
   * One worker, no parallelism, on purpose.
   *
   * The stub holds one counter for the whole suite, exactly as the real deployment holds one counter
   * for every visitor - that shared global ceiling is the design (FR-028), not an accident of the
   * fixture. Two specs running at once therefore fight over the same integer, and quota assertions
   * fail for reasons that have nothing to do with the code. `fullyParallel: false` alone is not
   * enough: it only serialises tests *within* a file, and Playwright still runs files in parallel.
   */
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `node tests/fixtures/stub-server.ts ${STUB_PORT}`,
      url: `${STUB_BASE}/control/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // Deliberately not real. Both point at the stub, which is the whole point.
        GROQ_API_KEY: 'stub-key-4f3a9c-not-real',
        GROQ_BASE_URL: `${STUB_BASE}/v1`,
        GROQ_MODEL: 'stub-model',
        DAILY_REQUEST_LIMIT: '150',
        KV_REST_API_URL: `${STUB_BASE}/kv`,
        KV_REST_API_TOKEN: 'stub-token',
      },
    },
  ],
});

export { STUB_BASE, STUB_PORT };
