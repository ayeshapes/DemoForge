// DF-07a: bundle() must run once at deploy/build time (or be cached), producing a
// `serveUrl` reused across every export job. Run this as part of `npm run build`
// (see package.json) -- never call `bundle()` from inside the render worker itself.
import { bundle } from "@remotion/bundler";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const entryPoint = path.join(projectRoot, "remotion", "index.ts");
const outDir = path.join(projectRoot, ".remotion", "bundle");
const metadataFile = path.join(projectRoot, ".remotion", "bundle.json");

async function main() {
  console.log("[bundle-remotion] Bundling remotion/index.ts ...");

  const serveUrl = await bundle({
    entryPoint,
    outDir,
    // Overwrite any stale bundle from a previous build.
    onProgress: (progress) => {
      process.stdout.write(`\r[bundle-remotion] webpack: ${progress}%   `);
    },
  });

  process.stdout.write("\n");

  fs.mkdirSync(path.dirname(metadataFile), { recursive: true });
  fs.writeFileSync(
    metadataFile,
    JSON.stringify({ serveUrl, bundledAt: new Date().toISOString() }, null, 2) + "\n"
  );

  console.log(`[bundle-remotion] Bundle written to ${outDir}`);
  console.log(`[bundle-remotion] serveUrl recorded in ${metadataFile}`);
}

main().catch((err) => {
  console.error("[bundle-remotion] Failed to bundle the Remotion composition:");
  console.error(err);
  process.exit(1);
});
