# Free deployment: Vercel (web) + Neon (DB) + Supabase (files) + Clerk + Inngest + Google Cloud Run (render worker)

## A. Database (Neon)
Use the DIRECT connection string (host without "-pooler") for this one-time step:
    DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" npx prisma db push
(There is no prisma/migrations folder, so `migrate deploy` would do nothing.)
For Vercel + the worker, use the POOLED string (host contains "-pooler").

## B. Supabase
Storage -> New bucket -> name exactly `demoforge-videos` -> Public ON.

## C. Vercel (web)
Project Settings -> Build & Development:
  - Build Command: turn the override OFF (vercel.json already sets `npm run build:web`) or set it to `npm run build:web`
Project Settings -> Environment Variables (tick Production, Preview AND Development;
the app validates env at build time, so they must exist during the build):
  DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, INNGEST_EVENT_KEY
Redeploy. Check https://YOUR-APP.vercel.app/api/health

## D. Render worker on Google Cloud Run (free tier, needs a billing account/card)
One-time:
    gcloud auth login
    gcloud config set project YOUR_PROJECT_ID
    gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
    gcloud artifacts repositories create demoforge --repository-format=docker --location=us-central1

Build + push the image (edit PROJECT_ID):
    gcloud builds submit --config cloudbuild.worker.yaml \
      --substitutions _IMAGE=us-central1-docker.pkg.dev/PROJECT_ID/demoforge/worker:latest

Deploy:
    cp worker.env.example.yaml worker.env.yaml   # fill it in
    gcloud run deploy demoforge-worker \
      --image us-central1-docker.pkg.dev/PROJECT_ID/demoforge/worker:latest \
      --region us-central1 --allow-unauthenticated \
      --cpu 2 --memory 4Gi --timeout 3600 --concurrency 1 \
      --min-instances 0 --max-instances 1 \
      --env-vars-file worker.env.yaml

Keep --min-instances 0 and --max-instances 1 so you stay inside the free tier.
Then also set a budget alert in Google Cloud Billing (e.g. $1).
Test: curl https://WORKER-URL/api/health

## E. Inngest
Apps -> Sync new app -> https://WORKER-URL/api/inngest
Keys: Event key -> Vercel (INNGEST_EVENT_KEY); Signing key -> worker.env.yaml (INNGEST_SIGNING_KEY).
Re-run `gcloud run deploy` after changing env vars.

## F. Test
Sign in -> create a project -> record -> Export. Status should go processing -> done.
