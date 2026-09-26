# DemoForge Phase 6 — Timeline & EDL Editor

## Completed

- Recording editor route
- Video preview
- Action markers on a timeline
- Marker click -> video seek
- Selectable start/end range
- EDL v1 structure
- EDL validation endpoint
- Save-edit workflow

## EDL

```json
{
  "version": 1,
  "clips": [
    {"id":"main","sourceStart":0,"sourceEnd":18.5}
  ],
  "effects": []
}
```

The EDL is deliberately separate from rendering. This lets the editor describe *what* should happen without doing expensive video processing in the browser.

## Next

Phase 7 should persist EDL JSON in Prisma and add:
- cut/delete segments
- zoom effects
- cursor highlight effects
- text overlays
- freeze frames
- a proper multi-clip timeline
