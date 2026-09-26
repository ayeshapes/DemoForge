# DemoForge Phase 5 — Persistent Recording Sessions

## Completed

- Prisma models for Users, Projects, Recordings, Actions, Exports
- Prisma singleton client
- Recording session creation persisted to PostgreSQL
- Session tied to a project/user
- Batched browser-extension actions persisted as Action rows
- Recording finish endpoint
- Recording retrieval endpoint with actions ordered by timestamp
- Session state protection against writes after completion

## API

POST /api/recording/session
```json
{ "projectId": "...", "userId": "..." }
```

POST /api/recording/actions
```json
{
  "sessionId": "...",
  "actions": [
    {"type":"click","timestamp":2.4,"x":500,"y":300,"metadata":{}}
  ]
}
```

POST /api/recording/finish
```json
{"sessionId":"...","duration":24.3,"videoUrl":"..."}
```

GET /api/recording/:id

## Important

The current endpoints accept a userId supplied by the client. That is intentionally a development-stage bridge. Before production, replace it with Clerk server-side identity and never trust a client-provided userId.

## Next phase

Build the real timeline/editor:
- load recording + actions
- render video preview
- click markers to seek
- select ranges
- create an edit-decision-list (EDL)
- persist edits
