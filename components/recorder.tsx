"use client";

import { useEffect, useRef, useState } from "react";
import { captureClient } from "@/lib/analytics-client";

type Action = { type: string; timestamp: number; x?: number; y?: number };

export function Recorder({ url, projectId }: { url: string; projectId: string }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const media = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const actionsRef = useRef<Action[]>([]);
  const start = useRef(0);
  const [recording, setRecording] = useState(false);
  const [actions, setActions] = useState<Action[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(
      () => setElapsed((performance.now() - start.current) / 1000),
      100
    );
    return () => clearInterval(id);
  }, [recording]);

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });

      chunks.current = [];
      actionsRef.current = [];
      setActions([]);
      start.current = performance.now();
      setElapsed(0);

      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };

      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunks.current, { type: "video/webm" });
        const fd = new FormData();
        fd.append("video", blob, "recording.webm");
        fd.append("projectId", projectId);
        fd.append(
          "duration",
          String((performance.now() - start.current) / 1000)
        );
        fd.append("actions", JSON.stringify(actionsRef.current));

        const r = await fetch("/api/recordings", {
          method: "POST",
          body: fd,
        });

        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          setError(data.error || "Recording captured, but upload failed.");
        }
      };

      media.current = rec;
      rec.start(250);
      setRecording(true);
      captureClient("recording_started", { projectId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screen capture failed");
    }
  }

  function stop() {
    media.current?.stop();
    setRecording(false);
    captureClient("recording_stopped", {
      projectId,
      durationSeconds: elapsed,
      actionCount: actionsRef.current.length,
    });
  }

  function log(type: string, x?: number, y?: number) {
    if (!recording) return;
    const action = {
      type,
      timestamp: (performance.now() - start.current) / 1000,
      x,
      y,
    };
    actionsRef.current.push(action);
    setActions((current) => [...current, action]);
  }

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
        <iframe
          ref={iframe}
          src={url}
          className="h-[65vh] w-full"
          title="Project preview"
          onClick={() => log("click")}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={recording ? stop : startRecording}
          className={`rounded-xl px-5 py-3 font-semibold ${
            recording ? "bg-red-500 text-white" : "bg-white text-black"
          }`}
        >
          {recording ? "Stop recording" : "Start recording"}
        </button>
        <span className="font-mono text-sm text-zinc-400">
          {elapsed.toFixed(1)}s
        </span>
        <span className="text-sm text-zinc-500">
          {actions.length} captured actions
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-8 rounded-2xl border border-white/10 p-5">
        <h2 className="font-semibold">Timeline</h2>
        <div className="relative mt-4 h-16 rounded-xl bg-white/5">
          {actions.map((a, i) => (
            <div
              key={i}
              title={`${a.type} @ ${a.timestamp.toFixed(1)}s`}
              className="absolute top-3 h-10 w-1 rounded bg-white"
              style={{
                left: `${Math.min(
                  98,
                  (a.timestamp / Math.max(elapsed, 1)) * 100
                )}%`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
