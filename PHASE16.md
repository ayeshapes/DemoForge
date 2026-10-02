# DemoForge Phase 16 — Standalone render worker

## DF-23.2 · Split the render worker out of the web request process

The render path is now a separate Node process:

- `workers/inngest.mjs` is the worker entry point. It exposes `/api/inngest`
  using Inngest's Node adapter and runs `handleExportJob` outside Next.js.
- `app/api/inngest/route.ts` has been removed. The web app still creates exports
  and sends `demoforge/export.requested`; it no longer hosts the function that
  performs Chromium rendering.
- `Dockerfile.web` builds only the Next.js target. It installs the normal
  runtime libraries needed by Next/Prisma, but does not install system FFmpeg
  or download Chromium.
- `Dockerfile.worker` is the render target. It installs FFmpeg, Chromium's
  shared libraries, and Remotion's browser binary, then starts
  `workers/inngest.mjs`.
- `npm run build:web` builds the web target without creating a Remotion bundle.
- `npm run bundle:remotion` remains a worker build step. The worker needs the
  pre-bundled `.remotion/bundle.json` before it accepts export jobs.

The worker also exposes `GET /api/health`, returning `{ "ok": true, "service":
"worker" }`. The web target exposes the same route with `"service": "web"`.

`lib/env.ts` now has separate web and worker required schemas. The worker sets
`DEMOFORGE_TARGET=worker` before loading the Prisma/rendering dependency graph,
so it does not need the web-only Clerk secrets.

### Local development

Run Next normally:

```bash
npm run dev
```

Run the standalone worker in a second terminal:

```bash
npm run worker
```

The worker listens on `PORT` or `3001`. For Inngest local development, point
the Inngest dev server at the worker's `/api/inngest` endpoint rather than the
Next app's old route.

For a local production-like build:

```bash
npm run build:web
npm run bundle:remotion
npm start
npm run worker
```

Do not run both the web and worker on the same port.

### Deployment

The intended production topology is two services:

1. **web** — `Dockerfile.web`, port 3000, health `/api/health`.
2. **worker** — `Dockerfile.worker`, port 3001, health `/api/health`, Inngest
   endpoint `/api/inngest`.

Configure Inngest so the deployed app/function endpoint is the worker URL,
for example `https://<worker-host>/api/inngest`.

The web service only needs to send events. The worker service owns the
long-running render process and must have enough CPU/RAM for Chromium and
Remotion.

## DF-23.3 · Deployment configs

- `railway.web.toml` describes the Railway web service.
- `railway.worker.toml` describes the Railway worker service.
- `vercel.json` configures the web-only Next.js build. **Vercel is not a
  replacement for the render worker in this architecture**; the worker
  requires the separate Chromium-capable worker target.
- Both targets expose `GET /api/health` for platform health checks.

## DF-23.4 · Deployment documentation

See `DEPLOYMENT.md` for the first-deploy walkthrough and environment-variable
matrix.
