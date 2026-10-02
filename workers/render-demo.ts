import { prisma } from "../lib/prisma.ts";
import path from "node:path";
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { getRemotionServeUrl } from "../lib/remotion-bundle.ts";
import type { EDL } from "../lib/edl.ts";

// Built lazily, not at module load: this module is imported (via
// lib/inngest/functions.ts) by every server bundle, including the E2E
// suite's `npm run dev`, which sets DEMOFORGE_STUB_RENDER instead of real
// Supabase credentials (see below and playwright.config.ts). Constructing
// the client at import time with an empty/missing URL throws immediately
// ("supabaseUrl is required") and takes the whole server down before the
// stub guard ever gets a chance to run.
let supabase: SupabaseClient | null = null;
function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabase;
}

interface RenderOptions {
  exportId: string;
  recordingId: string;
  aspectRatio: string;
  edlJson?: unknown;
}

const dimensions: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

const COMPOSITION_ID = "Demo";

const emptyEdl: EDL = { version: 1, clips: [], effects: [] };

export async function renderDemoVideo({
  exportId,
  recordingId,
  aspectRatio,
  edlJson,
}: RenderOptions): Promise<string> {
  // DF-21.6: short-circuits the real Remotion/Chromium/FFmpeg render (and
  // the Supabase upload after it) for the E2E suite -- see
  // playwright.config.ts's webServer, which sets this for every E2E run.
  // Headless CI has neither a GPU/Chromium sandbox suited to Remotion's
  // renderer nor Supabase storage credentials, and no E2E test today
  // exercises the rendered output itself (see e2e/*.spec.ts), so there's
  // nothing to gain from actually rendering. This is only ever read from
  // `process.env`, which the E2E webServer config controls -- never from
  // request input -- so it can't be tripped from an untrusted export request.
  if (process.env.DEMOFORGE_STUB_RENDER === "1") {
    return `https://stub.demoforge.test/exports/${exportId}/output.mp4`;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase storage environment variables are not configured.");
  }

  const recording = await prisma.recording.findUnique({
    where: { id: recordingId },
  });

  if (!recording?.videoUrl) {
    throw new Error("Recording or source video URL not found.");
  }

  const size = dimensions[aspectRatio];
  if (!size) throw new Error(`Unsupported aspect ratio: ${aspectRatio}`);

  // The EDL is carried through the job contract and passed straight into
  // DemoComposition as `defaultProps`/`inputProps`. Output dimensions come from
  // the Remotion composition's width/height (below) rather than a separate FFmpeg
  // scale/pad filter -- see DF-07.
  const rawEdl: EDL = (edlJson as EDL) ?? emptyEdl;

  // DF-08: an EDL with no clips (never edited, or cut down to nothing) has no
  // rendered output otherwise -- fall back to a single clip covering the whole
  // recording, same as lib/edl.ts's makeDefaultEdl(), so "no edits yet" renders
  // the full source video instead of a blank clip.
  const clips =
    rawEdl.clips.length > 0
      ? rawEdl.clips
      : recording.duration > 0
        ? [{ id: "full", sourceStart: 0, sourceEnd: recording.duration }]
        : [];
  const edl: EDL = { ...rawEdl, clips };

  const tmpDir = path.join("/tmp", `demoforge-${exportId}`);
  const outputVideoPath = path.join(tmpDir, "output.mp4");

  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // DF-07a: read the pre-bundled `serveUrl` produced by `npm run bundle:remotion`
    // at build/deploy time. We never call bundle() here -- that would add a webpack
    // compile to every export job.
    const serveUrl = getRemotionServeUrl();

    const inputProps = {
      videoUrl: recording.videoUrl,
      edl,
    };

    // DF-13: durationInFrames comes from `baseComposition` itself now.
    // `selectComposition()` runs the `Demo` composition's `calculateMetadata`
    // (remotion/Root.tsx) against these same `inputProps`, which derives
    // durationInFrames from `edl.clips` the same way this worker used to by
    // hand -- so there's one place (Root.tsx) computing it instead of two.
    // DF-08: that's still the *assembled* (post-cut) duration -- the sum of the
    // clips' lengths, not the raw recording length -- so cut ranges shorten the
    // rendered output instead of leaving trailing frames with nothing left to
    // show. Only width/height are overridden here, for the requested aspect
    // ratio; fps is fixed by the composition itself.
    const baseComposition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });

    await renderMedia({
      composition: {
        ...baseComposition,
        width: size.width,
        height: size.height,
      },
      serveUrl,
      codec: "h264",
      outputLocation: outputVideoPath,
      inputProps,
    });

    const fileBuffer = fs.readFileSync(outputVideoPath);
    const storagePath = `exports/${exportId}/output.mp4`;

    const { error: uploadError } = await getSupabaseClient()
      .storage.from("demoforge-videos")
      .upload(storagePath, fileBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload rendered video to Supabase: ${uploadError.message}`);
    }

    const { data: publicUrlData } = getSupabaseClient()
      .storage.from("demoforge-videos")
      .getPublicUrl(storagePath);

    return publicUrlData.publicUrl;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
