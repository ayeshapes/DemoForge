import React from "react";
import {
  AbsoluteFill,
  Freeze,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { EDL, EDLEffect } from "../lib/edl";
import { resolveSourceTime } from "../lib/edl";

export type DemoProps = {
  videoUrl: string;
  edl: EDL;
};

type ZoomEffect = Extract<EDLEffect, { type: "zoom" }>;
type TextEffect = Extract<EDLEffect, { type: "text" }>;
type CursorHighlightEffect = Extract<EDLEffect, { type: "cursor-highlight" }>;
type FreezeFrameEffect = Extract<EDLEffect, { type: "freeze-frame" }>;

export const DemoComposition: React.FC<DemoProps> = ({ videoUrl, edl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const outputSeconds = frame / fps;

  const clips = edl?.clips ?? [];
  const effects = edl?.effects ?? [];
  const freezeEffects = effects.filter((e) => e.type === "freeze-frame") as FreezeFrameEffect[];

  // DF-08: map this frame's *output* (post-cut) time back to a point in the
  // *source* video, by walking the same clip list used below to lay the clips
  // down as Sequences. Effects are authored in source time (see
  // components/timeline-editor.tsx), so effect matching has to compare against
  // this, not the raw `outputSeconds` -- once clips shift things, those two stop
  // being the same number (DF-09).
  //
  // DF-11: this natural mapping deliberately does *not* know about freeze-frame
  // effects -- they hold OffthreadVideo's displayed source frame constant (see
  // below) without pausing the composition's own clock, so `sourceSeconds` here
  // keeps advancing through a freeze window. zoom/text/cursor-highlight are
  // still keyed off it, so an effect window's on/off boundary isn't itself
  // held by a freeze; only the video image is. That's an acceptable scope
  // limit for this ticket, not an oversight.
  const sourceSeconds = resolveSourceTime(clips, outputSeconds);

  const zoom =
    sourceSeconds == null
      ? undefined
      : (effects.find(
          (e) => e.type === "zoom" && sourceSeconds >= e.start && sourceSeconds <= e.end
        ) as ZoomEffect | undefined);

  const highlight =
    sourceSeconds == null
      ? undefined
      : (effects.find(
          (e) => e.type === "cursor-highlight" && sourceSeconds >= e.start && sourceSeconds <= e.end
        ) as CursorHighlightEffect | undefined);

  // DF-12: text overlay already covers every styling field EDLEffect's "text"
  // variant has (x, y, fontSize), and -- like zoom/cursor-highlight above --
  // is matched against `sourceSeconds`, not the raw output time, so its window
  // stays correct once cuts shift things (DF-08/DF-09). It's plain JSX text
  // content (`{e.text}`), which React escapes on its own; there's no string
  // built for an FFmpeg `drawtext` filter here, so there's nothing to escape
  // or sanitize by hand.
  const textEffects =
    sourceSeconds == null
      ? []
      : (effects.filter(
          (e) => e.type === "text" && sourceSeconds >= e.start && sourceSeconds <= e.end
        ) as TextEffect[]);

  // DF-08: lay each clip down as its own Sequence, back to back on the output
  // timeline, trimming the source video to that clip's sourceStart-sourceEnd
  // range. This is what actually excludes cut ranges from the rendered output --
  // the video is never shown outside of its own Sequence's frame range.
  let cursorFrame = 0;
  const clipSequences = clips.map((clip) => {
    const trimBefore = Math.round(clip.sourceStart * fps);
    const trimAfter = Math.round(clip.sourceEnd * fps);
    const clipDurationFrames = Math.max(1, trimAfter - trimBefore);
    const from = cursorFrame;
    cursorFrame += clipDurationFrames;

    // DF-11: freeze-frame windows that fall inside *this* clip's source range,
    // converted to frame numbers relative to this clip's own Sequence (the
    // same coordinate space `useCurrentFrame()` reports inside it). Per the
    // ADR, we hold OffthreadVideo's displayed frame constant across the window
    // from `at` to `at + duration` rather than splitting/looping/re-concatenating
    // the source -- <Freeze> is exactly Remotion's built-in way to do that.
    const freezeWindows = freezeEffects
      .filter((fz) => fz.at >= clip.sourceStart && fz.at < clip.sourceEnd)
      .map((fz) => {
        const freezeRel = Math.round(fz.at * fps) - trimBefore;
        const endRel = Math.min(
          clipDurationFrames,
          Math.round((fz.at + fz.duration) * fps) - trimBefore
        );
        return { freezeRel, endRel };
      });

    const relativeFrame = frame - from;
    const activeFreeze = freezeWindows.find(
      (fz) => relativeFrame >= fz.freezeRel && relativeFrame < fz.endRel
    );

    return (
      <Sequence key={clip.id} from={from} durationInFrames={clipDurationFrames} layout="none">
        {/* Freeze always wraps the video (a stable tree across frames) so
            OffthreadVideo never remounts as freeze windows turn on/off --
            only `active` toggles, per Remotion's own <Freeze>+<Sequence>
            pattern for "play, pause, then continue". */}
        <Freeze frame={activeFreeze?.freezeRel ?? 0} active={Boolean(activeFreeze)}>
          <OffthreadVideo src={videoUrl} trimBefore={trimBefore} trimAfter={trimAfter} />
        </Freeze>
      </Sequence>
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill
        style={{
          transform: zoom ? `scale(${zoom.scale})` : "scale(1)",
          transformOrigin: zoom ? `${zoom.x * 100}% ${zoom.y * 100}%` : "center",
        }}
      >
        {clipSequences}
      </AbsoluteFill>

      {/* DF-10: cursor-highlight overlay, same absolutely-positioned pattern as
          the text effect below. Position is the effect's own x/y (see lib/edl.ts
          for why this isn't looked up from Action.x/y). */}
      {highlight && (
        <div
          style={{
            position: "absolute",
            left: `${highlight.x * 100}%`,
            top: `${highlight.y * 100}%`,
            width: highlight.radius * 2,
            height: highlight.radius * 2,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: "3px solid rgba(255, 209, 0, 0.9)",
            boxShadow: "0 0 0 6px rgba(255, 209, 0, 0.25), 0 0 24px 4px rgba(255, 209, 0, 0.35)",
            pointerEvents: "none",
          }}
        />
      )}

      {textEffects.map((e) => (
        <div
          key={e.id}
          style={{
            position: "absolute",
            left: `${e.x * 100}%`,
            top: `${e.y * 100}%`,
            transform: "translate(-50%, -50%)",
            color: "white",
            fontSize: e.fontSize || 32,
            fontWeight: 700,
            textShadow: "0 2px 8px rgba(0,0,0,.7)",
          }}
        >
          {e.text}
        </div>
      ))}
    </AbsoluteFill>
  );
};
