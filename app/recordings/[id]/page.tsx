"use client";

import { useEffect, useState } from "react";
import TimelineEditor from "@/components/timeline-editor";
import ExportPanel from "@/components/export-panel";

export default function RecordingEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/recording/${params.id}`)
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Recording not found"))
      )
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [params.id]);

  if (error) return <main className="p-8 text-red-600">{error}</main>;
  if (!data) return <main className="p-8">Loading recording…</main>;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <p className="text-sm text-gray-500">DemoForge</p>
        <h1 className="text-3xl font-bold">Recording Editor</h1>
        <p className="mt-1 text-gray-500">
          Cut, enhance and save your demo edit.
        </p>
      </div>

      <TimelineEditor
        recordingId={params.id}
        duration={data.duration || 0}
        videoUrl={data.videoUrl}
        actions={data.actions || []}
        initialEdl={data.edl}
      />

      <ExportPanel recordingId={params.id} />
    </main>
  );
}
