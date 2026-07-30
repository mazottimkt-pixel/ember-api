import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const index = line.indexOf("=");
  if (index > 0)
    process.env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
}
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  expect: { timeout: 60_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
