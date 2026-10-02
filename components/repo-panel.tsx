import type { GithubMetadataResult } from "@/lib/github";

const MAX_VISIBLE_FILES = 300;
const MAX_VISIBLE_STACK = 20;

export function RepoPanel({ result }: { result: GithubMetadataResult }) {
  if (!result.ok) {
    return (
      <div className="mt-10 rounded-2xl border border-white/10 bg-white/[.03] p-6">
        <h2 className="text-lg font-semibold">Repository</h2>
        <p className="mt-2 text-sm text-zinc-400">{result.message}</p>
      </div>
    );
  }

  const { data } = result;
  const stack = [
    ...(data.techStack?.dependencies ?? []),
    ...(data.techStack?.devDependencies ?? []),
  ];
  const visibleFiles = data.files.slice(0, MAX_VISIBLE_FILES);
  const hiddenFileCount = data.files.length - visibleFiles.length;

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-white/[.03] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <a href={data.htmlUrl} target="_blank" rel="noreferrer" className="hover:underline">
            {data.fullName}
          </a>
        </h2>
        <span className="text-sm text-zinc-500">
          ★ {data.stars} · {data.forks} forks{data.language ? ` · ${data.language}` : ""}
        </span>
      </div>

      {data.description && <p className="mt-2 text-sm text-zinc-400">{data.description}</p>}

      {stack.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {stack.slice(0, MAX_VISIBLE_STACK).map((name) => (
            <span
              key={name}
              className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-zinc-300"
            >
              {name}
            </span>
          ))}
          {stack.length > MAX_VISIBLE_STACK && (
            <span className="self-center text-xs text-zinc-500">
              +{stack.length - MAX_VISIBLE_STACK} more
            </span>
          )}
        </div>
      )}

      {data.files.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-zinc-300">
            Files ({data.files.length}
            {data.filesTruncated ? "+" : ""})
          </summary>
          <ul className="mt-2 max-h-64 overflow-y-auto font-mono text-xs text-zinc-500">
            {visibleFiles.map((f) => (
              <li key={f.path} className={f.type === "tree" ? "text-zinc-400" : undefined}>
                {f.path}
                {f.type === "tree" ? "/" : ""}
              </li>
            ))}
          </ul>
          {(hiddenFileCount > 0 || data.filesTruncated) && (
            <p className="mt-2 text-xs text-zinc-600">
              Showing first {visibleFiles.length} entries
              {data.filesTruncated ? " (GitHub truncated this listing for very large repos)" : ""}.
            </p>
          )}
        </details>
      )}

      {data.readme && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm text-zinc-300">README</summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-4 text-xs text-zinc-400">
            {data.readme}
          </pre>
        </details>
      )}
    </div>
  );
}
