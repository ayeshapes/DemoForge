# DemoForge Phase 12 — GitHub repo metadata + DF-20

## DF-19 · GitHub repo metadata fetch

`lib/github.ts` adds `fetchGithubMetadata(githubUrl)`, called from
`app/projects/[id]/page.tsx` whenever a project has a `githubUrl`. In one
call it fetches, from the GitHub REST API:

- Repo metadata: full name, description, stars, forks, language, default
  branch, HTML URL.
- The README (`GET /repos/{owner}/{repo}/readme`), base64-decoded.
- The full file tree (`GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`)
  — one call instead of recursing the contents API per directory.
- A best-effort tech stack read from a root `package.json`
  (`dependencies`/`devDependencies` keys only — this is deliberately just
  "what's in package.json", not static analysis of the codebase).

### Error handling
`fetchGithubMetadata` never throws; it returns a discriminated
`{ ok: true, data }` / `{ ok: false, reason, message }` result, and
`components/repo-panel.tsx` renders the `message` directly when `ok` is
false rather than breaking the rest of the project page:

- **Invalid URL** — not a `github.com/owner/repo` URL.
- **Not found or private** — GitHub returns 404 for both a nonexistent repo
  and a private one it can't see (by design, to avoid confirming a private
  repo exists), so both are reported with the same message.
- **Rate limited** — a 403/429 from GitHub. Covers both actual rate-limit
  exhaustion and abuse-detection throttling; there's no reliable way to
  tell those apart from the response alone.
- **Other errors** — network failures, unexpected status codes, malformed
  JSON — logged as a generic error rather than left unhandled.

The three secondary fetches (tree/README/package.json) are each
independently best-effort: if one fails or 404s, that section of the panel
is just omitted rather than failing the whole result — a repo with no
README, or a non-Node repo with no package.json, still shows everything
else.

### Rate limits
Unauthenticated GitHub API requests are capped at 60/hr, which a single
project page view alone can burn through (4 calls per view). Two
mitigations:
- Every call sets `next: { revalidate: 900 }`, so Next.js's fetch cache
  serves repeat views of the same project from cache for 15 minutes instead
  of re-hitting GitHub.
- An optional `GITHUB_TOKEN` (see `.env.example`) raises the limit to
  5000/hr — a token with no special scopes is enough for public repo
  metadata.

### Display
`components/repo-panel.tsx` shows the repo header (name/link/stars/forks/
language), the tech-stack badges, a collapsible file listing (native
`<details>`, so no client JS is needed — capped at the first 300 entries,
with a note if GitHub itself truncated the tree for a very large repo), and
a collapsible README. The README is shown as raw markdown in a `<pre>`
block rather than rendered to HTML — this repo has no markdown-rendering
dependency yet, and decoding arbitrary repo content into HTML is its own
can of worms (sanitization, embedded scripts in fenced code blocks that
look like markup, etc.) that's out of scope here. Rendering it properly
would be a reasonable follow-up ticket.

## DF-20 · GitHub URL field on project creation

`lib/validators.ts`'s `projectSchema` already accepted `githubUrl` and only
required *one* of `githubUrl`/`deploymentUrl` — `components/new-project.tsx`
just never exposed the field, and had `deploymentUrl`'s `<input>` marked
`required`, which was stricter than the schema actually needed.

Changed:
- Added a "GitHub URL" field next to "Deployed app URL"; both are now
  optional inputs (the existing server-side `.refine()` still rejects a
  submission with neither).
- `app/projects/[id]/page.tsx`: since a project can now be GitHub-only, the
  `Recorder` (which needs a live URL to embed in an iframe) only renders
  when `deploymentUrl` is set; otherwise a short prompt to add one is shown
  instead of an empty iframe.

No changes were needed to `app/api/projects/route.ts` — it already
persisted `githubUrl` when present.
