const GITHUB_API = "https://api.github.com";

// Re-fetching on every page view would burn through GitHub's unauthenticated
// rate limit (60 req/hr) almost immediately for any project with a couple of
// viewers. Next.js's `fetch` cache (below) makes this cheap to raise if a
// shorter window is ever needed.
const CACHE_SECONDS = 900;

export type GithubFileEntry = { path: string; type: "blob" | "tree" };

export type GithubTechStack = {
  dependencies: string[];
  devDependencies: string[];
};

export type GithubRepoMetadata = {
  fullName: string;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string;
  stars: number;
  forks: number;
  language: string | null;
  updatedAt: string;
  /** Decoded README content (raw markdown), or null if the repo has none. */
  readme: string | null;
  files: GithubFileEntry[];
  /** True if GitHub itself truncated the tree listing (very large repos). */
  filesTruncated: boolean;
  /** null when no root-level package.json was found (e.g. non-JS repos). */
  techStack: GithubTechStack | null;
};

export type GithubMetadataResult =
  | { ok: true; data: GithubRepoMetadata }
  | {
      ok: false;
      reason: "invalid_url" | "not_found" | "rate_limited" | "error";
      message: string;
    };

function parseGithubUrl(githubUrl: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(githubUrl);
    if (!/(^|\.)github\.com$/i.test(u.hostname)) return null;
    const [owner, repoRaw] = u.pathname.split("/").filter(Boolean);
    if (!owner || !repoRaw) return null;
    return { owner, repo: repoRaw.replace(/\.git$/i, "") };
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "DemoForge",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Optional: set GITHUB_TOKEN to raise the rate limit from 60/hr to 5000/hr.
  // A fine-grained PAT with no repo access is enough for public metadata.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function ghFetch(path: string): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    headers: authHeaders(),
    next: { revalidate: CACHE_SECONDS },
  });
}

function decodeBase64Content(content: string): string {
  return Buffer.from(content, "base64").toString("utf-8");
}

/**
 * Fetches everything the project detail page needs to show for a linked
 * GitHub repo in one call: repo metadata, README, recursive file tree, and a
 * best-effort tech stack read from a root `package.json`.
 *
 * Every sub-fetch after the initial repo lookup is best-effort: a missing
 * README or package.json (or a transient error fetching them) degrades that
 * one section rather than failing the whole result, since none of them are
 * essential to showing that the repo exists.
 */
export async function fetchGithubMetadata(githubUrl: string): Promise<GithubMetadataResult> {
  const parsed = parseGithubUrl(githubUrl);
  if (!parsed) {
    return { ok: false, reason: "invalid_url", message: "Not a recognizable GitHub repository URL." };
  }
  const { owner, repo } = parsed;

  let repoRes: Response;
  try {
    repoRes = await ghFetch(`/repos/${owner}/${repo}`);
  } catch {
    return { ok: false, reason: "error", message: "Could not reach GitHub. Try again later." };
  }

  if (repoRes.status === 403 || repoRes.status === 429) {
    // GitHub returns 403 for both rate-limit exhaustion and abuse-detection
    // throttling (and occasionally for a repo the token can't see) — there's
    // no reliable way to tell those apart from the response alone, so this
    // covers all of them with one message rather than guessing.
    return {
      ok: false,
      reason: "rate_limited",
      message: "GitHub API rate limit reached (or access forbidden). Try again in a few minutes.",
    };
  }
  if (repoRes.status === 404) {
    // GitHub deliberately returns 404 (not 403) for private repos it can't
    // see, to avoid confirming they exist — so this covers both cases.
    return { ok: false, reason: "not_found", message: "Repository not found or private." };
  }
  if (!repoRes.ok) {
    return { ok: false, reason: "error", message: `GitHub API error (${repoRes.status}).` };
  }

  const repoJson = await repoRes.json();
  const defaultBranch: string = repoJson.default_branch || "main";

  const [treeRes, readmeRes, pkgRes] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`),
    ghFetch(`/repos/${owner}/${repo}/readme`),
    ghFetch(`/repos/${owner}/${repo}/contents/package.json`),
  ]);

  let files: GithubFileEntry[] = [];
  let filesTruncated = false;
  if (treeRes.ok) {
    try {
      const treeJson = await treeRes.json();
      files = (treeJson.tree ?? [])
        .filter((e: any) => e && (e.type === "blob" || e.type === "tree") && typeof e.path === "string")
        .map((e: any) => ({ path: e.path as string, type: e.type as "blob" | "tree" }));
      filesTruncated = Boolean(treeJson.truncated);
    } catch {
      // Malformed tree response — show the rest of the metadata without it.
    }
  }

  let readme: string | null = null;
  if (readmeRes.ok) {
    try {
      const readmeJson = await readmeRes.json();
      if (readmeJson.content) readme = decodeBase64Content(readmeJson.content);
    } catch {
      // Leave readme null rather than fail the whole request.
    }
  }

  let techStack: GithubTechStack | null = null;
  if (pkgRes.ok) {
    try {
      const pkgJson = await pkgRes.json();
      if (pkgJson.content) {
        const parsedPkg = JSON.parse(decodeBase64Content(pkgJson.content));
        techStack = {
          dependencies: Object.keys(parsedPkg.dependencies ?? {}),
          devDependencies: Object.keys(parsedPkg.devDependencies ?? {}),
        };
      }
    } catch {
      // Malformed/absent package.json — leave techStack null.
    }
  }

  return {
    ok: true,
    data: {
      fullName: repoJson.full_name,
      description: repoJson.description ?? null,
      htmlUrl: repoJson.html_url,
      defaultBranch,
      stars: repoJson.stargazers_count ?? 0,
      forks: repoJson.forks_count ?? 0,
      language: repoJson.language ?? null,
      updatedAt: repoJson.updated_at,
      readme,
      files,
      filesTruncated,
      techStack,
    },
  };
}
