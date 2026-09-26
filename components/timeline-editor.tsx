"use client";

import { useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { DemoComposition } from "@/remotion/DemoComposition";
import { getClipsDurationSeconds, resolveCompositionTime, type EDL } from "@/lib/edl";
import { FPS } from "@/lib/remotion-constants";

type Action = {
  id: string;
  type: string;
  timestamp: number;
  x?: number | null;
  y?: number | null;
};

type Clip = { id: string; sourceStart: number; sourceEnd: number };
type Effect = any;

export default function TimelineEditor({
  duration, actions, videoUrl, recordingId, initialEdl
}: {
  duration: number; actions: Action[]; videoUrl?: string | null; recordingId: string; initialEdl?: any
}) {
  const player = useRef<PlayerRef>(null);
  const [clips, setClips] = useState<Clip[]>(
    initialEdl?.clips?.length ? initialEdl.clips : (duration ? [{id:"main",sourceStart:0,sourceEnd:duration}] : [])
  );
  const [effects, setEffects] = useState<Effect[]>(initialEdl?.effects || []);
  const [range, setRange] = useState<[number, number]>([0, duration]);
  const [message, setMessage] = useState("");

  const markers = useMemo(() => actions.filter(a => a.timestamp <= duration), [actions, duration]);

  // DF-16: the preview renders `DemoComposition` itself (via @remotion/player)
  // with the editor's own in-progress `clips`/`effects`, instead of a bare
  // <video> tag -- so zoom/text/cursor-highlight/freeze-frame positioning is
  // never re-implemented a second time here, and the preview can't drift from
  // what the export worker actually renders (workers/render-demo.ts renders
  // this exact same component). `<OffthreadVideo>` inside `DemoComposition`
  // transparently falls back to a plain <video> element when running inside
  // `<Player>` in the browser, so this works without a bundled Remotion serveUrl.
  const previewEdl: EDL = { version: 1, clips, effects };
  const durationInFrames = Math.max(1, Math.round(getClipsDurationSeconds(clips) * FPS));

  // A marker's timestamp is in *source* time (pre-cut), but the player's frame
  // numbers are in *composition* (post-cut) time -- see DF-08/DF-16. `null`
  // means this action falls inside a cut range, so there's no corresponding
  // frame to jump to.
  function seek(t: number) {
    const compositionSeconds = resolveCompositionTime(clips, t);
    if (compositionSeconds == null) return;
    player.current?.seekTo(Math.round(compositionSeconds * FPS));
    player.current?.play();
  }

  function addEffect(effect: Effect) {
    setEffects(prev => [...prev, { ...effect, id: crypto.randomUUID() }]);
  }

  function cutRange() {
    const [start, end] = range;
    if (end <= start) return;

    const next: Clip[] = [];
    for (const clip of clips) {
      if (end <= clip.sourceStart || start >= clip.sourceEnd) {
        next.push(clip);
        continue;
      }
      if (start > clip.sourceStart) {
        next.push({ id: crypto.randomUUID(), sourceStart: clip.sourceStart, sourceEnd: Math.min(start, clip.sourceEnd) });
      }
      if (end < clip.sourceEnd) {
        next.push({ id: crypto.randomUUID(), sourceStart: Math.max(end, clip.sourceStart), sourceEnd: clip.sourceEnd });
      }
    }
    setClips(next.filter(c => c.sourceEnd > c.sourceStart));
  }

  async function save() {
    const edl = { version: 1, clips, effects };
    const res = await fetch(`/api/recording/${recordingId}/edit`, {
      method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({edl})
    });
    setMessage(res.ok ? "Edit saved" : "Could not save edit");
  }

  return (
    <div className="space-y-5">
      {videoUrl ? (
        <Player
          ref={player}
          component={DemoComposition}
          inputProps={{ videoUrl, edl: previewEdl }}
          durationInFrames={durationInFrames}
          fps={FPS}
          compositionWidth={1920}
          compositionHeight={1080}
          style={{ width: "100%", borderRadius: "0.75rem" }}
          controls
        />
      ) : (
        <div className="rounded-xl bg-black p-12 text-center text-white">No video uploaded yet</div>
      )}

      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={cutRange} className="rounded-lg bg-black px-3 py-2 text-sm text-white">Cut selected range</button>
          <button onClick={() => addEffect({type:"zoom",start:range[0],end:range[1],scale:1.5,x:.5,y:.5})} className="rounded-lg border px-3 py-2 text-sm">Add zoom</button>
          {/* x/y default to center; DemoComposition renders the highlight at the
              effect's own stored position (DF-10), not from Action.x/y, so a
              follow-up ticket should let the user drag this to place it. */}
          <button onClick={() => addEffect({type:"cursor-highlight",start:range[0],end:range[1],radius:36,x:.5,y:.5})} className="rounded-lg border px-3 py-2 text-sm">Cursor highlight</button>
          <button onClick={() => addEffect({type:"text",start:range[0],end:range[1],text:"DemoForge",x:.5,y:.12,fontSize:32})} className="rounded-lg border px-3 py-2 text-sm">Add text</button>
          <button onClick={() => addEffect({type:"freeze-frame",at:range[0],duration:1.5})} className="rounded-lg border px-3 py-2 text-sm">Freeze frame</button>
          <button onClick={save} className="ml-auto rounded-lg bg-black px-3 py-2 text-sm text-white">Save</button>
        </div>

        <div className="mt-4 relative h-20 rounded-lg bg-gray-100">
          {clips.map(c => (
            <div key={c.id} className="absolute top-2 h-16 rounded border border-black/30 bg-white"
              style={{left:`${duration ? c.sourceStart/duration*100 : 0}%`, width:`${duration ? (c.sourceEnd-c.sourceStart)/duration*100 : 0}%`}} />
          ))}
          {markers.map(a => (
            <button key={a.id} title={`${a.type} @ ${a.timestamp.toFixed(2)}s`}
              onClick={() => seek(a.timestamp)}
              className="absolute top-0 h-20 w-1 -translate-x-1/2 bg-black"
              style={{left:`${duration ? a.timestamp/duration*100 : 0}%`}} />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-sm">Selection start
            <input type="number" min={0} max={range[1]} step=".1" value={range[0]}
              onChange={e => setRange([Math.max(0, Number(e.target.value)), range[1]])}
              className="mt-1 w-full rounded border px-2 py-1" />
          </label>
          <label className="text-sm">Selection end
            <input type="number" min={range[0]} max={duration} step=".1" value={range[1]}
              onChange={e => setRange([range[0], Math.min(duration, Number(e.target.value))])}
              className="mt-1 w-full rounded border px-2 py-1" />
          </label>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium">Clips</p>
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            {clips.map(c => <li key={c.id}>{c.sourceStart.toFixed(1)}s → {c.sourceEnd.toFixed(1)}s</li>)}
          </ul>
          <p className="mt-3 text-sm font-medium">Effects ({effects.length})</p>
          <ul className="mt-2 space-y-1 text-xs text-gray-600">
            {effects.map(e => <li key={e.id}>{e.type} {e.start != null ? `${e.start.toFixed(1)}–${e.end.toFixed(1)}s` : `@ ${e.at.toFixed(1)}s`}</li>)}
          </ul>
        </div>
        {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      </div>
    </div>
  );
}
