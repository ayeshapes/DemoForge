# DemoForge Phase 10 — Remove the disconnected extension/session bridge

## DF-14 · Decision: removed, not fixed

`RecordingSessionButton` called `window.postMessage(...)`, expecting the
extension's `content.js` to relay it into `chrome.runtime.sendMessage(...)` so
`background.js` could store the session and start relaying actions. That
relay was never written -- `content.js` had no
`window.addEventListener("message", ...)` at all -- so the whole Phase 3/4
flow (`extension/`, `RecordingSessionButton`, `/api/recording/session`,
`/api/recording/actions`, `/api/recording/finish`) was unreachable: the
button was never mounted on any page, and even if it had been, the message
it sent was never picked up by anything.

This turned out to be more than a missing listener, so this ticket removed
the flow instead of patching it:

- The actual, currently-used recording path is `components/recorder.tsx`
  (mounted on `app/projects/[id]/page.tsx`). It captures the screen with
  `getDisplayMedia()`, logs same-origin iframe click events directly via
  `onClick`, and uploads video + actions together in one `POST
  /api/recordings` call -- `Recording` rows from this path never have a
  `sessionId`.
- The session-bridge path wrote to the *same* `Recording.sessionId` column
  from a completely disjoint set of endpoints (`/api/recording/session`
  creates the row, `/api/recording/actions` appends `Action`s to it by
  `sessionId`, `/api/recording/finish` attaches a `videoUrl`), but nothing in
  the actual UI ever called `/api/recording/finish`, and the extension had no
  way to capture the screen video itself (`getDisplayMedia()` is a page-level
  API, not something a content script can drive). So even with the
  `postMessage` -> `chrome.runtime.sendMessage` relay added, a session
  started this way could accumulate `Action` rows but would never get a
  video attached to the same `Recording` -- the two systems don't actually
  converge into one usable recording, they're just two independent,
  half-built features that happen to share a table.

Given that, "add the missing listener and mount the button" would leave a
still-nonfunctional feature, just with one fewer obviously-broken symptom.
Removed instead:

- `extension/` (the whole Manifest V3 scaffold: `content.js`, `background.js`,
  `manifest.json`, its README)
- `components/recording-session-button.tsx`
- `app/api/recording/session/route.ts`, `app/api/recording/actions/route.ts`,
  `app/api/recording/finish/route.ts`
- `lib/recording-session.ts`
- `Recording.sessionId` (Prisma schema) -- it was only read/written by the
  routes above. Run `npx prisma migrate dev` (or generate a migration in your
  normal workflow) to drop the column from an existing database; there's no
  migration checked into this snapshot to apply automatically.

## What this means for cross-origin capture

Phase 3's original motivation -- a normal page can't observe DOM events
inside a cross-origin iframe, so a browser extension was going to be the
capture layer for that case -- is still true, and is still unsolved.
`components/recorder.tsx` only captures clicks on iframes that are
same-origin with the DemoForge app (see PHASE8.md's "Important
limitations"). A future cross-origin solution should either:

- build a real extension end-to-end in one pass (handshake, capture, *and*
  a way to get the captured video back to the same `Recording` the actions
  belong to -- e.g. the extension also drives/receives the screen-share
  video, or the web app's own `Recorder` and the extension coordinate on a
  single `recordingId` created up front), or
- use a remote-browser/automation layer (e.g. driving the target site in a
  server-side headless/remote browser DemoForge controls end-to-end) instead
  of a locally-installed extension.

Either is a real project, not a small follow-up -- worth an ADR of its own
before picking a direction, rather than reviving this scaffold.

## DF-15 · Canonical recording-creation path

This was actually settled as a side effect of the DF-14 removal above, not a
separate change: with `/api/recording/session`, `/api/recording/actions`,
`/api/recording/finish`, and `Recording.sessionId` gone, there is now exactly
one way a `Recording` row gets created --

**`POST /api/recordings`** (`app/api/recordings/route.ts`), called by
`components/recorder.tsx`. It takes the recorded video blob plus the
captured actions as one `multipart/form-data` request and creates the
`Recording` (`status: "complete"`) and its `Action` rows together in a
single `prisma.recording.create({ ..., actions: { create: [...] } })` call.
There's no longer a second, partially-built path to document "when to use
instead" -- if a future capture method (extension-based or otherwise) needs
a different shape, it should go through this same endpoint/model rather
than reintroducing a second `Recording`-creation route, so there's still
only one place that decides what a "complete" `Recording` looks like.

## DF-16 · Real cross-origin capture -- not applicable

DF-16 was framed as "the payoff ticket if DF-14 goes with 'fix the
extension'." DF-14 went the other way (removed it, see above), so there is
no extension left to make cross-origin capture work inside. This isn't
shipped as a no-op, though -- cross-origin capture is still an open, real
gap (see "What this means for cross-origin capture" above), just not one
this phase attempted, since it depends on a direction (real extension vs.
remote-browser automation) that DF-14's writeup deliberately left as a
follow-up ADR rather than deciding by default here.
