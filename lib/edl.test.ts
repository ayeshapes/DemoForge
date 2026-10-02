import { describe, expect, it } from "vitest";
import {
  makeDefaultEdl,
  validateEdl,
  getClipsDurationSeconds,
  resolveSourceTime,
  resolveCompositionTime,
  type EDL,
  type EDLClip,
} from "@/lib/edl";

describe("makeDefaultEdl", () => {
  it("creates a single clip spanning the full duration", () => {
    const edl = makeDefaultEdl(10);

    expect(edl.version).toBe(1);
    expect(edl.effects).toEqual([]);
    expect(edl.clips).toHaveLength(1);
    expect(edl.clips[0]).toMatchObject({ sourceStart: 0, sourceEnd: 10 });
    expect(typeof edl.clips[0].id).toBe("string");
  });

  it("produces no clips for a non-positive duration", () => {
    expect(makeDefaultEdl(0).clips).toEqual([]);
    expect(makeDefaultEdl(-5).clips).toEqual([]);
  });
});

describe("validateEdl", () => {
  it("accepts an EDL with empty clips and effects", () => {
    const edl: EDL = { version: 1, clips: [], effects: [] };
    expect(validateEdl(edl)).toBe(true);
  });

  it("accepts an EDL with a single valid clip", () => {
    const edl: EDL = {
      version: 1,
      clips: [{ id: "c1", sourceStart: 0, sourceEnd: 5 }],
      effects: [],
    };
    expect(validateEdl(edl)).toBe(true);
  });

  it("accepts multiple valid clips and a mix of effect types, including freeze-frame without start/end", () => {
    const edl: EDL = {
      version: 1,
      clips: [
        { id: "c1", sourceStart: 0, sourceEnd: 5 },
        { id: "c2", sourceStart: 10, sourceEnd: 15 },
      ],
      effects: [
        { id: "e1", type: "zoom", start: 0, end: 2, scale: 1.5, x: 0.1, y: 0.2 },
        { id: "e2", type: "freeze-frame", at: 3, duration: 1 },
      ],
    };
    expect(validateEdl(edl)).toBe(true);
  });

  it("rejects null and non-object input", () => {
    expect(validateEdl(null)).toBe(false);
    expect(validateEdl(undefined)).toBe(false);
    expect(validateEdl("not an edl")).toBe(false);
    expect(validateEdl(42)).toBe(false);
  });

  it("rejects a bad version number", () => {
    const edl = { version: 2, clips: [], effects: [] };
    expect(validateEdl(edl)).toBe(false);
  });

  it("rejects when clips or effects is not an array", () => {
    expect(validateEdl({ version: 1, clips: "nope", effects: [] })).toBe(false);
    expect(validateEdl({ version: 1, clips: [], effects: "nope" })).toBe(false);
  });

  it("rejects a clip where sourceEnd <= sourceStart", () => {
    const edl = {
      version: 1,
      clips: [{ id: "c1", sourceStart: 5, sourceEnd: 5 }],
      effects: [],
    };
    expect(validateEdl(edl)).toBe(false);
  });

  it("rejects a clip with a negative sourceStart", () => {
    const edl = {
      version: 1,
      clips: [{ id: "c1", sourceStart: -1, sourceEnd: 5 }],
      effects: [],
    };
    expect(validateEdl(edl)).toBe(false);
  });

  it("rejects a clip missing an id", () => {
    const edl = {
      version: 1,
      clips: [{ sourceStart: 0, sourceEnd: 5 }],
      effects: [],
    };
    expect(validateEdl(edl)).toBe(false);
  });

  it("rejects an effect missing an id", () => {
    const edl = {
      version: 1,
      clips: [],
      effects: [{ type: "zoom", start: 0, end: 2, scale: 1, x: 0, y: 0 }],
    };
    expect(validateEdl(edl)).toBe(false);
  });

  it("rejects an effect missing a type", () => {
    const edl = {
      version: 1,
      clips: [],
      effects: [{ id: "e1", start: 0, end: 2 }],
    };
    expect(validateEdl(edl)).toBe(false);
  });

  it("rejects a non-freeze-frame effect where end <= start", () => {
    const edl = {
      version: 1,
      clips: [],
      effects: [{ id: "e1", type: "text", start: 5, end: 5, text: "hi", x: 0.1, y: 0.1, fontSize: 12 }],
    };
    expect(validateEdl(edl)).toBe(false);
  });
});

describe("getClipsDurationSeconds", () => {
  it("returns 0 for an empty clip list", () => {
    expect(getClipsDurationSeconds([])).toBe(0);
  });

  it("returns the clip's own length for a single clip", () => {
    const clips: EDLClip[] = [{ id: "c1", sourceStart: 2, sourceEnd: 7 }];
    expect(getClipsDurationSeconds(clips)).toBe(5);
  });

  it("sums durations across multiple clips regardless of gaps between source ranges", () => {
    const clips: EDLClip[] = [
      { id: "c1", sourceStart: 0, sourceEnd: 5 }, // 5s
      { id: "c2", sourceStart: 10, sourceEnd: 15 }, // 5s, gap of 5s is cut out
    ];
    expect(getClipsDurationSeconds(clips)).toBe(10);
  });

  it("treats a degenerate clip (sourceEnd <= sourceStart) as contributing 0", () => {
    const clips: EDLClip[] = [
      { id: "c1", sourceStart: 5, sourceEnd: 5 },
      { id: "c2", sourceStart: 0, sourceEnd: 3 },
    ];
    expect(getClipsDurationSeconds(clips)).toBe(3);
  });
});

describe("resolveSourceTime", () => {
  it("returns null for an empty clip list", () => {
    expect(resolveSourceTime([], 0)).toBeNull();
  });

  it("resolves a point inside a single clip", () => {
    const clips: EDLClip[] = [{ id: "c1", sourceStart: 2, sourceEnd: 7 }];
    expect(resolveSourceTime(clips, 1)).toBe(3);
  });

  it("walks past earlier clips to resolve a point in a later clip, jumping over the cut", () => {
    const clips: EDLClip[] = [
      { id: "c1", sourceStart: 0, sourceEnd: 5 }, // composition [0, 5)
      { id: "c2", sourceStart: 10, sourceEnd: 15 }, // composition [5, 10), source cut [5, 10)
    ];

    expect(resolveSourceTime(clips, 3)).toBe(3); // inside first clip
    expect(resolveSourceTime(clips, 7)).toBe(12); // inside second clip, past the cut
  });

  it("returns null when compositionSeconds exceeds the total assembled duration", () => {
    const clips: EDLClip[] = [
      { id: "c1", sourceStart: 0, sourceEnd: 5 },
      { id: "c2", sourceStart: 10, sourceEnd: 15 },
    ];
    expect(resolveSourceTime(clips, 10.5)).toBeNull();
  });

  it("skips zero-length clips when walking", () => {
    const clips: EDLClip[] = [
      { id: "zero", sourceStart: 2, sourceEnd: 2 },
      { id: "c1", sourceStart: 0, sourceEnd: 5 },
    ];
    expect(resolveSourceTime(clips, 3)).toBe(3);
  });
});

describe("resolveCompositionTime", () => {
  it("returns null for an empty clip list", () => {
    expect(resolveCompositionTime([], 0)).toBeNull();
  });

  it("resolves a point inside a single clip", () => {
    const clips: EDLClip[] = [{ id: "c1", sourceStart: 2, sourceEnd: 7 }];
    expect(resolveCompositionTime(clips, 5)).toBe(3);
  });

  it("resolves points across multiple clips, offsetting by prior clip lengths", () => {
    const clips: EDLClip[] = [
      { id: "c1", sourceStart: 0, sourceEnd: 5 },
      { id: "c2", sourceStart: 10, sourceEnd: 15 },
    ];
    expect(resolveCompositionTime(clips, 3)).toBe(3); // inside first clip
    expect(resolveCompositionTime(clips, 12)).toBe(7); // inside second clip
  });

  it("returns null for a source timestamp that falls inside a cut range between clips", () => {
    const clips: EDLClip[] = [
      { id: "c1", sourceStart: 0, sourceEnd: 5 },
      { id: "c2", sourceStart: 10, sourceEnd: 15 }, // [5, 10) was cut out
    ];
    expect(resolveCompositionTime(clips, 7)).toBeNull();
  });

  it("returns null for a source timestamp before the first clip or after the last", () => {
    const clips: EDLClip[] = [
      { id: "c1", sourceStart: 0, sourceEnd: 5 },
      { id: "c2", sourceStart: 10, sourceEnd: 15 },
    ];
    expect(resolveCompositionTime(clips, -1)).toBeNull();
    expect(resolveCompositionTime(clips, 20)).toBeNull();
  });
});
