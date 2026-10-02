import { inngest } from "./client.ts";
import { prisma } from "../prisma.ts";
import { renderDemoVideo } from "../../workers/render-demo.ts";
import { logger } from "../logger.ts";
import { capture, flushAnalytics } from "../analytics.ts";

/**
 * The export.requested event only carries recordingId, not the owning
 * user — so both the completion and failure paths look the owner up
 * through the recording -> project chain to attribute the PostHog event
 * to the right distinct id, the same ownership chain every route in this
 * app uses. Best-effort: if the recording/project lookup itself fails
 * (e.g. it was deleted mid-render), the event is skipped rather than
 * throwing out of an analytics call.
 */
async function getOwnerId(recordingId: string): Promise<string | null> {
  try {
    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
      select: { project: { select: { userId: true } } },
    });
    return recording?.project.userId ?? null;
  } catch (err) {
    logger.debug("Could not resolve export owner for analytics", { recordingId, error: String(err) });
    return null;
  }
}

export const handleExportJob = inngest.createFunction(
  {
    id: "render-export-job",
    retries: 1,
    onFailure: async ({ event, error }) => {
      const { exportId, recordingId } = event.data.event.data;
      await prisma.export.update({
        where: { id: exportId },
        data: {
          status: "failed",
          error: error.message,
        },
      });

      logger.error("Export job failed", error, { exportId, recordingId });

      const ownerId = await getOwnerId(recordingId);
      if (ownerId) {
        capture(ownerId, "export_failed", { exportId, recordingId, error: error.message });
        await flushAnalytics();
      }
    },
  },
  { event: "demoforge/export.requested" },
  async ({ event, step }) => {
    const { exportId, recordingId, aspectRatio, edlJson } = event.data;

    await step.run("set-processing", async () => {
      await prisma.export.update({
        where: { id: exportId },
        data: { status: "processing", error: null },
      });
    });

    const videoUrl = await step.run("render-video", async () => {
      return await renderDemoVideo({
        exportId,
        recordingId,
        aspectRatio,
        edlJson,
      });
    });

    await step.run("complete-export", async () => {
      await prisma.export.update({
        where: { id: exportId },
        data: {
          status: "done",
          fileUrl: videoUrl,
          error: null,
        },
      });
    });

    const ownerId = await getOwnerId(recordingId);
    if (ownerId) {
      capture(ownerId, "export_completed", { exportId, recordingId, aspectRatio });
      await flushAnalytics();
    }

    return { success: true, exportId };
  }
);
