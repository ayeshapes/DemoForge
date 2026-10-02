# DemoForge Phase 14 — DF-21.6: Playwright E2E + CI

Picks up where PHASE13.md's "Not done in this phase" left off. That phase
added the vitest unit-test suite (`lib/*.test.ts`, `app/api/**/*.test.ts`)
but explicitly left the Playwright E2E test and its CI wiring un-started.
This phase finishes that piece — DF-21.6 on the DF-21 (test suite) ticket.

`playwright.config.ts` and `e2e/global.setup.ts` (Clerk Testing Token
sign-in) and `e2e/helpers/media-stubs.ts` already existed from an earlier
pass but had never been run end-to-end against an actual spec, a
render-worker stub, or CI. All four were still just drafts.

## What was added

- **`e2e/dashboard-to-project.spec.ts`** — the one E2E happy-path test:
  starting from an already-authenticated `/dashboard` (handled by
  `global.setup.ts`), fill in and submit the new-project form with a
  deployment URL, land on `/projects/[id]`, confirm the project's name/URL
  and that `<Recorder/>` mounted (the "Start recording" button renders),
  then navigate back to `/dashboard` and confirm the project now appears in
  the list — round-tripping through both `POST` and `GET /api/projects`.
  Locates the name/URL inputs by placeholder rather than
  `getByLabel(...)`: `components/new-project.tsx`'s `<label>`s aren't
  actually associated with their `<input>`s (no `htmlFor`/`id`, no
  wrapping), so `getByLabel` would silently fail to find them. Worth a
  follow-up a11y fix, not something this test should paper over.
  Deliberately doesn't click "Start recording" (real screen capture doesn't
  exist headless — see `media-stubs.ts`) or reach the export/render path.

- **`DEMOFORGE_STUB_RENDER` guard in `workers/render-demo.ts`** — when set
  (`playwright.config.ts`'s `webServer.env` sets it for every E2E run),
  `renderDemoVideo()` short-circuits to a fake `https://stub.demoforge.test/...`
  URL before touching Remotion/Chromium/FFmpeg or Supabase. Only ever read
  from `process.env`, never from request input, so it can't be tripped by
  an actual export request. While adding this, also changed the module-level
  `supabase` client from an eagerly-constructed constant to a lazily-built
  `getSupabaseClient()`: the old code called `createClient()` with
  `process.env.NEXT_PUBLIC_SUPABASE_URL!` at *import* time, which throws
  ("supabaseUrl is required") the moment this module is loaded if those env
  vars aren't set — which they aren't in the E2E environment, since the stub
  guard's whole point is to avoid needing them. That import happens via
  `lib/inngest/functions.ts`, which was on the same server bundle as every
  route this test hits, so the old code would have taken the entire E2E
  `npm run dev` server down on startup before the stub guard got a chance to
  run. No test today reaches the export path itself (see the spec's
  comments), but the guard is in place for when one does.

- **`package.json`** — `@playwright/test` and `@clerk/testing` added as
  devDependencies, plus `test:e2e` (`playwright test`) and `test:e2e:ui`
  (`playwright test --ui`) scripts. `npm test` (vitest) is unchanged and
  intentionally still separate — the two suites have very different
  runtime requirements (vitest: none; Playwright: a running dev server, a
  real Postgres, and a real Clerk dev instance), so folding them into one
  command would make the fast unit suite depend on the slow one's setup.

- **`.env.example`** — documents `E2E_CLERK_USER_EMAIL` (the standing test
  user on the Clerk dev instance; see `e2e/global.setup.ts`) and the
  optional `E2E_BASE_URL` override, both consumed by `playwright.config.ts`.

- **`.github/workflows/ci.yml`** — two jobs:
  - `unit`: `npm ci` → `prisma generate` → `npm test` (vitest). No database
    needed; every route test mocks `@/lib/prisma`.
  - `e2e`: a `postgres:16` service container, `prisma generate` →
    `prisma migrate deploy` against it, `playwright install --with-deps
    chromium`, then `npm run test:e2e` (which starts its own `npm run dev`
    per `playwright.config.ts`'s `webServer`). Needs three repo/org secrets
    for a dedicated Clerk **dev** instance:
    `E2E_CLERK_PUBLISHABLE_KEY`, `E2E_CLERK_SECRET_KEY`, and
    `E2E_CLERK_USER_EMAIL` for a standing test user on it. Traces/
    screenshots/videos (`playwright.config.ts`'s `retain-on-failure`
    settings) are uploaded as a build artifact on any non-cancelled run so a
    CI failure is debuggable without reproducing it locally.
  Both jobs run on every push to `main` and every pull request; a
  `concurrency` group cancels a branch's in-flight run when it's superseded
  by a newer push, since the `e2e` job (service container + browser
  download) is the expensive one to leave running needlessly.

## Not done in this phase

- Still only one E2E spec. Recording/export/edit flows remain untested at
  the E2E layer — real screen capture can't run headless at all (see
  `media-stubs.ts`), and export/EDL editing would need either a stubbed
  upload path or a fixture recording seeded directly into Postgres before a
  spec could reach them.
- The CI Clerk dev instance and its standing test user aren't created by
  this pass — someone with dashboard access still needs to create the dev
  instance, add a test user, and set the three `E2E_CLERK_*` secrets on the
  repo before the `e2e` job will pass in CI.
- DF-23 (deployment config) remains untouched, as in PHASE13.md.
