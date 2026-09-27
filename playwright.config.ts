import { defineConfig, devices } from '@playwright/test';

const BACKEND_PORT = 4319;
const BACKEND_BASE = `http://127.0.0.1:${BACKEND_PORT}`;

// The external FastAPI backend is mocked by tests/fixtures/mock-backend.ts (T115, D15),
// serving /threads and /chat directly over HTTP with CORS.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `./node_modules/.bin/jiti tests/fixtures/mock-backend.ts ${BACKEND_PORT}`,
      url: `${BACKEND_BASE}/control/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NEXT_PUBLIC_BACKEND_URL: BACKEND_BASE,
      },
    },
  ],
});

export { BACKEND_BASE, BACKEND_PORT, BACKEND_BASE as STUB_BASE, BACKEND_PORT as STUB_PORT };
