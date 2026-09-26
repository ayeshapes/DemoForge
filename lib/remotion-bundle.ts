import fs from "node:fs";
import path from "node:path";

let cachedServeUrl: string | null = null;

/**
 * Resolves the pre-bundled Remotion `serveUrl` produced by `npm run bundle:remotion`
 * (scripts/bundle-remotion.mjs, wired into `npm run build`).
 *
 * DF-07a: `bundle()` must run once at deploy/build time and be cached/reused across
 * export jobs -- bundling per job would add a webpack compile to every export. This
 * helper never calls `bundle()` itself; it only reads the artifact that build step
 * produced, and caches the result in memory for the lifetime of the process.
 *
 * Resolution order:
 * 1. `REMOTION_SERVE_URL` env var -- an explicit override, e.g. a hosted bundle URL
 *    for deployments that serve the Remotion bundle from a CDN/static host.
 * 2. The build artifact at `REMOTION_BUNDLE_FILE` (default `.remotion/bundle.json`,
 *    resolved relative to the process working directory), written by the bundle step.
 */
export function getRemotionServeUrl(): string {
  if (cachedServeUrl) return cachedServeUrl;

  if (process.env.REMOTION_SERVE_URL) {
    cachedServeUrl = process.env.REMOTION_SERVE_URL;
    return cachedServeUrl;
  }

  const bundleFile = path.resolve(
    process.cwd(),
    process.env.REMOTION_BUNDLE_FILE || ".remotion/bundle.json"
  );

  if (!fs.existsSync(bundleFile)) {
    throw new Error(
      `Remotion bundle not found at "${bundleFile}". Run "npm run bundle:remotion" as part of ` +
        `your build/deploy step before the export worker runs (see DF-07a), or set ` +
        `REMOTION_SERVE_URL to point at an already-hosted bundle.`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(bundleFile, "utf-8"));
  } catch (err) {
    throw new Error(
      `Failed to parse Remotion bundle metadata at "${bundleFile}": ${(err as Error).message}`
    );
  }

  const serveUrl = (parsed as { serveUrl?: unknown })?.serveUrl;
  if (typeof serveUrl !== "string" || serveUrl.length === 0) {
    throw new Error(`Remotion bundle metadata at "${bundleFile}" is missing a "serveUrl" string.`);
  }

  cachedServeUrl = serveUrl;
  return cachedServeUrl;
}

/** Test/dev escape hatch to force re-reading the bundle file or env var. */
export function clearRemotionServeUrlCache(): void {
  cachedServeUrl = null;
}
