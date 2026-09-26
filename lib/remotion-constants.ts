/**
 * Single source of truth for the frame rate used across the Remotion pipeline:
 * `remotion/Root.tsx` (composition + `calculateMetadata`), `workers/render-demo.ts`
 * (export rendering), and `components/timeline-editor.tsx` (editor live preview,
 * DF-16). All three need to agree on this value -- EDL clip/effect timestamps are
 * authored in seconds and only get converted to frame numbers using this constant,
 * so a mismatch here would silently desync the preview, the Studio, and the
 * rendered export from one another.
 */
export const FPS = 30;
