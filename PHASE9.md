# Phase 9 (in progress) — Remotion render pipeline, part 1

Epic B plumbing tickets only. Full effect coverage (cursor-highlight, freeze-frame,
clip-based cuts) is deliberately deferred to the follow-up Epic B tickets that build
on this.

## DF-07 · Replace the FFmpeg scale/pad call with `renderMedia()`
- `workers/render-demo.ts` no longer shells out to `ffmpeg` via `execFileSync`.
- It calls `selectComposition()` + `renderMedia()` from `@remotion/renderer`,
  passing `{ videoUrl: recording.videoUrl, edl: edlJson }` as `inputProps` into the
  `Demo` composition.
- Output `width`/`height` come from the existing `dimensions` table (16:9 / 9:16 /
  1:1) and are applied by overriding the composition Remotion returns from
  `selectComposition()`, rather than an FFmpeg `scale`/`pad` filter.
- `durationInFrames` is derived from `recording.duration` at a fixed 30fps.
- The worker no longer downloads the source video to `/tmp` first --
  `OffthreadVideo` in `DemoComposition` reads `recording.videoUrl` directly, so
  Chromium fetches it during rendering.
- `DemoComposition` now takes `{ videoUrl, edl }` (matching the EDL shape from
  `lib/edl.ts`) instead of a bare `effects` array. It still only renders the
  `zoom`/`text` effects it did before -- `cursor-highlight`, `freeze-frame`, and
  clip-based cuts (`edl.clips`) are not wired in yet.

## DF-07a · Pre-bundle the Remotion composition
- `scripts/bundle-remotion.mjs` calls `bundle()` once, writing the webpack output to
  `.remotion/bundle/` and recording its `serveUrl` in `.remotion/bundle.json`.
- `npm run build` now runs `npm run bundle:remotion` before `next build`.
- `lib/remotion-bundle.ts` (`getRemotionServeUrl()`) is what `render-demo.ts` reads
  at render time -- it never calls `bundle()` itself. It reads (in order):
  1. `REMOTION_SERVE_URL` env var, if set (e.g. a hosted/CDN bundle URL).
  2. The `.remotion/bundle.json` artifact from the build step (path overridable via
     `REMOTION_BUNDLE_FILE`).
  The resolved `serveUrl` is cached in memory for the life of the process.
- `next.config.js` adds `experimental.outputFileTracingIncludes` for the Inngest
  API route so `.remotion/**` isn't dropped on file-tracing serverless deploys
  (e.g. Vercel). This is a no-op on a normal long-running Node server.

## Required runtime setup (delta from Phase 8)
- FFmpeg is no longer required by the render worker.
- Chromium (via Remotion/Puppeteer) is required instead -- make sure the deploy
  environment can run headless Chromium (same constraint Remotion always has;
  see Remotion's own docs for Docker/Lambda/etc. base images if deploying to a
  minimal container).
- `npm run build` must run before the worker starts, so `.remotion/bundle.json`
  exists. There's no per-job fallback to bundle on the fly.

## DF-11 · Render freeze-frame effects
- `freeze-frame` effects (`{ at, duration }`, both source-time seconds) were
  not modeled in `DemoComposition` at all before this. They're now rendered by
  wrapping each clip's `<OffthreadVideo>` in Remotion's own `<Freeze>`
  component: `<Freeze frame={...} active={...}>` holds whatever it wraps at a
  fixed frame while `active` is true, which is exactly "hold OffthreadVideo's
  current time constant" from the ADR, without the clip-split + static loop +
  re-concat an FFmpeg pipeline would need.
- The `<Freeze>` wrapper is always present in the tree (its `active` prop just
  toggles) so `OffthreadVideo` never unmounts/remounts as a freeze window turns
  on/off.
- `at`/`duration` are in source-time seconds, matching every other effect's
  timestamps. Per clip, a freeze window is converted to that clip's own
  Sequence-relative frame numbers (`Math.round(at * fps) - trimBefore`, etc.),
  since that's the coordinate space `<Freeze frame={...}>` and `useCurrentFrame()`
  operate in once nested inside a `<Sequence>`.
- Scope note: freeze-frame only holds the *video image*. `zoom`/`text`/
  `cursor-highlight` windows are still matched against the natural (unfrozen)
  `resolveSourceTime()` mapping, so an effect's own start/end boundary isn't
  itself paused by a freeze -- only what `<OffthreadVideo>` displays is.

## DF-12 · Text overlay confirmation
- `DemoComposition`'s `text` effect rendering already used every styling field
  `EDLEffect`'s `text` variant has (`x`, `y`, `fontSize`), and DF-08/DF-09's
  `sourceSeconds` remap (landed in the same change as clip cuts) already
  covers its start/end matching -- no changes were needed beyond confirming
  and commenting that in place.
- It's plain JSX (`{e.text}`), which React escapes on its own. There's no
  string being built for an FFmpeg `drawtext` filter, so there's no
  escaping/injection surface the way there would be with Option A's FFmpeg
  approach.
