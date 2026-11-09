import { defineConfig, devices } from "@playwright/test";

const port = 8787;
const apiPort = 8788;
const apiState = ".wrangler/api-state";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile",
      testMatch: /smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 740 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "tablet",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    {
      name: "desktop",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "api",
      testMatch: /api\.spec\.ts/,
      dependencies: ["mobile", "tablet", "desktop"],
      use: { baseURL: `http://127.0.0.1:${apiPort}` },
    },
  ],
  webServer: [
    {
      command: `npm run build && npx wrangler dev --port ${port} --ip 127.0.0.1`,
      url: `http://127.0.0.1:${port}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: `node scripts/seed-local.ts ${apiState} && npx wrangler dev --port ${apiPort} --ip 127.0.0.1 --persist-to ${apiState} --var TOKEN_SECRET:dev`,
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
