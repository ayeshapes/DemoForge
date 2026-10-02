import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    export: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(),
  AuthError: class AuthError extends Error {},
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET } from "@/app/api/recording/[id]/export/status/route";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/auth";

const mockedRequireUser = vi.mocked(requireUser);
const mockedFindFirst = vi.mocked(prisma.export.findFirst);

const OWNER = { id: "user_1", clerkId: "clerk_1", email: "owner@example.com" };
const OTHER_CALLER = { id: "user_2", clerkId: "clerk_2", email: "other@example.com" };

function statusRequest(recordingId: string, exportId?: string) {
  const url = new URL(`http://localhost/api/recording/${recordingId}/export/status`);
  if (exportId) url.searchParams.set("id", exportId);
  return GET(new NextRequest(url), { params: { id: recordingId } });
}

// A single fake export job, owned (via its recording's project) by user_1.
const FAKE_JOB = {
  id: "export_1",
  recordingId: "rec_1",
  status: "processing",
  fileUrl: null,
  error: null,
  aspectRatio: "16:9",
  format: "mp4",
  resolution: "1920x1080",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("GET /api/recording/[id]/export/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // findFirst here does the ownership check *inside* the query itself
    // (recording: { project: { userId } }), so the fake mirrors that: only
    // the matching id/recordingId/owner combination resolves to the job.
    mockedFindFirst.mockImplementation(async ({ where }: any) => {
      if (
        where.id === FAKE_JOB.id &&
        where.recordingId === FAKE_JOB.recordingId &&
        where.recording?.project?.userId === "user_1"
      ) {
        return FAKE_JOB as any;
      }
      return null;
    });
  });

  it("returns the export status for the owner", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);

    const res = await statusRequest("rec_1", "export_1");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ id: "export_1", recordingId: "rec_1", status: "processing" });
  });

  it("404s (not 403) when the recording/export belongs to a different user -- doesn't leak existence", async () => {
    mockedRequireUser.mockResolvedValue(OTHER_CALLER as any); // user_2, not the owner

    const res = await statusRequest("rec_1", "export_1");
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Export not found" });
  });

  it("404s (not 403) when the export id doesn't exist", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);

    const res = await statusRequest("rec_1", "does-not-exist");
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Export not found" });
  });

  it("400s when the `id` query param is missing", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);

    const res = await statusRequest("rec_1");
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "id is required" });
    expect(mockedFindFirst).not.toHaveBeenCalled();
  });

  it("401s when the caller is not authenticated", async () => {
    mockedRequireUser.mockRejectedValue(new AuthError("Not authenticated"));

    const res = await statusRequest("rec_1", "export_1");
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Not authenticated" });
    expect(mockedFindFirst).not.toHaveBeenCalled();
  });
});
