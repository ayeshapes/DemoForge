# DemoForge

A developer-focused tool for turning deployed web projects into polished demo videos.

## Current MVP
- Next.js 14 App Router + TypeScript
- Tailwind CSS
- Prisma/PostgreSQL schema
- Project creation from a deployed URL
- Project preview iframe
- Browser screen recording with MediaRecorder/getDisplayMedia
- Basic interaction timeline data model

## Run locally

```bash
npm install
cp .env.example .env
# edit DATABASE_URL
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Open http://localhost:3000.

## Important MVP limitation
Browser screen capture is intentionally done client-side. The current upload endpoint stores recording metadata but uses a placeholder video URL; connect Supabase Storage (or another object store) before production use. Cross-origin iframes also cannot expose pointer/scroll events from the embedded project, so robust interaction capture should use a same-origin recording surface or a browser automation/remote-browser layer in the next phase.

## Roadmap
1. ✅ Supabase Storage upload
2. ✅ GitHub metadata integration
3. Robust interaction capture
4. EDL editor
5. Remotion + FFmpeg export worker
6. Inngest background jobs
7. ✅ Auth with Clerk


## Phase 3
A Chromium Manifest V3 extension scaffold was added in `extension/` for cross-origin interaction capture. See `PHASE3.md`. Removed in Phase 10 -- see below.


## Phase 4
Session bridge between the DemoForge web app and browser extension. See `PHASE4.md`. Removed in Phase 10 -- see below.


## Phase 5
Persistent recording sessions and action storage via Prisma/PostgreSQL. See `PHASE5.md`.


## Phase 6
Timeline and EDL editor. See `PHASE6.md`.


## Phase 7
Persistent EDL-based video editing with cuts and effects. See `PHASE7.md`.


## Phase 8
Remotion-based export pipeline and export job UI. See `PHASE8.md`.


## Phase 8 integrated export setup
The export pipeline requires Supabase Storage and Inngest. Copy `.env.example` to `.env`, configure the Supabase values, create the `demoforge-videos` bucket, then run Prisma generation/migration before starting the app.


## Phase 9 (in progress)
The export worker now renders through Remotion's `renderMedia()` (headless Chromium) instead of an FFmpeg scale/pad pass, and the Remotion composition is bundled once at build time rather than per job. Run `npm run build` (which runs `npm run bundle:remotion` first) before starting the app in production. See `PHASE9.md`.


## Phase 10
Removed the Phase 3/4 browser-extension session bridge (`extension/`, `RecordingSessionButton`, `/api/recording/session|actions|finish`): it was never actually wired up (the extension had no listener for the page's handshake message, and the button was never mounted), and even fixing that relay wouldn't have made it a complete feature -- see `PHASE10.md` (DF-14) for the full reasoning. `POST /api/recordings` is now the sole, canonical way a `Recording` gets created (DF-15). Same-origin iframe capture via `components/recorder.tsx` remains the supported recording path; real cross-origin capture (DF-16) is still an open problem, deliberately left to a future ADR rather than decided here.


## Phase 11
Clerk auth merged in from a parallel Phase 9 branch: every project/recording/export query is now scoped to the authenticated user. See `PHASE11.md` for exactly what was merged and how it was reconciled with Phase 9/10's Remotion render pipeline. You'll need a Clerk app and its keys in `.env` (see `.env.example`), and to re-run `npx prisma migrate dev` since the schema changed.


## Phase 12
GitHub repo metadata (DF-19) and a GitHub URL field on project creation (DF-20). See `PHASE12.md`.
