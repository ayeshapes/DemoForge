import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks -----------------------------------------------------------------
// `@/lib/prisma` is mocked with one vi.fn() per Prisma method actually used
// by this route. Each test configures the return value / implementation it
// needs rather than relying on a shared fake store, so behavior is explicit
// per test.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// `@/lib/auth` is mocked so tests can simulate both an authenticated caller
// (requireUser resolves to a user) and an unauthenticated one (requireUser
// rejects with AuthError, which every route maps to a 401).
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(),
  AuthError: class AuthError extends Error {},
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST, GET } from "@/app/api/projects/route";
import { prisma } from "@/lib/prisma";
import { requireUser, AuthError } from "@/lib/auth";

const mockedRequireUser = vi.mocked(requireUser);
const mockedCreate = vi.mocked(prisma.project.create);
const mockedFindMany = vi.mocked(prisma.project.findMany);

function postRequest(body: unknown) {
  return new Request("http://localhost/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const AUTHED_USER = { id: "user_1", clerkId: "clerk_1", email: "a@example.com" };

describe("POST /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a project with only a githubUrl (no deploymentUrl)", async () => {
    mockedRequireUser.mockResolvedValue(AUTHED_USER as any);
    mockedCreate.mockResolvedValue({ id: "proj_1" } as any);

    const res = await POST(
      postRequest({ name: "Widget Demo", githubUrl: "https://github.com/acme/widgets" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ id: "proj_1" });
    expect(mockedCreate).toHaveBeenCalledWith({
      data: {
        name: "Widget Demo",
        githubUrl: "https://github.com/acme/widgets",
        deploymentUrl: null,
        userId: "user_1",
      },
    });
  });

  it("creates a project with only a deploymentUrl (no githubUrl)", async () => {
    mockedRequireUser.mockResolvedValue(AUTHED_USER as any);
    mockedCreate.mockResolvedValue({ id: "proj_2" } as any);

    const res = await POST(
      postRequest({ name: "Widget Demo", deploymentUrl: "https://widgets.vercel.app" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ id: "proj_2" });
    expect(mockedCreate).toHaveBeenCalledWith({
      data: {
        name: "Widget Demo",
        githubUrl: null,
        deploymentUrl: "https://widgets.vercel.app",
        userId: "user_1",
      },
    });
  });

  it("400s when neither URL is provided (fails projectSchema before touching prisma)", async () => {
    mockedRequireUser.mockResolvedValue(AUTHED_USER as any);

    const res = await POST(postRequest({ name: "Widget Demo" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Provide a GitHub URL or deployed app URL");
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("401s when the caller is not authenticated", async () => {
    mockedRequireUser.mockRejectedValue(new AuthError("Not authenticated"));

    const res = await POST(postRequest({ name: "Widget Demo", githubUrl: "https://github.com/acme/widgets" }));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Not authenticated" });
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only returns projects belonging to the current user", async () => {
    mockedRequireUser.mockResolvedValue(AUTHED_USER as any);

    // A fake dataset spanning two different owners. findMany is implemented
    // to actually respect the `where.userId` clause the route passes in, so
    // this test fails if the route ever stops scoping the query to the
    // caller (e.g. if it queried `findMany({})` and relied on something
    // else to filter).
    const allProjects = [
      { id: "proj_mine_1", userId: "user_1", name: "Mine A" },
      { id: "proj_mine_2", userId: "user_1", name: "Mine B" },
      { id: "proj_other_1", userId: "user_2", name: "Not mine" },
    ];
    mockedFindMany.mockImplementation(async ({ where }: any) =>
      allProjects.filter((p) => p.userId === where.userId) as any
    );

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveLength(2);
    expect(json.map((p: any) => p.id).sort()).toEqual(["proj_mine_1", "proj_mine_2"]);
    expect(json.every((p: any) => p.userId === "user_1")).toBe(true);

    // Also assert the shape of the query itself: scoped to the caller,
    // newest first.
    expect(mockedFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_1" }, orderBy: { createdAt: "desc" } })
    );
  });

  it("401s when the caller is not authenticated", async () => {
    mockedRequireUser.mockRejectedValue(new AuthError("Not authenticated"));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Not authenticated" });
    expect(mockedFindMany).not.toHaveBeenCalled();
  });
});
