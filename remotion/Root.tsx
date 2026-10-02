import React from "react";
import { Composition } from "remotion";
import { DemoComposition } from "./DemoComposition";
import type { EDL } from "../lib/edl";
import { getClipsDurationSeconds } from "../lib/edl";
import { FPS } from "../lib/remotion-constants";

const emptyEdl: EDL = { version: 1, clips: [], effects: [] };

// DF-13: durationInFrames is derived from the EDL's assembled (post-cut) clip
// duration via `calculateMetadata` below, instead of a hardcoded frame count.
// `calculateMetadata` is Remotion's own hook for this: it re-runs whenever the
// composition's `props` change (a new `edl`/`videoUrl`), and -- crucially --
// it also runs inside `selectComposition()` in workers/render-demo.ts, so the
// worker's `inputProps` (the real per-job `videoUrl`/`edl`) already produce the
// correct `durationInFrames` for that job without the worker needing to
// recompute it by hand (see the simplified `renderDemoVideo()` below).
//
// What this component can *not* do is know which job is being rendered: Root.tsx
// is evaluated once when the composition is bundled (`npm run bundle:remotion`)
// and shared by every export job and by `remotion studio`. There's no single
// "real" videoUrl/edl to hardcode here -- that's exactly why `defaultProps`
// stays an empty placeholder (used only when nothing else supplies props, e.g.
// opening Studio with no input) while the per-job videoUrl/edl are threaded
// through as `inputProps` on `selectComposition()`/`renderMedia()` in
// workers/render-demo.ts. To preview a specific recording in `remotion studio`,
// use the Studio UI's props editor to paste that job's `{ videoUrl, edl }`
// rather than editing defaultProps here.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="Demo"
      component={DemoComposition}
      durationInFrames={1}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ videoUrl: "", edl: emptyEdl }}
      calculateMetadata={({ props }) => {
        const edl = (props?.edl as EDL | undefined) ?? emptyEdl;
        const durationInFrames = Math.max(
          1,
          Math.round(getClipsDurationSeconds(edl.clips ?? []) * FPS)
        );
        return { durationInFrames };
      }}
    />
  </>
);
