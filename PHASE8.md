# DemoForge Phase 8 — Export Pipeline

## Integrated

- Export API creates an Export row and sends `demoforge/export.requested` to Inngest.
- Inngest marks the job processing, runs the render worker, and marks it done/failed.
- Render worker downloads the source WebM, uses FFmpeg for 16:9 / 9:16 / 1:1 output, uploads MP4 to Supabase Storage, and returns the public URL.
- Export status is scoped to the recording and export ID.
- Export UI is mounted on the recording editor.
- Recording uploads now persist the source WebM to Supabase instead of `local://pending-upload`.
- Prisma schema now contains the session/export/EDL fields used by the Phase 4–8 routes.

## Required runtime setup

1. PostgreSQL with `DATABASE_URL`.
2. Supabase project with a `demoforge-videos` storage bucket. Because the worker uses `getPublicUrl`, make that bucket public, or replace it with signed URLs.
3. `NEXT_PUBLIC_SUPABASE_URL`.
4. `SUPABASE_SERVICE_ROLE_KEY` (server/worker only; never expose it to the browser).
5. Inngest configured to discover `/api/inngest`.
6. Chromium's system dependencies (shared libraries) installed in the environment that executes the Inngest render function, since `@remotion/renderer`'s `renderMedia()` drives headless Chromium to rasterize frames (DF-07/PHASE9) -- see the project `Dockerfile` for the exact package list, and DF-14/PHASE9's "Required runtime setup" for the full rationale. FFmpeg is bundled inside `@remotion/renderer` itself as of Remotion v4, so a system FFmpeg install is no longer strictly required for rendering the way it was for Phase 8's `execFileSync("ffmpeg", ...)` pipeline; the Dockerfile still installs one alongside Chromium regardless, per the ADR.
7. `npm run build` run before the app/worker starts (it runs `npm run bundle:remotion` first, DF-07a), so the pre-bundled Remotion composition's `serveUrl` exists at `.remotion/bundle.json` before any export job runs. There's no per-job fallback to bundle on the fly.

## Important limitations

- The existing project uses the Phase 5 development identity bridge (`userId` supplied by the client). It is not production authentication. Clerk is not installed/configured in the original project, so the Clerk import from the ticket was not blindly added; doing so would require migrating project/user creation and adding a sign-in flow.
- The browser recorder can record the screen, but cross-origin iframe interaction events are still limited: `components/recorder.tsx` only captures clicks on iframes that are same-origin with the DemoForge app. The Phase 3/4 browser-extension bridge intended to solve this was never actually wired up end-to-end and has since been removed as dead code -- see PHASE10.md (DF-14) for why, and what a real fix would need to cover.
- Phase 8 currently applies aspect-ratio scaling/padding. The EDL is persisted and passed through the export job, but cuts/effects are not yet rendered by the FFmpeg worker.
- For production, FFmpeg rendering should run on a dedicated worker/Railway process or another environment with sufficient CPU/memory rather than a normal Vercel request.
