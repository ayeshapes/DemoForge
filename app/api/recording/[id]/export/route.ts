import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { validateEdl } from "@/lib/edl";
import { requireUser, AuthError } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { capture, flushAnalytics } from "@/lib/analytics";

const RATIOS = {
  "16:9": "1920x1080",
  "9:16": "1080x1920",
  "1:1": "1080x1080",
} as const;

export async function POST(
  req: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const user = await requireUser();

    const body = await req.json().catch(() => ({}));
    const aspectRatio = body.aspectRatio || "16:9";
    const edlJson = body.edlJson;

    if (!(aspectRatio in RATIOS)) {
      return NextResponse.json({ error: "Unsupported aspect ratio" }, { status: 400 });
    }

    const recording = await prisma.recording.findUnique({
      where: { id: context.params.id },
      include: { project: { select: { userId: true } } },
    });

    if (!recording || recording.project.userId !== user.id) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    if (!recording.videoUrl || recording.videoUrl === "local://pending-upload") {
      return NextResponse.json(
        { error: "Recording video has not been uploaded to storage yet" },
        { status: 400 }
      );
    }

    const resolvedEdl = edlJson ?? recording.edl ?? undefined;
    if (resolvedEdl !== undefined && !validateEdl(resolvedEdl)) {
      return NextResponse.json({ error: "Invalid EDL" }, { status: 400 });
    }

    const exportRecord = await prisma.export.create({
      data: {
        recordingId: recording.id,
        status: "pending",
        format: "mp4",
        resolution: RATIOS[aspectRatio as keyof typeof RATIOS],
        aspectRatio,
        edlJson: resolvedEdl,
      },
    });

    await inngest.send({
      name: "demoforge/export.requested",
      data: {
        exportId: exportRecord.id,
        recordingId: recording.id,
        aspectRatio,
        edlJson: resolvedEdl,
      },
    });

    capture(user.id, "export_requested", {
      exportId: exportRecord.id,
      recordingId: recording.id,
      aspectRatio,
    });
    await flushAnalytics();

    return NextResponse.json({
      success: true,
      exportId: exportRecord.id,
      status: exportRecord.status,
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    logger.error("Failed to start export", error, { route: "POST /api/recording/[id]/export", recordingId: context.params.id });
    return NextResponse.json({ error: "Unable to start export. Check your connection and try again." }, { status: 500 });
  }
}
