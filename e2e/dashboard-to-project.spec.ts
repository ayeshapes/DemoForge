import { test, expect } from "@playwright/test";

/**
 * DF-21.6: the one E2E happy-path test for this pass. Everything up to and
 * including auth is already handled by the `setup` project
 * (e2e/global.setup.ts) — the `chromium` project this spec runs under starts
 * every test already signed in via Clerk's Testing Token storage state, so
 * this test starts straight from `/dashboard`.
 *
 * Deliberately NOT exercised here (see playwright.config.ts's top comment
 * and e2e/helpers/media-stubs.ts):
 *   - Actually clicking "Start recording" / real screen capture. This test
 *     only asserts the button renders, so it doesn't need
 *     `stubGetDisplayMedia()` -- that helper is for a future test that
 *     clicks it.
 *   - The export/render pipeline (workers/render-demo.ts), which is stubbed
 *     via DEMOFORGE_STUB_RENDER for when a later test does reach it.
 */
test.describe("dashboard \u2192 create project \u2192 project page", () => {
  test("creates a project with a deployment URL and lands on its page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();

    // Unique per run so repeated local runs (which reuse a database, unlike
    // CI's fresh postgres service container) don't collide on an old
    // project of the same name -- there's no uniqueness constraint on
    // Project.name to rely on instead.
    const projectName = `E2E Demo Project ${Date.now()}`;
    const deploymentUrl = "https://example.com";

    // components/new-project.tsx's <label>s aren't associated with their
    // <input>s (no htmlFor/id, no wrapping) -- a pre-existing a11y gap, not
    // something this test should silently work around by asserting on
    // markup that isn't actually there. Locate by each input's placeholder
    // instead, which is unique per field.
    await page.getByPlaceholder("Third Umpire").fill(projectName);
    await page.getByPlaceholder("https://your-project.vercel.app").fill(deploymentUrl);
    await page.getByRole("button", { name: "Create project" }).click();

    // components/new-project.tsx navigates via `location.href` on success,
    // which is a full navigation rather than client-side routing.
    await page.waitForURL(/\/projects\/[^/]+$/);

    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(page.getByText(deploymentUrl)).toBeVisible();

    // A deploymentUrl was provided, so components/recorder.tsx should be
    // mounted (see DF-20's projectId ? <Recorder/> : <prompt> branch in
    // app/projects/[id]/page.tsx).
    await expect(page.getByRole("button", { name: "Start recording" })).toBeVisible();

    // Round-trip back through the dashboard: the new project should now be
    // listed, exercising GET /api/projects the same way DF-20 exercises POST.
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: new RegExp(projectName) })).toBeVisible();
  });
});
