# DemoForge Deployment

DemoForge is deployed as two services:

- **Web** — Next.js application using `Dockerfile.web`, normally on port 3000.
- **Worker** — standalone Node/Inngest process using `Dockerfile.worker`,
  normally on port 3001. This is the only service that runs Remotion/Chromium.

The two services share the same Postgres and Supabase Storage resources.

## 1. Prepare the external services

You need:

1. A Postgres database for Prisma.
2. A Supabase project with a public `demoforge-videos` storage bucket.
3. A Clerk application and its publishable/secret keys.
4. An Inngest application/event key and signing key.
5. Optional GitHub and PostHog credentials if those integrations are wanted.

Run Prisma migrations against the production database before serving traffic:

```bash
npx prisma migrate deploy
```

## 2. Build/deploy the web service

Use `Dockerfile.web`.

The web image intentionally does **not** install FFmpeg or Chromium. Its build
command is:

```bash
npm run build:web
```

For Railway, use `railway.web.toml`. The service should expose port 3000 and
use `/api/health` as its health check.

The web service sends `demoforge/export.requested` events through the Inngest
client. It does not execute the render function.

## 3. Build/deploy the worker service

Use `Dockerfile.worker`.

The worker build runs:

```bash
npm run bundle:remotion
```

and the runtime command is:

```bash
npm run worker
```

The worker exposes:

- `GET /api/health`
- Inngest at `POST/GET/PUT /api/inngest`

Register the worker's public `/api/inngest` URL with Inngest. Do not register
the web service's URL for the render function.

## 4. Environment variables

This table is intentionally derived from `lib/env.ts` and `.env.example`.
`lib/env.ts` has separate web and worker required schemas, selected by
`DEMOFORGE_TARGET`; the worker sets that target before importing Prisma.
When adding or removing deployment configuration, update `lib/env.ts` first;
then update this table and `.env.example` in the same change.

| Variable | Web | Worker | Required in deployment | Source/notes |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | ✓ | ✓ | Yes | `lib/env.ts`; Prisma/Postgres |
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | Yes | `lib/env.ts`; Supabase Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | Yes | `lib/env.ts`; server/worker only |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✓ | — | Yes (web) | `lib/env.ts`; also required as Docker build arg for web |
| `CLERK_SECRET_KEY` | ✓ | — | Yes (web) | `lib/env.ts`; Clerk server auth |
| `INNGEST_EVENT_KEY` | ✓ | — | Yes (deployed web) | `lib/env.ts`; Inngest event sending |
| `INNGEST_SIGNING_KEY` | — | ✓ | Yes (deployed worker) | `lib/env.ts`; Inngest callback verification |
| `GITHUB_TOKEN` | ✓ | — | No | `lib/env.ts`; optional GitHub API rate-limit upgrade |
| `POSTHOG_KEY` | ✓ | ✓ | No | `lib/env.ts`; optional analytics |
| `NEXT_PUBLIC_POSTHOG_KEY` | ✓ | ✓ | No | `lib/env.ts`; optional analytics |
| `REMOTION_SERVE_URL` | — | ✓ | No | `lib/env.ts`; optional hosted Remotion bundle |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | ✓ | — | No* | `.env.example`; Clerk's configured default |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | ✓ | — | No* | `.env.example`; Clerk's configured default |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | ✓ | — | No* | `.env.example`; Clerk's configured default |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | ✓ | — | No* | `.env.example`; Clerk's configured default |
| `NEXT_PUBLIC_POSTHOG_HOST` | ✓ | ✓ | No | `.env.example`; PostHog Cloud default |
| `POSTHOG_HOST` | ✓ | ✓ | No | `.env.example`; PostHog Cloud default |
| `REMOTION_BUNDLE_FILE` | — | ✓ | No | `.env.example`; defaults to `.remotion/bundle.json` |

\* These Clerk URL variables are present in `.env.example` but deliberately
not validated by `lib/env.ts`; the app has working route defaults.

The E2E-only values `E2E_CLERK_USER_EMAIL` and `E2E_BASE_URL`, plus
`DEMOFORGE_STUB_RENDER`, are not production deployment variables. `NODE_ENV`,
`CI`, and `PORT` are platform/runtime variables.

### Secrets

Never expose `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`,
`INNGEST_EVENT_KEY`, or `INNGEST_SIGNING_KEY` to browser code. Only
`NEXT_PUBLIC_*` values intended for client-side use belong in a public build
environment.

### Clerk Docker build-arg note

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is inlined into the Next.js client bundle
at build time. `Dockerfile.web` therefore declares it as:

```dockerfile
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

Set the build argument when building the web image. `CLERK_SECRET_KEY` remains a
runtime secret and must not be passed as a build argument.

## 5. First Railway deploy

Create **two Railway services from the same repository**.

### Web service

- Config: `railway.web.toml`
- Dockerfile: `Dockerfile.web`
- Port: `3000`
- Health check: `/api/health`
- Set the web variables from the table above.

### Worker service

- Config: `railway.worker.toml`
- Dockerfile: `Dockerfile.worker`
- Port: `3001`
- Health check: `/api/health`
- Set the worker variables from the table above.
- Configure Inngest to call `https://<worker-domain>/api/inngest`.

After both services are healthy, create a test recording and request an export.
The expected sequence is:

```text
Browser
  │
  ▼
Web /api/recording/.../export
  │
  ├── creates Export row
  └── sends demoforge/export.requested
                    │
                    ▼
              Inngest Cloud
                    │
                    ▼
             Worker /api/inngest
                    │
                    ▼
          Remotion + Chromium
                    │
                    ▼
             Supabase Storage
                    │
                    ▼
               Export = done
```

## 6. Vercel web-only alternative

`vercel.json` configures the Next.js web target with `npm run build:web`.

Vercel can host the web application, but **the render worker cannot be moved
into this Vercel deployment**. Keep `Dockerfile.worker` on a container runtime
such as Railway (or another Chromium-capable worker environment) and point
Inngest at that worker's `/api/inngest` endpoint.

## 7. Smoke checks

Web:

```bash
curl -f https://<web-domain>/api/health
```

Worker:

```bash
curl -f https://<worker-domain>/api/health
```

Both should return HTTP 200 and a JSON body with `ok: true`.

Before considering the deployment complete, verify one real export reaches
`done` and that its `fileUrl` points at the expected Supabase object.
