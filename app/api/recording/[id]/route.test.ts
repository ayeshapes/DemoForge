import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recording: {
      findUnique: vi.fn(),
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

import { GET } from "@/app/api/recording/[id]/route";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/auth";

const mockedRequireUser = vi.mocked(requireUser);
const mockedFindUnique = vi.mocked(prisma.recording.findUnique);

const OWNER = { id: "user_1", clerkId: "clerk_1", email: "owner@example.com" };
const OTHER_CALLER = { id: "user_2", clerkId: "clerk_2", email: "other@example.com" };

function getRequest(id: string) {
  return GET(new Request(`http://localhost/api/recording/${id}`), { params: { id } });
}

describe("GET /api/recording/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the recording (with its actions) for the owner", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);
    mockedFindUnique.mockResolvedValue({
      id: "rec_1",
      videoUrl: "https://cdn.example/rec_1.webm",
      duration: 30,
      actions: [{ id: "act_1", type: "click", timestamp: 1 }],
      project: { id: "proj_1", userId: "user_1" },
    } as any);

    const res = await getRequest("rec_1");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe("rec_1");
    expect(json.actions).toHaveLength(1);
    expect(mockedFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rec_1" } })
    );
  });

  it("404s (never 403) when the recording doesn't exist at all", async () => {
    mockedRequireUser.mockResolvedValue(OWNER as any);
    mockedFindUnique.mockResolvedValue(null);

    const res = await getRequest("does-not-exist");
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Recording not found" });
  });

  it("404s (never 403) when the recording exists but belongs to a different user -- doesn't leak existence", async () => {
    mockedRequireUser.mockResolvedValue(OTHER_CALLER as any);
    mockedFindUnique.mockResolvedValue({
      id: "rec_1",
      videoUrl: "https://cdn.example/rec_1.webm",
      duration: 30,
      actions: [],
      project: { id: "proj_1", userId: "user_1" }, // owned by someone else
    } as any);

    const res = await getRequest("rec_1");
    const json = await res.json();

    // Same shape/status as "doesn't exist" -- a caller can't distinguish
    // "not yours" from "never existed".
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
