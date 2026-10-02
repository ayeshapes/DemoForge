import { z } from "zod";

/**
 * Startup env-var validation.
 *
 * Without this, a misconfigured deploy boots fine and then fails deep
 * inside whichever route handler happens to touch the bad value first --
 * a missing DATABASE_URL surfacing as a raw Prisma connection error on the
 * first request, a missing SUPABASE_SERVICE_ROLE_KEY surfacing as an
 * upload failure only once someone tries to record something, etc.
 * `validateEnv()` parses `process.env` against the web or worker schema once,
 * at startup (see `lib/prisma.ts`), and throws a single error listing every
 * missing/invalid variable at once if anything doesn't check out.
 *
 * Scope: every env var an actually-running server process reads
 * (grepped across `app/`, `lib/`, and `workers/`), split into what's
 * required for the current process target versus what degrades gracefully
 * on its own when unset (and so isn't validated as required here):
 *   - `GITHUB_TOKEN` -- lib/github.ts falls back to unauthenticated GitHub
 *     API requests (60/hr instead of 5000/hr).
 *   - `POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_KEY` -- lib/analytics.ts and
 *     lib/analytics-client.ts both no-op `capture()` calls when unset.
 *   - `REMOTION_SERVE_URL` -- lib/remotion-bundle.ts falls back to the
 *     locally pre-bundled `.remotion/bundle.json`.
 *   - `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` -- local Inngest development
 *     can run without Cloud credentials; deployed services must provide them.
 * Deliberately NOT included: `NODE_ENV` / `CI` / `PORT` (platform-supplied,
 * not app config), the E2E-only `E2E_CLERK_USER_EMAIL`/`E2E_BASE_URL` (read
 * by playwright.config.ts/e2e/global.setup.ts, a separate process from the
 * app server), `DEMOFORGE_STUB_RENDER` (an internal test switch, not
 * deployment config -- see workers/render-demo.ts), and the optional
 * PostHog/Clerk *_HOST/*_URL overrides and Remotion's REMOTION_BUNDLE_FILE,
 * which already have working defaults and aren't worth failing a boot over
 * if someone fat-fingers one.
 */

// Several optional vars in `.env.example` are commented out by default but
// sometimes get uncommented-and-left-blank rather than filled in or
// removed. Treat "" the same as "unset" for optional vars, matching the
// app's own runtime checks (e.g. `if (process.env.GITHUB_TOKEN)`, which is
// equally false for both). Required vars get no such leniency below --
// there, an empty string is treated as a definitely-missing value.
const blankToUndefined = (val: unknown) => (val === "" ? undefined : val);

const commonSchema = z.object({
  // --- Required ------------------------------------------------------
  // Prisma also reads this directly via `env("DATABASE_URL")` in
  // schema.prisma; validating it here too means a bad connection string
  // fails with a legible message instead of a raw driver error.
  DATABASE_URL: z.preprocess(
    blankToUndefined,
    z.string({ required_error: "DATABASE_URL is required (Postgres connection string)." })
  ),

  // Supabase Storage -- app/api/recordings/route.ts (recording upload) and
  // workers/render-demo.ts (export upload) both need these to persist a
  // video anywhere.
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(
    blankToUndefined,
    z
      .string({ required_error: "NEXT_PUBLIC_SUPABASE_URL is required." })
      .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL (e.g. https://xyz.supabase.co).")
  ),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(
    blankToUndefined,
    z.string({ required_error: "SUPABASE_SERVICE_ROLE_KEY is required." })
  ),

  // --- Optional --------------------------------------------------------
  GITHUB_TOKEN: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  POSTHOG_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  NEXT_PUBLIC_POSTHOG_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  REMOTION_SERVE_URL: z.preprocess(
    blankToUndefined,
    z.string().url("REMOTION_SERVE_URL must be a valid URL.").optional()
  ),
  // Inngest Cloud credentials. These are optional for local development with
  // the Inngest dev server, but must be configured on deployed web/worker
  // services (the web service sends events; the worker verifies callbacks).
  INNGEST_EVENT_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  INNGEST_SIGNING_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
});

const webEnvSchema = commonSchema.extend({
  // Clerk auth -- required by the Next.js web process.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.preprocess(
    blankToUndefined,
    z.string({ required_error: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required." })
  ),
  CLERK_SECRET_KEY: z.preprocess(
    blankToUndefined,
    z.string({ required_error: "CLERK_SECRET_KEY is required." })
  ),
});

const workerEnvSchema = commonSchema;


export type Env = z.infer<typeof webEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/**
 * Parses `process.env` against the schema above. Returns the validated
 * (and, for optional vars, blank-string-normalized) result on success.
 * Throws a single `Error` on failure whose message lists every
 * missing/invalid variable at once -- not just the first one Zod happens
 * to hit -- so a misconfigured deploy fails immediately and legibly rather
 * than one route at a time.
 */
export function validateEnv(target: "web" | "worker" = process.env.DEMOFORGE_TARGET === "worker" ? "worker" : "web"): Env | WorkerEnv {
  const schema = target === "worker" ? workerEnvSchema : webEnvSchema;
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(unknown)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid or missing environment variables:\n${problems}\n\n` +
        `See .env.example for what each one is and where to get it.`
    );
  }

  return result.data;
}
