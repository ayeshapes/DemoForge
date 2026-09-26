# DF-14: the export "worker" is really `handleExportJob` (lib/inngest/functions.ts),
# running in-process inside this same Next.js app via app/api/inngest/route.ts --
# there is no separate worker process/image. So this is the one image that needs
# both a working Next.js/Prisma runtime *and* everything @remotion/renderer needs
# to drive headless Chromium for renderMedia() (DF-07/PHASE9).
#
# Base image + package list follow Remotion's own documented Docker recipe
# (https://www.remotion.dev/docs/docker) for `node:*-bookworm-slim` + Chrome
# Headless Shell's shared library dependencies.
FROM node:22-bookworm-slim

WORKDIR /app

# Chrome Headless Shell's runtime shared-library dependencies (Remotion's
# documented list -- see link above). `ffmpeg` is included too, per the ADR:
# note that Remotion v4's @remotion/renderer bundles its own copy of FFmpeg
# internally (via @remotion/compositor-*) purely for encoding, so it does not
# strictly require a system FFmpeg the way Phase 8's execFileSync("ffmpeg", ...)
# pipeline did -- but the ADR calls for installing it here regardless, and
# having a system ffmpeg/ffprobe on PATH is a harmless, useful fallback (e.g.
# for ad-hoc debugging in the container) rather than something to fight.
# ca-certificates/openssl are here for Prisma's query engine + fetching remote
# recording URLs, not for Chromium itself.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    openssl \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm-dev \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libatk-bridge2.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first so this layer is cached across source-only changes.
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# DF-14: download/verify Chrome Headless Shell itself (the browser binary, as
# opposed to the shared libraries installed above) into node_modules, so the
# first export job doesn't pay for that download.
RUN npx remotion browser ensure

# Prisma's generated client is imported at build time (next build) and at
# runtime (lib/prisma.ts), so it has to exist before either of those.
RUN npx prisma generate

# Now bring in the rest of the source and build. `npm run build` runs
# `npm run bundle:remotion` first (DF-07a), writing the pre-bundled Remotion
# composition's serveUrl to .remotion/bundle.json, which workers/render-demo.ts
# requires at render time -- there's no per-job fallback to bundle on the fly.
COPY . .

# Clerk's publishable key is inlined into client bundles at build time (it's a
# NEXT_PUBLIC_* var), so it has to be supplied as a build arg here rather than
# only as a runtime env var -- unlike CLERK_SECRET_KEY, which is server-only
# and can stay a plain runtime ENV/.env value.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
