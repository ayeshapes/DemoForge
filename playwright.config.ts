import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * DemoForge E2E config.
 *
 * These tests exercise the app end-to-end against `npm run dev` (not a
 * production build) with a real Postgres database behind it -- see
 * `.github/workflows/ci.yml`, which spins up a `postgres:16` service
 * container and runs `prisma migrate deploy` against it before this suite
 * runs. Auth is real Clerk auth, bypassed via `@clerk/testing`'s Testing
 * Tokens rather than a custom auth bridge (see e2e/global.setup.ts) -- see
 * DF-17's comment in lib/auth.ts for why a custom bridge is exactly what
 * this project doesn't want lying around.
 *
 * What's intentionally NOT exercised here (see e2e/*.spec.ts comments):
 *   - real screen capture (`getDisplayMedia()` doesn't work headless)
 *   - the real Remotion/FFmpeg render (`workers/render-demo.ts` is stubbed
 *     via the DEMOFORGE_STUB_RENDER env var below -- see DF-21.6)
 */

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

// Storage state written by e2e/global.setup.ts once Clerk sign-in succeeds;
// every other test/project reuses it instead of signing in per test.
const STORAGE_STATE = path.join(__dirname, "e2e/.auth/user.json");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Clerk Testing Tokens are consumed per-navigation; keep this suite serial and small.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  // `global setup` runs once, signs a real test user in via Clerk's Backend
  // API (bypassing verification/MFA -- see e2e/global.setup.ts), and saves
  // that session to STORAGE_STATE. The `chromium` project depends on it and
  // starts every test already authenticated.
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],

  // DF-21.6: DEMOFORGE_STUB_RENDER short-circuits workers/render-demo.ts to
  // a fake URL instead of touching Remotion/Chromium/FFmpeg -- see that
  // file. Harmless to set even though today's single E2E test never
  // reaches the export/render path; it keeps the server safe for E2E tests
  // added later that do.
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DEMOFORGE_STUB_RENDER: "1",
    },
  },
});
