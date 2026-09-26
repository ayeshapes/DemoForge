export type EDLClip = {
  id: string;
  sourceStart: number;
  sourceEnd: number;
};

export type EDLEffect =
  | { id: string; type: "zoom"; start: number; end: number; scale: number; x: number; y: number }
  // x/y here are the highlight's own position (normalized 0-1, same convention as
  // zoom/text), not a lookup into Action.x/y. See DF-10: Action.x/y are raw
  // viewport pixel coordinates captured by the recorder, and Recording
  // doesn't store the source viewport's width/height, so there's no reliable way
  // to normalize them into composition-fraction coordinates at render time. The
  // effect carries its own position instead -- the same pattern already used by
  // zoom/text -- and an editor UI can default that position from the nearest
  // Action (converted to a fraction using the live viewport it already has) when
  // the effect is created, rather than the renderer trying to re-derive it later.
  | { id: string; type: "cursor-highlight"; start: number; end: number; radius: number; x: number; y: number }
  | { id: string; type: "text"; start: number; end: number; text: string; x: number; y: number; fontSize: number }
  | { id: string; type: "freeze-frame"; at: number; duration: number };

export type EDL = {
  version: 1;
  clips: EDLClip[];
  effects: EDLEffect[];
};

export function makeDefaultEdl(duration: number): EDL {
  return {
    version: 1,
    clips: duration > 0 ? [{ id: crypto.randomUUID(), sourceStart: 0, sourceEnd: duration }] : [],
    effects: []
  };
}

export function validateEdl(edl: unknown): edl is EDL {
  if (!edl || typeof edl !== "object") return false;
  const value = edl as any;
  if (value.version !== 1 || !Array.isArray(value.clips) || !Array.isArray(value.effects)) return false;

  for (const clip of value.clips) {
    if (!clip.id || !(clip.sourceEnd > clip.sourceStart) || clip.sourceStart < 0) return false;
  }

  for (const effect of value.effects) {
    if (!effect.id || !effect.type) return false;
    if (effect.type !== "freeze-frame" && !(effect.end > effect.start)) return false;
  }

  return true;
}

/** Total duration, in seconds, of the assembled (post-cut) output timeline. */
export function getClipsDurationSeconds(clips: EDLClip[]): number {
  return clips.reduce((total, clip) => total + Math.max(0, clip.sourceEnd - clip.sourceStart), 0);
}

/**
 * DF-08: maps a point in time on the *composition's* (post-cut) timeline to the
 * corresponding point in time in the original *source* video, by walking `clips`
 * in order and treating each clip's duration as a contiguous segment of the
 * output -- the inverse of how DemoComposition lays clips down as Sequences.
 *
 * Effects (`EDLEffect.start`/`end`) are authored against source time (see
 * components/timeline-editor.tsx, which shares its `range` state with
 * `cutRange()`), so anything matching effects against the current frame must
 * compare against the value this returns, not the raw composition-time seconds.
 *
 * Returns null when `compositionSeconds` falls beyond the end of every clip
 * (e.g. `clips` is empty, or the composition was given more frames than the
 * clips add up to) -- callers should treat that as "nothing to show" rather
 * than clamping to the last clip, which would freeze on its final frame.
 */
export function resolveSourceTime(clips: EDLClip[], compositionSeconds: number): number | null {
  const EPSILON = 1e-6;
  let cursor = 0;

  for (const clip of clips) {
    const clipLength = clip.sourceEnd - clip.sourceStart;
    if (clipLength <= 0) continue;

    const clipEndInComposition = cursor + clipLength;
    if (compositionSeconds <= clipEndInComposition + EPSILON) {
      const offsetIntoClip = compositionSeconds - cursor;
      return clip.sourceStart + Math.min(Math.max(offsetIntoClip, 0), clipLength);
    }

    cursor = clipEndInComposition;
  }

  return null;
}

/**
 * DF-16: the inverse of `resolveSourceTime()` -- maps a timestamp on the
 * *original source* video (e.g. a recorded Action's raw `timestamp`, which
 * predates any cuts) to the corresponding point on the assembled (post-cut)
 * *composition* timeline, by walking `clips` in the same order used to lay
 * them down as Sequences in `DemoComposition`.
 *
 * This is what lets the editor preview (components/timeline-editor.tsx) seek
 * an `@remotion/player` `<Player>` showing the composition to the frame that
 * corresponds to a given action marker, even though the marker's own
 * timestamp is in source time and the player's frame numbers are in
 * composition time.
 *
 * Returns null when `sourceSeconds` falls inside a cut range (excluded by
 * every clip) rather than clamping to the nearest clip boundary -- there is
 * no single frame in the assembled output that corresponds to a moment that
 * was cut out, and clamping would silently jump the seek to a different,
 * unrelated point in time.
 */
export function resolveCompositionTime(clips: EDLClip[], sourceSeconds: number): number | null {
  const EPSILON = 1e-6;
  let cursor = 0;

  for (const clip of clips) {
    const clipLength = clip.sourceEnd - clip.sourceStart;
    if (clipLength <= 0) continue;

    if (sourceSeconds >= clip.sourceStart - EPSILON && sourceSeconds <= clip.sourceEnd + EPSILON) {
      const offsetIntoClip = Math.min(Math.max(sourceSeconds - clip.sourceStart, 0), clipLength);
      return cursor + offsetIntoClip;
    }

    cursor += clipLength;
  }

  return null;
}
