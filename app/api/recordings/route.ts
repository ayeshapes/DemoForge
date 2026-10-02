import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { requireUser, AuthError } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Supabase storage is not configured" }, { status: 500 });
    }

    const fd = await req.formData();
    const projectId = String(fd.get("projectId") || "");
    const duration = Number(fd.get("duration") || 0);
    const actions = JSON.parse(String(fd.get("actions") || "[]"));
    const video = fd.get("video");

    if (!projectId || !(video instanceof File)) {
      return NextResponse.json({ error: "Missing recording" }, { status: 400 });
    }

    // Ownership check: the project must belong to the authenticated user,
    // not just exist. Without this, any signed-in user could attach a
    // recording to any project by id.
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: user.id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const recordingId = crypto.randomUUID();
    const storagePath = `recordings/${recordingId}/recording.webm`;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const buffer = Buffer.from(await video.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("demoforge-videos")
      .upload(storagePath, buffer, {
        contentType: "video/webm",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Recording upload failed: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage
      .from("demoforge-videos")
      .getPublicUrl(storagePath);

    const rec = await prisma.recording.create({
      data: {
        id: recordingId,
        projectId,
        videoUrl: urlData.publicUrl,
        duration,
        status: "complete",
        actions: {
          create: actions.map((a: any) => ({
            type: String(a.type),
            timestamp: Number(a.timestamp),
            x: a.x == null ? null : Number(a.x),
            y: a.y == null ? null : Number(a.y),
            metadata: a.metadata ?? null,
          })),
        },
      },
    });

    return NextResponse.json({ id: rec.id, videoUrl: urlData.publicUrl });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // The upload-failure branch above throws a message that's already safe
    // and specific to show the user (it names the Supabase storage error,
    // not internal detail); everything else — a DB write failing after a
    // successful upload, a malformed `actions` payload, etc — is an
    // unexpected server fault and gets a generic message instead.
    const isKnownUploadFailure = e instanceof Error && e.message.startsWith("Recording upload failed");
    logger.error("Failed to save recording", e, { route: "POST /api/recordings" });
    return NextResponse.json(
      {
        error: isKnownUploadFailure
          ? (e as Error).message
          : "Could not save the recording. The video may not have uploaded — check your connection and try again.",
      },
      { status: 500 }
    );
  }
}
