import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    const exportId = req.nextUrl.searchParams.get("id");

    if (!exportId) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const job = await prisma.export.findFirst({
      where: {
        id: exportId,
        recordingId: context.params.id,
        recording: { project: { userId: user.id } },
      },
      select: {
        id: true,
        recordingId: true,
        status: true,
        fileUrl: true,
        error: true,
        aspectRatio: true,
        format: true,
        resolution: true,
        createdAt: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    logger.error("Failed to load export status", e, { route: "GET /api/recording/[id]/export/status", recordingId: context.params.id });
    return NextResponse.json({ error: "Could not load export status. Check your connection and try again." }, { status: 500 });
  }
}
