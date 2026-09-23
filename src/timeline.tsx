/**
 * The scrub timeline: position = envelope index (even pacing across the
 * life), display = journal seq (the truth axis). Session markers (summons)
 * are drawn as ticks. Play advances the index; Live snaps to the head as
 * new envelopes arrive.
 */

import React, { useMemo } from "react";

import type { ReplayEnvelope } from "./stream_types";

export interface TimelineProps {
  envelopes: ReplayEnvelope[];
  scrubIndex: number; // -1 .. envelopes.length - 1
  playing: boolean;
  speed: number;
  live: boolean;
  liveAvailable: boolean;
  /** Session boundaries inferred from run_id changes (home-direct lives
   * carry no host summon markers). Values are envelope SEQs. */
  inferredSessionSeqs: number[];
  onScrub(index: number): void;
  onTogglePlay(): void;
  onSpeed(speed: number): void;
  onToggleLive(): void;
}

const SPEEDS = [1, 2, 5, 10, 25, 50];

export function Timeline(props: TimelineProps): React.ReactElement {
  const { envelopes, scrubIndex, playing, speed, live, liveAvailable } = props;
  const max = envelopes.length - 1;
  const current = envelopes[scrubIndex];

  const sessionTicks = useMemo(() => {
    // No full seq→index Map (code adversary F4: ~90k Map.set per envelope
    // arrival was the worst allocator on the page). Host ticks fold in one
    // pass; inferred-session seqs resolve by binary search (envelopes are
    // seq-ordered — the merge insert keeps them so).
    const ticks: Array<{ index: number; kind: string }> = [];
    for (let i = 0; i < envelopes.length; i++) {
      const env = envelopes[i];
      if (env.family !== "host") continue;
      const kind = String((env.payload as { kind?: string }).kind ?? "");
      if (kind === "summon" || kind === "prelude_refused") ticks.push({ index: i, kind });
      // Maintenance acts (reembed): retrieval geometry changed HERE —
      // the scrub bar must show the boundary (plan item 3, observer half).
      if (kind === "reembed") ticks.push({ index: i, kind: "maintenance" });
    }
    const indexOfSeq = (seq: number): number | undefined => {
      let lo = 0;
      let hi = envelopes.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const s = envelopes[mid].seq;
        if (s === seq) return mid;
        if (s < seq) lo = mid + 1;
        else hi = mid - 1;
      }
      return undefined;
    };
    for (const seq of props.inferredSessionSeqs) {
      const index = indexOfSeq(seq);
      if (index !== undefined) ticks.push({ index, kind: "session" });
    }
    return ticks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelopes, props.inferredSessionSeqs]);

  // Effective position for stepping: live rides the head.
  const pos = live ? max : scrubIndex;

  return (
    <div className="entity_timeline">
      <button
        className={`et_btn ${live ? "" : "et_btn_accent"}`}
        onClick={props.onTogglePlay}
        disabled={live}
        title={playing ? "Pause" : "Play"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="et_track_wrap">
        <div className="et_ticks">
          {sessionTicks.map((t) => (
            <div
              key={`${t.kind}-${t.index}`}
              className={`et_tick ${t.kind === "summon" ? "et_tick_summon" : t.kind === "session" ? "et_tick_session" : t.kind === "maintenance" ? "et_tick_maintenance" : "et_tick_refused"}`}
              style={{ left: `${max > 0 ? (t.index / max) * 100 : 0}%` }}
              title={`${t.kind} @ seq ${envelopes[t.index]?.seq}`}
            />
          ))}
        </div>
        <input
          type="range"
          className="et_track"
          min={-1}
          max={Math.max(-1, max)}
          value={live ? max : scrubIndex}
          onChange={(e) => props.onScrub(Number(e.target.value))}
        />
      </div>
      {/* Transport cluster, grouped RIGHT (operator 2026-07-15): jump to
        * start · step one event back/forward · jump to end, then speed,
        * Live, and the position readout. The transport stays ENABLED while
        * live — scrubbing or stepping IS the "let me look at the past"
        * gesture, and the parent's onScrub leaves the tail (round-3 review:
        * disabled-in-live made the new controls dead in the default
        * posture). ● Live snaps back to the head. */}
      <div className="et_right">
        <button className="et_btn" onClick={() => props.onScrub(-1)} title="Jump to the beginning (leaves Live)">
          ⏮
        </button>
        <button className="et_btn" onClick={() => props.onScrub(Math.max(-1, pos - 1))} disabled={pos <= -1} title="One event back (leaves Live)">
          ◀
        </button>
        <button className="et_btn" onClick={() => props.onScrub(Math.min(max, pos + 1))} disabled={!live && pos >= max} title="One event forward">
          ▶
        </button>
        <button className="et_btn" onClick={() => props.onScrub(max)} disabled={!live && pos >= max} title="Jump to the end">
          ⏭
        </button>
        <select className="et_speed" value={speed} disabled={live} onChange={(e) => props.onSpeed(Number(e.target.value))} title="Playback speed">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
        <button
          className={`et_btn et_live ${live ? "et_live_on" : ""}`}
          onClick={props.onToggleLive}
          disabled={!liveAvailable}
          title={liveAvailable ? "Follow the live journal" : "Live tail needs a gateway source"}
        >
          ● Live
        </button>
        <span className="et_pos" title="journal seq at the scrub position · event position / total">
          {scrubIndex >= 0 && current ? `seq ${current.seq}` : "—"} · {scrubIndex + 1}/{envelopes.length}
        </span>
      </div>
    </div>
  );
}
