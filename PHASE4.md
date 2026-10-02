# DemoForge Phase 4 — Session Bridge

## Completed

- Recording session IDs
- Web app session endpoint
- Action ingestion endpoint
- Chromium extension service worker
- Extension-aware action batching
- Click/scroll events associated with a session
- Retry behavior for failed action uploads
- Client-side session-start control

## Architecture

Web app
  -> POST /api/recording/session
  -> sessionId
  -> browser extension bridge
  -> content script
  -> click/scroll events
  -> batched POST /api/recording/actions
  -> persistence layer

## Important security note

This phase is a development bridge. Before production:
- authenticate extension requests
- validate allowed origins
- bind session IDs to authenticated users
- persist actions through Prisma
- expire sessions
- prevent arbitrary websites from submitting actions

## Next phase

Implement real Prisma persistence:
1. Create Recording when a session starts.
2. Store each action with recordingId.
3. Associate recordings with Projects and users.
4. Fetch action history.
5. Make the timeline live-update while recording.
