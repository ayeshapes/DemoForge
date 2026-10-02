# DemoForge Phase 3 — Cross-Origin Browser Recording

## Goal

Move interaction capture out of the web page iframe and into a browser-level recording layer.

## Why

A normal webpage cannot inspect DOM events inside a cross-origin iframe. The browser extension can observe events on pages where the extension has permission.

## Architecture

User
  -> DemoForge web app
  -> Start recording session
  -> Browser extension receives session ID
  -> Extension records click/scroll events
  -> Screen is captured with getDisplayMedia()
  -> Web app receives synchronized action events
  -> Actions are persisted against the Recording
  -> Timeline visualizes video + actions

## Important limitation

`getDisplayMedia()` still requires an explicit browser permission/user selection. This project should not attempt to bypass that browser security boundary.

## Next implementation tasks

1. Add a recording session ID.
2. Add extension <-> web app handshake.
3. Authenticate the extension session.
4. Stream action events to the web app.
5. Synchronize action timestamps with recording start.
6. Persist actions in Prisma.
7. Improve timeline seeking and editing.
