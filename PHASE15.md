# DemoForge Phase 15 — Startup env-var validation

## What was added

- **`lib/env.ts`** — a `zod` schema (`envSchema`) covering every env var the
  running server process reads across `app/`, `lib/`, and `workers/`, split
  into required and optional:
  - **Required**: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
    `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
    `CLERK_SECRET_KEY`.
  - **Optional** (already no-op/degrade gracefully in the code that reads
    them): `GITHUB_TOKEN`, `POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_KEY`,
    `REMOTION_SERVE_URL`.
  `validateEnv()` parses `process.env` against it and throws one `Error`
  listing *every* missing/invalid var at once (not just the first) if
  anything doesn't check out. An empty string is treated the same as unset
  for every var — required or optional — rather than as "present but
  weird," since `.env.example`'s placeholders are empty strings, not
  missing lines, and `cp .env.example .env` without filling them in is
  exactly the misconfiguration this exists to catch.
- **`lib/prisma.ts`** calls `validateEnv()` once, at the top of the module,
  before constructing the `PrismaClient`. `lib/prisma.ts` is already
  imported by every route handler and every server component in the app
  before any of them do real work, which makes it the same universal
  choke point a dedicated `instrumentation.ts` would give — without
  needing one. (A real `instrumentation.ts` needs
  `experimental.instrumentationHook: true` in `next.config.js` on this
  Next 14.2 version — it's on by default only from Next 15 — and this
  project has no `next.config.js` today; adding one just for this felt
  like more moving parts than the problem needed.)
- **`lib/env.test.ts`** — unit tests: valid env passes; each required var
  missing (undefined) or blank (`""`) throws naming that var; multiple
  missing vars are all named in one thrown message; a malformed
  `NEXT_PUBLIC_SUPABASE_URL`/`REMOTION_SERVE_URL` is rejected; the three
  optional vars are never required and a blank optional var is treated as
  unset rather than invalid.

## A behavior change worth flagging

`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` were, until this
phase, an intentionally optional placeholder — `app/api/recordings/route.ts`
and `workers/render-demo.ts` each already checked for them at the top of
their own handler and returned/threw a friendly, specific error if unset,
and the README's "Important MVP limitation" section described this as
deliberate (the MVP works without Storage connected; you just can't
actually save a recording). This phase's `validateEnv()` promotes those two
vars to hard requirements to boot the process **at all** — per the ask,
which listed them alongside `DATABASE_URL` and the Clerk keys as required —
so a `DATABASE_URL`-only `.env` that previously ran the dev server fine (you
just got a clean 500 the moment you tried to actually record something) now
fails immediately on the first request to any route that imports
`lib/prisma` (i.e. essentially every route except the public marketing
`/`). Updated `README.md`'s "Run locally" and "Important MVP limitation"
sections to match. The two routes' own Supabase checks are left in place
as harmless defense-in-depth (e.g. if a var somehow gets unset after
process start in a long-lived server), but they're effectively unreachable
in the unconfigured case now that `validateEnv()` fails first.

If this trade-off (can't run the app at all locally without Supabase
configured, vs. the previous "boots fine, recording upload fails
specifically") isn't the intended one, the fix is a one-line change: move
those two vars from the required block to the optional block in
`lib/env.ts`'s `envSchema` — nothing else in this phase depends on them
being required.

## Not done in this phase

- The optional `*_HOST`/`*_URL` overrides (`POSTHOG_HOST`,
  `NEXT_PUBLIC_POSTHOG_HOST`, the Clerk redirect-URL vars,
  `REMOTION_BUNDLE_FILE`) aren't validated — they all have working
  defaults today, and getting one wrong doesn't break anything worth
  failing a boot over.
- `NODE_ENV`/`CI`/`PORT` (platform-supplied) and the E2E-only
  `E2E_CLERK_USER_EMAIL`/`E2E_BASE_URL`/`DEMOFORGE_STUB_RENDER` (read by a
  separate process — `playwright.config.ts`/`e2e/global.setup.ts` — or an
  internal test switch, not deployment config) are out of scope for the
  same reason DF-21.6's own env vars weren't added to `.env.example`'s
  "required" section.
