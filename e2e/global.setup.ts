import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * One-time Playwright "setup project" (see playwright.config.ts's `setup`
 * project). Two things happen here, and they must run serially:
 *
 *   1. `clerkSetup()` fetches a Clerk Testing Token for the whole run, which
 *      is what lets every later `page.goto()` sail past Clerk's bot
 *      detection without a captcha ever rendering.
 *   2. We actually sign a real (dev-instance) test user in and save the
 *      resulting session as Playwright storage state, so every test in the
 *      `chromium` project starts already authenticated instead of driving
 *      the sign-in form by hand.
 *
 * Required env vars (see .env.example and .github/workflows/ci.yml):
 *   - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY: a Clerk *dev
 *     instance*'s API keys (never a production instance's).
 *   - E2E_CLERK_USER_EMAIL: an existing user on that dev instance. Signing
 *     in by email address (rather than password) uses the Backend API to
 *     mint a session directly, bypassing email verification/MFA entirely --
 *     see https://clerk.com/docs/guides/development/testing/playwright/test-helpers.
 */
setup.describe.configure({ mode: "serial" });

const STORAGE_STATE = path.join(__dirname, ".auth/user.json");

setup("global setup", async () => {
  await clerkSetup({
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  });
});

setup("authenticate and save state to storage", async ({ page }) => {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) {
    throw new Error(
      "E2E_CLERK_USER_EMAIL is not set -- create a test user on your Clerk dev instance and set this to its email address."
    );
  }

  // clerk.signIn() requires an unprotected page that already loads Clerk to
  // be open first; "/" is public per middleware.ts.
  await page.goto("/");

  await clerk.signIn({
    page,
    emailAddress: email,
  });

  // Confirm the session actually reaches a protected route before saving
  // state -- if Clerk keys/user are misconfigured, fail loudly here rather
  // than have every downstream test fail with a confusing sign-in redirect.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
