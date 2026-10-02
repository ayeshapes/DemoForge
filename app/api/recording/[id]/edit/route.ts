import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateEdl } from "@/lib/edl";
import { requireUser, AuthError } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(_: NextRequest, context: { params: { id: string } }) {
  try {
    const user = await requireUser();

    const recording = await prisma.recording.findUnique({
      where: { id: context.params.id },
      select: { id: true, duration: true, videoUrl: true, edl: true, project: { select: { userId: true } } }
    });

    if (!recording || recording.project.userId !== user.id) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const { project, ...rest } = recording;
    return NextResponse.json(rest);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    logger.error("Failed to load recording for editing", e, { route: "GET /api/recording/[id]/edit", recordingId: context.params.id });
    return NextResponse.json({ error: "Could not load this recording for editing. Check your connection and try again." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: { params: { id: string } }) {
  try {
    const user = await requireUser();

    const owner = await prisma.recording.findUnique({
      where: { id: context.params.id },
      select: { project: { select: { userId: true } } }
    });
    if (!owner || owner.project.userId !== user.id) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const { edl } = await req.json().catch(() => ({ edl: undefined }));
    if (!validateEdl(edl)) {
      return NextResponse.json(
        { error: "Invalid edit: the timeline has an unsupported clip order, gap, or trim value." },
        { status: 400 }
      );
    }

    const recording = await prisma.recording.update({
      where: { id: context.params.id },
      data: { edl }
    });

    return NextResponse.json({ ok: true, recordingId: recording.id, edl });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    logger.error("Failed to save recording edit", e, { route: "PUT /api/recording/[id]/edit", recordingId: context.params.id });
    return NextResponse.json({ error: "Could not save your edit. Check your connection and try again." }, { status: 500 });
  }
}
