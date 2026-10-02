import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recording: {
      findUnique: vi.fn(),
    },
    export: {
      create: vi.fn(),
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

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

import { POST } from "@/app/api/recording/[id]/export/route";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/auth";
import { inngest } from "@/lib/inngest/client";

const mockedRequireUser = vi.mocked(requireUser);
const mockedFindUnique = vi.mocked(prisma.recording.findUnique);
const mockedExportCreate = vi.mocked(prisma.export.create);
const mockedInngestSend = vi.mocked(inngest.send);

const OWNER = { id: "user_1", clerkId: "clerk_1", email: "owner@example.com" };
const OTHER_CALLER = { id: "user_2", clerkId: "clerk_2", email: "other@example.com" };

function postRequest(id: string, body: unknown = {}) {
  return POST(
    new Request(`http://localhost/api/recording/${id}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } }
  );
}

describe("POST /api/recording/[id]/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts an export job for the owner", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);
    mockedFindUnique.mockResolvedValue({
      id: "rec_1",
      videoUrl: "https://cdn.example/rec_1.webm",
      edl: null,
      project: { userId: "user_1" },
    } as any);
    mockedExportCreate.mockResolvedValue({ id: "export_1", status: "pending" } as any);
    mockedInngestSend.mockResolvedValue(undefined as any);

    const res = await postRequest("rec_1", { aspectRatio: "9:16" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, exportId: "export_1", status: "pending" });
    expect(mockedExportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recordingId: "rec_1",
          status: "pending",
          aspectRatio: "9:16",
          resolution: "1080x1920",
        }),
      })
    );
    expect(mockedInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "demoforge/export.requested",
        data: expect.objectContaining({ exportId: "export_1", recordingId: "rec_1" }),
      })
    );
  });

  it("404s (not 403) when the recording belongs to a different user, and never enqueues a render job", async () => {
    mockedRequireUser.mockResolvedValue(OTHER_CALLER as any);
    mockedFindUnique.mockResolvedValue({
      id: "rec_1",
      videoUrl: "https://cdn.example/rec_1.webm",
      edl: null,
      project: { userId: "user_1" }, // owned by someone else
    } as any);

    const res = await postRequest("rec_1");
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Recording not found" });
    expect(mockedExportCreate).not.toHaveBeenCalled();
    expect(mockedInngestSend).not.toHaveBeenCalled();
  });

  it("404s (not 403) when the recording doesn't exist", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);
    mockedFindUnique.mockResolvedValue(null);

    const res = await postRequest("does-not-exist");
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Recording not found" });
    expect(mockedExportCreate).not.toHaveBeenCalled();
  });

  it("401s when the caller is not authenticated", async () => {
    mockedRequireUser.mockRejectedValue(new AuthError("Not authenticated"));

    const res = await postRequest("rec_1");
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Not authenticated" });
    expect(mockedFindUnique).not.toHaveBeenCalled();
    expect(mockedInngestSend).not.toHaveBeenCalled();
  });
});
