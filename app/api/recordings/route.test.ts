import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
    },
    recording: {
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

// `createClient` itself is a plain vi.fn(); each test (or beforeEach below)
// controls what it returns, i.e. the fake `.storage.from(...).upload/getPublicUrl`
// surface the route calls.
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import { POST } from "@/app/api/recordings/route";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

const mockedRequireUser = vi.mocked(requireUser);
const mockedFindFirst = vi.mocked(prisma.project.findFirst);
const mockedRecordingCreate = vi.mocked(prisma.recording.create);
const mockedCreateClient = vi.mocked(createClient);

const AUTHED_USER = { id: "user_1", clerkId: "clerk_1", email: "a@example.com" };

let uploadMock: ReturnType<typeof vi.fn>;
let getPublicUrlMock: ReturnType<typeof vi.fn>;

function buildFormData(overrides: Partial<{ projectId: string; duration: string; actions: string; video: File | null }> = {}) {
  const fd = new FormData();
  const { projectId = "proj_1", duration = "12.5", actions = JSON.stringify([{ type: "click", timestamp: 1.2, x: 10, y: 20 }]), video = new File(["fake-bytes"], "recording.webm", { type: "video/webm" }) } = overrides;

  fd.set("projectId", projectId);
  fd.set("duration", duration);
  fd.set("actions", actions);
  if (video) fd.set("video", video);
  return fd;
}

function postRequest(fd: FormData) {
  return new Request("http://localhost/api/recordings", { method: "POST", body: fd });
}

describe("POST /api/recordings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

    uploadMock = vi.fn().mockResolvedValue({ error: null });
    getPublicUrlMock = vi.fn().mockReturnValue({ data: { publicUrl: "https://fake.supabase.co/recordings/recording.webm" } });
    mockedCreateClient.mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ upload: uploadMock, getPublicUrl: getPublicUrlMock }) },
    } as any);
  });

  it("saves a recording when the project belongs to the caller", async () => {
    mockedRequireUser.mockResolvedValue(AUTHED_USER as any);
    mockedFindFirst.mockResolvedValue({ id: "proj_1", userId: "user_1" } as any);
    mockedRecordingCreate.mockImplementation(async ({ data }: any) => ({ id: data.id, videoUrl: data.videoUrl } as any));

    const res = await POST(postRequest(buildFormData({ projectId: "proj_1" })));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.videoUrl).toBe("https://fake.supabase.co/recordings/recording.webm");
    expect(typeof json.id).toBe("string");

    // The ownership check is a *compound* lookup (id AND userId together),
    // not "find the project, then separately check its owner" -- assert the
    // exact where-clause shape so a regression that loosens this back to
    // `findFirst({ where: { id: projectId } })` fails loudly.
    expect(mockedFindFirst).toHaveBeenCalledWith({ where: { id: "proj_1", userId: "user_1" } });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(mockedRecordingCreate).toHaveBeenCalledTimes(1);
    const createArg = mockedRecordingCreate.mock.calls[0][0] as any;
    expect(createArg.data.projectId).toBe("proj_1");
    expect(createArg.data.duration).toBe(12.5);
    expect(createArg.data.actions.create).toEqual([
      { type: "click", timestamp: 1.2, x: 10, y: 20, metadata: null },
    ]);
  });

  it(
    // DF-17 regression test: this is the single most important test in this
    // suite. Before DF-17, the route trusted a bare `projectId` off the
    // request and only checked that *a* project with that id existed --
    // never that it belonged to the caller. That let any signed-in user
    // attach a recording (and its upload) to any other user's project by
    // guessing/reusing an id. The fix scopes the lookup to
    // `{ id: projectId, userId: user.id }`; this test fails if that
    // ownership scoping is ever removed or loosened.
    "rejects an upload to a projectId that exists but belongs to a different user",
    async () => {
      mockedRequireUser.mockResolvedValue(AUTHED_USER as any); // caller is user_1
      // The project genuinely exists -- just not owned by user_1. Our fake
      // findFirst mirrors real Prisma semantics: a where clause that
      // combines id + userId returns null when the row exists under a
      // different owner, it doesn't 500 or silently ignore the userId part.
      mockedFindFirst.mockImplementation(async ({ where }: any) => {
        const projectsById: Record<string, { id: string; userId: string }> = {
          proj_victim: { id: "proj_victim", userId: "user_2" },
        };
        const project = projectsById[where.id];
        if (!project || project.userId !== where.userId) return null;
        return project as any;
      });

      const res = await POST(postRequest(buildFormData({ projectId: "proj_victim" })));
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json).toEqual({ error: "Project not found" });

      // Nothing about the attacker's payload should ever reach storage or
      // the database once ownership fails.
      expect(uploadMock).not.toHaveBeenCalled();
      expect(mockedRecordingCreate).not.toHaveBeenCalled();
    }
  );

  it("404s when the projectId does not exist at all", async () => {
    mockedRequireUser.mockResolvedValue(AUTHED_USER as any);
    mockedFindFirst.mockResolvedValue(null);

    const res = await POST(postRequest(buildFormData({ projectId: "does-not-exist" })));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json).toEqual({ error: "Project not found" });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("400s when the video file is missing", async () => {
    mockedRequireUser.mockResolvedValue(AUTHED_USER as any);

    const res = await POST(postRequest(buildFormData({ video: null })));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "Missing recording" });
    expect(mockedFindFirst).not.toHaveBeenCalled();
  });

  it("401s when the caller is not authenticated", async () => {
    mockedRequireUser.mockRejectedValue(new AuthError("Not authenticated"));

    const res = await POST(postRequest(buildFormData()));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Not authenticated" });
    expect(mockedFindFirst).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
