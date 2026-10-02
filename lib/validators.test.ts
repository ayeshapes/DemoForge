import { describe, expect, it } from "vitest";
import { projectSchema } from "@/lib/validators";

describe("projectSchema", () => {
  it("accepts a project with only a githubUrl", () => {
    const result = projectSchema.safeParse({
      name: "Demo Project",
      githubUrl: "https://github.com/acme/widgets",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a project with only a deploymentUrl", () => {
    const result = projectSchema.safeParse({
      name: "Demo Project",
      deploymentUrl: "https://widgets.vercel.app",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a project with neither a githubUrl nor a deploymentUrl", () => {
    const result = projectSchema.safeParse({ name: "Demo Project" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "Provide a GitHub URL or deployed app URL")).toBe(
        true
      );
    }
  });

  it("also rejects when both URL fields are present but explicitly empty strings", () => {
    const result = projectSchema.safeParse({ name: "Demo Project", githubUrl: "", deploymentUrl: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed githubUrl", () => {
    const result = projectSchema.safeParse({ name: "Demo Project", githubUrl: "not-a-url" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("githubUrl"))).toBe(true);
    }
  });

  it("rejects a malformed deploymentUrl", () => {
    const result = projectSchema.safeParse({ name: "Demo Project", deploymentUrl: "not-a-url" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("deploymentUrl"))).toBe(true);
    }
  });

  it("rejects an empty name", () => {
    const result = projectSchema.safeParse({
      name: "",
      githubUrl: "https://github.com/acme/widgets",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("name"))).toBe(true);
    }
  });
});
