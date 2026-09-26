# DemoForge Phase 13 — PostHog instrumentation + structured logging

This phase picks up the two tickets left partially done from the previous
pass: **DF-22** (PostHog analytics) and **DF-24** (error/observability).
Scope note up front: the codebase this phase started from did not contain
any prior PostHog, logger, or test-suite work — no `lib/analytics.ts`, no
`posthog-js`/`posthog-node` dependency, no `lib/logger.ts`, and no test
files anywhere in the repo. Everything below was built from scratch to
finish DF-22 and DF-24. DF-21 (test suite), DF-23 (deployment config), and
the Playwright E2E test were **not** part of this pass and remain
un-started — see "Not done in this phase" at the end.

## DF-22 · Analytics (PostHog)

Added `posthog-js` and `posthog-node` as dependencies.

- **`lib/analytics.ts`** — server-side PostHog client (`posthog-node`),
  used from route handlers and the Inngest export worker. `getClient()`
  lazily constructs a singleton `PostHog` instance keyed off
  `POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_KEY`; if neither is set, `capture()`
  is a no-op and never throws. `flushAt: 1`/`flushInterval: 0` plus an
  explicit `flushAnalytics()` call at each call site, since route handlers
  and Inngest steps are short-lived — without an eager flush, batched
  events risk being dropped when the function/process freezes.
- **`lib/analytics-client.ts`** — browser-side PostHog (`posthog-js`).
  `initAnalytics()` calls `posthog.init()` once, guarded on
  `NEXT_PUBLIC_POSTHOG_KEY` being set; `captureClient()` is a no-op until
  init has run. `components/posthog-provider.tsx` is a client component
  that calls `initAnalytics()` in a `useEffect`, mounted once from
  `app/layout.tsx`.
- Instrumented events, each attributed to the owning user's id as
  PostHog's `distinctId`:
  - `project_created` — `app/api/projects/route.ts` `POST`, after the
    `prisma.project.create()` succeeds. Includes `projectId` and whether
    a GitHub/deployment URL was provided.
  - `export_requested` — `app/api/recording/[id]/export/route.ts` `POST`,
    after the `Export` row is created and the Inngest event is sent.
  - `export_completed` — `lib/inngest/functions.ts`, at the end of
    `handleExportJob`'s main run, after the export row is marked `done`.
  - `export_failed` — `lib/inngest/functions.ts`'s `onFailure` handler,
    alongside the existing `status: "failed"` DB update.
  - `recording_started` / `recording_stopped` — `components/recorder.tsx`,
    fired client-side right after `MediaRecorder` actually starts and when
    the user clicks Stop (with elapsed duration and captured action count).
    These are the two events fired from the browser, not the server, since
    that's where the state (whether `getDisplayMedia` succeeded, actual
    elapsed time) lives.

  `export.requested`'s Inngest event only carries `recordingId`, not a
  user id, so both `export_completed` and `export_failed` resolve the
  owner through a small `getOwnerId(recordingId)` helper in
  `functions.ts` that walks the same `recording -> project -> userId`
  ownership chain every route in this app already uses. That lookup is
  best-effort: if it fails (e.g. the recording was deleted mid-render),
  the analytics event is skipped rather than throwing out of an
  `onFailure` handler.

- `.env.example` documents `NEXT_PUBLIC_POSTHOG_KEY` / `POSTHOG_KEY` and
  `NEXT_PUBLIC_POSTHOG_HOST` / `POSTHOG_HOST`, all optional, defaulting to
  PostHog Cloud (US) when a host isn't set.

## DF-24 · Error/observability pass

- **`lib/logger.ts`** — a small structured logger (`debug`/`info`/`warn`/
  `error`), each call emitting one JSON line with a level, ISO timestamp,
  message, arbitrary structured context, and a serialized error (name/
  message, plus stack outside production). This deliberately doesn't pull
  in pino/winston: there's no log-shipping destination configured yet
  (that's DF-23/deployment territory), so a dependency buys nothing over
  structured `console.*` right now, and every call already goes through
  this one module, so swapping the internals later is a one-file change.
- Every remaining `console.error(e)` call site was swapped for
  `logger.error(message, err, context)` with a route name and the
  relevant resource id as context: `app/api/projects/route.ts` (both
  handlers), `app/api/recordings/route.ts`, `app/api/recording/[id]/route.ts`,
  `app/api/recording/[id]/edit/route.ts` (both handlers),
  `app/api/recording/[id]/export/route.ts`, `app/api/recording/[id]/export/status/route.ts`,
  and the `onFailure` handler in `lib/inngest/functions.ts`.
- Recording/session error messages were the terser half mentioned in the
  ticket; export errors already returned specific, actionable text. Made
  the following more specific instead of the previous generic "Could not
  load/save X.":
  - `POST /api/recordings` distinguishes a known, already-specific
    Supabase upload failure (shown verbatim — it already names what
    failed) from any other unexpected fault, which gets a message that
    tells the user the video may not have uploaded and to retry.
  - `PUT /api/recording/[id]/edit` no longer returns a bare "Invalid EDL"
    — the 400 now says the timeline has an unsupported clip order, gap,
    or trim value, and the malformed-JSON case is now caught explicitly
    instead of throwing before the try/catch's own message.
  - The remaining "could not load" messages (recording fetch, recording
    edit fetch, export status) now suggest checking the connection and
    retrying, rather than a bare fragment.

## Not done in this phase

- **DF-21 (test suite)** — no unit, API route, or E2E tests exist in this
  codebase. Adding them (`lib/edl.ts` unit tests, API route tests, a
  Playwright happy-path test) is a substantial separate piece of work and
  was out of scope for this pass.
- **DF-23 (deployment config)** — no `vercel.json`/`railway.json`/
  `DEPLOYMENT.md`/env-check script exist yet.
- Per DF-24's own scope, this pass did not add tracing/APM or ship logs
  anywhere — `lib/logger.ts` only structures what already goes to stdout.
