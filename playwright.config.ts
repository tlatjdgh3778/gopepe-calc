import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT || "3201";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run build && bun run start",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
