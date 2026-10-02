import { describe, expect, it } from "vitest";
import { validateEnv } from "@/lib/env";

const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/demoforge",
  NEXT_PUBLIC_SUPABASE_URL: "https://xyz.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
  CLERK_SECRET_KEY: "sk_test_abc",
};

const REQUIRED_WORKER_ENV = {
  DATABASE_URL: REQUIRED_ENV.DATABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: REQUIRED_ENV.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: REQUIRED_ENV.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
  CLERK_SECRET_KEY: undefined,
};

// `validateEnv()` reads `process.env` directly (that's the point -- it's
// what actually runs at startup), so these tests mutate and restore it
// rather than passing a fake env object in.
function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const original = { ...process.env };
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of Object.keys(overrides)) delete process.env[key];
    Object.assign(process.env, original);
  }
}

describe("validateEnv", () => {
  it("passes with every required var set and no optional ones", () => {
    withEnv({ ...REQUIRED_ENV }, () => {
      expect(() => validateEnv()).not.toThrow();
      expect(() => validateEnv("web")).not.toThrow();
    });
  });

  it("worker passes with only its required vars and no Clerk vars", () => {
    withEnv({ ...REQUIRED_WORKER_ENV }, () => {
      expect(() => validateEnv("worker")).not.toThrow();
    });
  });

  it.each(["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])(
    "worker throws naming %s when it is missing",
    (missingKey) => {
      withEnv({ ...REQUIRED_WORKER_ENV, [missingKey]: undefined }, () => {
        expect(() => validateEnv("worker")).toThrow(new RegExp(missingKey));
      });
    }
  );

  it("worker does not require Clerk vars even when they are absent", () => {
    withEnv(
      {
        ...REQUIRED_WORKER_ENV,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
        CLERK_SECRET_KEY: undefined,
      },
      () => {
        expect(() => validateEnv("worker")).not.toThrow();
      }
    );
  });

  it("uses the worker schema by default when DEMOFORGE_TARGET=worker", () => {
    withEnv(
      {
        ...REQUIRED_WORKER_ENV,
        DEMOFORGE_TARGET: "worker",
      },
      () => {
        expect(() => validateEnv()).not.toThrow();
      }
    );
  });

  it("passes with optional vars also set", () => {
    withEnv(
      {
        ...REQUIRED_ENV,
        GITHUB_TOKEN: "ghp_abc",
        POSTHOG_KEY: "phc_abc",
        REMOTION_SERVE_URL: "https://cdn.example.com/bundle",
      },
      () => {
        expect(() => validateEnv()).not.toThrow();
        expect(() => validateEnv("web")).not.toThrow();
      }
    );
  });

  it.each(Object.keys(REQUIRED_ENV))("throws naming %s when it's missing entirely", (missingKey) => {
    withEnv({ ...REQUIRED_ENV, [missingKey]: undefined }, () => {
      expect(() => validateEnv()).toThrow(new RegExp(missingKey));
    });
  });

  it.each(Object.keys(REQUIRED_ENV))("treats an empty-string %s the same as missing", (blankKey) => {
    withEnv({ ...REQUIRED_ENV, [blankKey]: "" }, () => {
      expect(() => validateEnv()).toThrow(new RegExp(blankKey));
    });
  });

  it("lists every missing required var at once, not just the first", () => {
    withEnv(
      { ...REQUIRED_ENV, DATABASE_URL: undefined, CLERK_SECRET_KEY: undefined },
      () => {
        try {
          validateEnv();
          throw new Error("expected validateEnv() to throw");
        } catch (e) {
          const message = (e as Error).message;
          expect(message).toMatch(/DATABASE_URL/);
          expect(message).toMatch(/CLERK_SECRET_KEY/);
        }
      }
    );
  });

  it("rejects a NEXT_PUBLIC_SUPABASE_URL that isn't a valid URL", () => {
    withEnv({ ...REQUIRED_ENV, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }, () => {
      expect(() => validateEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    });
  });

  it("rejects a REMOTION_SERVE_URL that isn't a valid URL, when set", () => {
    withEnv({ ...REQUIRED_ENV, REMOTION_SERVE_URL: "not-a-url" }, () => {
      expect(() => validateEnv()).toThrow(/REMOTION_SERVE_URL/);
    });
  });

  it("doesn't require GITHUB_TOKEN/POSTHOG_KEY/REMOTION_SERVE_URL at all", () => {
    withEnv(
      {
        ...REQUIRED_ENV,
        GITHUB_TOKEN: undefined,
        POSTHOG_KEY: undefined,
        NEXT_PUBLIC_POSTHOG_KEY: undefined,
        REMOTION_SERVE_URL: undefined,
      },
      () => {
        expect(() => validateEnv()).not.toThrow();
      }
    );
  });

  it("treats an explicitly blank optional var (uncommented but empty) as unset rather than invalid", () => {
    withEnv({ ...REQUIRED_ENV, GITHUB_TOKEN: "" }, () => {
      expect(() => validateEnv()).not.toThrow();
    });
  });
});
