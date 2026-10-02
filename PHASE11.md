# DemoForge Phase 11 — Merge in Clerk auth (from the Phase 9 branch)

This phase merges the auth work from a parallel branch (delivered as a
standalone "Phase 9" snapshot) into this codebase, which had already moved
past that point on its own: Phase 9 here built the Remotion render pipeline
(`PHASE9.md`), and Phase 10 removed the dead extension bridge (`PHASE10.md`).
The other branch never did the Remotion work and instead spent its own
"Phase 9" on Clerk auth and its own (separately-numbered) extension-bridge
removal. The two branches share a common ancestor around Phase 8 but
diverged from there, so this was a real merge, not a drop-in copy.

## What was taken from the Phase 9 branch as-is
- `lib/auth.ts` — `getAuthedUser()` / `requireUser()`, the single place a
  request's identity is trusted from (Clerk session → Prisma `User`,
  lazily created on first sight via `User.clerkId`).
- `middleware.ts` — `clerkMiddleware()`, public routes limited to `/`,
  `/sign-in` and `/sign-up` (the Inngest endpoint was still hosted by Next.js
  at this point and was authenticated separately by Inngest's own signing key).
- `app/sign-in/[[...sign-in]]/page.tsx`, `app/sign-up/[[...sign-up]]/page.tsx`.
- `app/layout.tsx` — wrapped in `<ClerkProvider>`.
- `app/page.tsx` — `<SignedIn>`/`<SignedOut>` swap the dashboard link for a
  sign-in prompt.
- `app/dashboard/page.tsx`, `app/projects/[id]/page.tsx` — now list the
  signed-in user's projects/recordings (there was previously no `GET`
  endpoint or listing UI at all — every project/recording was only
  reachable by a saved URL).
- `app/api/projects/route.ts` (adds `GET`, scoped to `userId: user.id`),
  and the auth + ownership checks added to `app/api/recordings/route.ts`,
  `app/api/recording/[id]/route.ts`, `app/api/recording/[id]/edit/route.ts`,
  `app/api/recording/[id]/export/route.ts`,
  `app/api/recording/[id]/export/status/route.ts`. Ownership is checked
  through the Recording → Project → User chain, same pattern as the
  Phase 9 branch used, since this codebase's own Phase 10 had already
  independently removed the extension/session-bridge these routes used to
  worry about — there was nothing left to reconcile there.

None of the files above touch the Remotion render pipeline, so taking them
as-is from the Phase 9 branch carried no risk of regressing Phase 9/10's
work in this codebase.

## What was deliberately NOT taken from the Phase 9 branch
The Phase 9 branch never built the Remotion pipeline — it's still on
Phase 8's `execFileSync("ffmpeg", ...)` worker and a simpler `EDL` (no
`clips`/cuts, no freeze-frame, no cursor-highlight position). Its versions
of the following files are **older** than this codebase's, not newer, and
were left untouched:
- `lib/edl.ts`, `remotion/DemoComposition.tsx`, `remotion/Root.tsx`,
  `workers/render-demo.ts`, `lib/remotion-bundle.ts`,
  `lib/remotion-constants.ts`, `scripts/bundle-remotion.mjs`,
  `components/timeline-editor.tsx` (Remotion `<Player>`-based preview with
  cut/freeze/highlight support), `Dockerfile`, `next.config.js`,
  `package.json`'s `build`/`bundle:remotion` scripts.

## Merged by hand (both branches touched these)
- `prisma/schema.prisma` — added `User.clerkId @unique` (Phase 9 branch);
  also dropped the dead `Recording.userId String?` column, per the Phase 9
  branch's own DF-14 cleanup decision (it was only ever written by the
  session-bridge routes this codebase's Phase 10 already removed, and
  nothing in this codebase reads it either).
- `package.json` — added the `@clerk/nextjs` dependency; kept this
  codebase's `build`/`bundle:remotion` scripts (the Phase 9 branch's
  `package.json` predates that Phase 9/DF-07a work).
- `package-lock.json` — regenerated (`npm install --package-lock-only`) to
  pick up `@clerk/nextjs` and its transitive deps.
- `.env.example` — added the Clerk keys alongside the existing Remotion
  bundle vars.
- `Dockerfile` — added a build-time `ARG`/`ENV` for
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. Clerk inlines this into client
  bundles at `next build` time, so — unlike `CLERK_SECRET_KEY`, which is
  server-only and fine as a plain runtime value — it has to be supplied as
  a build arg or the production image will build without it.

## Required runtime setup (delta from Phase 10)
1. A Clerk application (https://dashboard.clerk.com).
2. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env`
   (and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` as a Docker build arg if
   building the image).
3. Run `npx prisma migrate dev` after pulling this phase — the schema
   changed (`User.clerkId` added; `Recording.userId` removed).

## Not done in this phase
- Rate limiting / abuse protection on the API routes — Clerk handles
  identity, not request throttling.
- No attempt was made to reconcile the two branches' independent,
  differently-numbered DF-14 extension-removal tickets beyond confirming
  both branches ended up in the same place (extension gone, `POST
  /api/recordings` as the sole recording-creation path) — there was
  nothing left to merge there.
