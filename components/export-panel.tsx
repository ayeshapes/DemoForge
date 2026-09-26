"use client";

import { useEffect, useState } from "react";

const RATIOS = ["16:9", "9:16", "1:1"];

export default function ExportPanel({ recordingId }: { recordingId: string }) {
  const [ratio, setRatio] = useState("16:9");
  const [exportId, setExportId] = useState<string | null>(null);
  const [status, setStatus] = useState("idle");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStatus("pending");
    setFileUrl(null);
    setError(null);

    try {
      const res = await fetch(`/api/recording/${recordingId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aspectRatio: ratio }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start export");
      }

      setExportId(data.exportId);
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Failed to start export");
    }
  }

  useEffect(() => {
    if (!exportId) return;

    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(
          `/api/recording/${recordingId}/export/status?id=${exportId}`,
          { cache: "no-store" }
        );
        const data = await res.json();

        if (!res.ok) {
          if (active) {
            setStatus("failed");
            setError(data.error || "Could not read export status");
          }
          return;
        }

        if (!active) return;

        setStatus(data.status);

        if (data.fileUrl) {
          setFileUrl(data.fileUrl);
          return;
        }

        if (data.status === "failed") {
          setError(data.error || "Export failed.");
        }
      } catch (err) {
        if (active) {
          setStatus("failed");
          setError(
            err instanceof Error ? err.message : "Could not read export status"
          );
        }
      }
    };

    void poll();
    const timer = setInterval(poll, 1500);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [exportId, recordingId]);

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Export demo</h3>

      <div className="mt-3 flex flex-wrap gap-2">
        {RATIOS.map((r) => (
          <button
            key={r}
            onClick={() => setRatio(r)}
            disabled={status === "pending" || status === "processing"}
            className={`rounded-lg border px-3 py-2 text-sm ${
              ratio === r ? "bg-black text-white" : ""
            }`}
          >
            {r}
          </button>
        ))}

        <button
          onClick={start}
          disabled={status === "pending" || status === "processing"}
          className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Export MP4
        </button>
      </div>

      <p className="mt-3 text-sm text-gray-500">
        Status: {status}
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {fileUrl && (
        <div className="mt-3 flex gap-3">
          <a
            href={fileUrl}
            download
            target="_blank"
            rel="noreferrer"
            className="text-sm underline"
          >
            Download MP4
          </a>
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline"
          >
            Shareable link
          </a>
        </div>
      )}

      {status === "failed" && (
        <button
          onClick={start}
          className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm text-white"
        >
          Retry export
        </button>
      )}
    </div>
  );
}
