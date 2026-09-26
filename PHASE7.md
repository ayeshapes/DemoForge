# DemoForge Phase 7 — Persistent Video Editing

## Completed

- EDL persisted in PostgreSQL as JSON
- Multi-clip timeline representation
- Cut/delete selected time ranges
- Zoom effect
- Cursor-highlight effect
- Text overlay effect
- Freeze-frame effect
- EDL validation
- Load saved edits when reopening a recording

## Important

The editor now describes the desired final video, but it does not render those effects into an MP4 yet.

The next phase is the rendering pipeline:
- Remotion composition
- FFmpeg processing
- background jobs
- export status
- 16:9 / 9:16 / 1:1
- Supabase Storage output
