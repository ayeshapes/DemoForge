import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(_: Request, context: { params: { id: string } }) {
  try {
    const user = await requireUser();

    const recording = await prisma.recording.findUnique({
      where: { id: context.params.id },
      include: {
        actions: { orderBy: { timestamp: "asc" } },
        project: true
      }
    });

    // A recording belongs to a project, which belongs to a user — ownership
    // is checked through that chain, same pattern as every other route here.
    if (!recording || recording.project.userId !== user.id) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    return NextResponse.json(recording);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    logger.error("Failed to load recording", e, { route: "GET /api/recording/[id]", recordingId: context.params.id });
    return NextResponse.json({ error: "Could not load this recording. Check your connection and try again." }, { status: 500 });
  }
}
