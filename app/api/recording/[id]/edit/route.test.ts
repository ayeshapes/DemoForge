import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recording: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

import { GET, PUT } from "@/app/api/recording/[id]/edit/route";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/auth";

const mockedRequireUser = vi.mocked(requireUser);
const mockedFindUnique = vi.mocked(prisma.recording.findUnique);
const mockedUpdate = vi.mocked(prisma.recording.update);

const OWNER = { id: "user_1", clerkId: "clerk_1", email: "owner@example.com" };
const OTHER_CALLER = { id: "user_2", clerkId: "clerk_2", email: "other@example.com" };

const VALID_EDL = {
  version: 1,
  clips: [{ id: "clip_1", sourceStart: 0, sourceEnd: 10 }],
  effects: [],
};

// Missing `effects` entirely -- validateEdl requires it to be an array.
const INVALID_EDL = {
  version: 1,
  clips: [{ id: "clip_1", sourceStart: 0, sourceEnd: 10 }],
};

function getRequest(id: string) {
  return GET(new Request(`http://localhost/api/recording/${id}/edit`), { params: { id } });
}

function putRequest(id: string, body: unknown) {
  return PUT(
    new Request(`http://localhost/api/recording/${id}/edit`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } }
  );
}

describe("GET /api/recording/[id]/edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the editable recording (without leaking `project`) for the owner", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);
    mockedFindUnique.mockResolvedValue({
      id: "rec_1",
      duration: 30,
      videoUrl: "https://cdn.example/rec_1.webm",
      edl: VALID_EDL,
      project: { userId: "user_1" },
    } as any);

    const res = await getRequest("rec_1");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ id: "rec_1", duration: 30, videoUrl: "https://cdn.example/rec_1.webm", edl: VALID_EDL });
    expect(json.project).toBeUndefined();
  });

  it("404s (not 403) when the recording belongs to a different user", async () => {
    mockedRequireUser.mockResolvedValue(OTHER_CALLER as any);
    mockedFindUnique.mockResolvedValue({
      id: "rec_1",
      duration: 30,
      videoUrl: "https://cdn.example/rec_1.webm",
      edl: null,
      project: { userId: "user_1" },
    } as any);

    const res = await getRequest("rec_1");
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Recording not found" });
  });

  it("404s (not 403) when the recording doesn't exist", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);
    mockedFindUnique.mockResolvedValue(null);

    const res = await getRequest("does-not-exist");
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Recording not found" });
  });

  it("401s when the caller is not authenticated", async () => {
    mockedRequireUser.mockRejectedValue(new AuthError("Not authenticated"));

    const res = await getRequest("rec_1");
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Not authenticated" });
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });
});

describe("PUT /api/recording/[id]/edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a valid EDL for the owner", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);
    mockedFindUnique.mockResolvedValue({ project: { userId: "user_1" } } as any);
    mockedUpdate.mockResolvedValue({ id: "rec_1", edl: VALID_EDL } as any);

    const res = await putRequest("rec_1", { edl: VALID_EDL });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, recordingId: "rec_1", edl: VALID_EDL });
    expect(mockedUpdate).toHaveBeenCalledWith({ where: { id: "rec_1" }, data: { edl: VALID_EDL } });
  });

  it("rejects the save when validateEdl fails, and never touches the database", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);
    mockedFindUnique.mockResolvedValue({ project: { userId: "user_1" } } as any);

    const res = await putRequest("rec_1", { edl: INVALID_EDL });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/unsupported clip order, gap, or trim value/i);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("404s (not 403) when the recording belongs to a different user, before ever validating the EDL", async () => {
    mockedRequireUser.mockResolvedValue(OTHER_CALLER as any);
    mockedFindUnique.mockResolvedValue({ project: { userId: "user_1" } } as any);

    const res = await putRequest("rec_1", { edl: VALID_EDL });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Recording not found" });
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("404s (not 403) when the recording doesn't exist", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);
    mockedFindUnique.mockResolvedValue(null);

    const res = await putRequest("does-not-exist", { edl: VALID_EDL });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Recording not found" });
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("401s when the caller is not authenticated", async () => {
    mockedRequireUser.mockRejectedValue(new AuthError("Not authenticated"));

    const res = await putRequest("rec_1", { edl: VALID_EDL });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Not authenticated" });
    expect(mockedFindUnique).not.toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
