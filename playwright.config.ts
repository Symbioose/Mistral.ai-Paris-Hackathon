import { defineConfig } from "@playwright/test";
export default defineConfig({
  webServer: {
    command: "npm run dev -- --port 3017",
    url: "http://127.0.0.1:3017",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:3017",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
    trace: "retain-on-failure",
  },
  outputDir: "/tmp/yougotit-playwright-results",
});
