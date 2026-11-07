/**
 * The time panel (operator 2026-11-07: "redesign this temporal navigation
 * bar … a thicker panel … above [the bar], a visual representation of the
 * defining events: world model, lessons, episodic events, diary"; "stop
 * and play should be on the right along with previous/next").
 *
 * One grid so every lane lines up with the scrub bar beneath it:
 *   label | lane of marks       |
 *   …     | …                   |
 *   time  | scrub bar + ticks   | transport ⏮ ◀ ▶/❚❚ ▶ ⏭ · speed · Live · position
 * Position = envelope index (even pacing across the life), display =
 * journal seq. A mark is a memory he formed — a lived moment, a diary
 * entry, a lesson, a world-model revision, a dream — at the place it
 * formed; clicking it moves time there and opens it in Detail. Session
 * markers (summons) stay as ticks on the bar.
 */

import React, { useMemo, useRef } from "react";
import { Icon } from "@abstractframework/ui-kit";

import { KIND_COLORS } from "./graph_canvas";
import { clockUtc, dayLabelUtc } from "./ledger_lines";
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
  /** A defining event was clicked: move time to it and open its memory. */
  onOpenEvent?(index: number, recordId: string): void;
}

const SPEEDS = [1, 2, 5, 10, 25, 50];

export type LaneId = "moments" | "diary" | "lessons" | "world" | "dreams";

export const LANES: Array<{ id: LaneId; label: string; color: string }> = [
  { id: "moments", label: "moments", color: KIND_COLORS.episode },
  { id: "diary", label: "diary", color: KIND_COLORS.diary },
  { id: "lessons", label: "lessons", color: KIND_COLORS.lesson },
  { id: "world", label: "world", color: KIND_COLORS.world_model },
  { id: "dreams", label: "dreams", color: KIND_COLORS.dream },
];

export interface TimelineEvent {
  index: number;
  lane: LaneId;
  recordId: string;
  title: string;
  at: string;
}

/** Which lane a formed memory belongs on, or null when it is not one. */
export function laneOf(env: ReplayEnvelope): LaneId | null {
  if (env.family !== "binding") return null;
  const p = env.payload as { source?: string };
  if (p.source !== "remember") return null;
  const d = (env.display ?? {}) as { kind?: string; diary?: boolean; redacted?: string };
  if (d.diary === true || d.redacted === "diary" || d.kind === "diary") return "diary";
  if (d.kind === "episode") return "moments";
  if (d.kind === "lesson") return "lessons";
  if (d.kind === "world_model") return "world";
  if (d.kind === "dream") return "dreams";
  return null;
}

export interface EventFold {
  events: TimelineEvent[];
  count: number;
  first: ReplayEnvelope | null;
  tail: ReplayEnvelope | null;
}

/** Extend `prev` with the envelopes it has not seen, or rebuild when the
 * covered prefix changed (same rule as the ledger's fold). A new array on
 * every change; `prev` back when nothing changed. */
export function foldEvents(prev: EventFold | null, envelopes: ReplayEnvelope[]): EventFold {
  const first = envelopes[0] ?? null;
  const intact = prev !== null && prev.first === first && prev.count <= envelopes.length && (prev.count === 0 || envelopes[prev.count - 1] === prev.tail);
  if (intact && prev.count === envelopes.length) return prev;
  const events = intact ? prev.events.slice() : [];
  for (let i = intact ? prev.count : 0; i < envelopes.length; i++) {
    const env = envelopes[i];
    const lane = laneOf(env);
    if (!lane) continue;
    const d = (env.display ?? {}) as { title?: string; gist?: string };
    const recordId = String((env.payload as { record_id?: string }).record_id ?? "");
    events.push({ index: i, lane, recordId, title: String(d.gist || d.title || recordId), at: env.observed_at });
  }
  return { events, count: envelopes.length, first, tail: envelopes[envelopes.length - 1] ?? null };
}

export function Timeline(props: TimelineProps): React.ReactElement {
  const { envelopes, scrubIndex, playing, speed, live, liveAvailable } = props;
  const max = envelopes.length - 1;
  const current = envelopes[scrubIndex];
  // Where the slider puts an event: its range runs from -1 to max and its
  // thumb (--et-thumb wide) travels the track minus one thumb width, so a
  // mark uses the same arithmetic to sit exactly above that position.
  const span = Math.max(1, max + 1);
  const pct = (index: number) => `calc(var(--et-thumb) / 2 + (100% - var(--et-thumb)) * ${(index + 1) / span})`;

  const foldRef = useRef<EventFold | null>(null);
  const events = useMemo(() => {
    foldRef.current = foldEvents(foldRef.current, envelopes);
    return foldRef.current.events;
  }, [envelopes]);
  const byLane = useMemo(() => {
    const out: Record<LaneId, TimelineEvent[]> = { moments: [], diary: [], lessons: [], world: [], dreams: [] };
    for (const e of events) out[e.lane].push(e);
    return out;
  }, [events]);

  const sessionTicks = useMemo(() => {
    // No full seq→index Map (code adversary F4: ~90k Map.set per envelope
    // arrival was the worst allocator on the page). Host ticks fold in one
    // pass; inferred-session seqs resolve by binary search.
    const ticks: Array<{ index: number; kind: string }> = [];
    for (let i = 0; i < envelopes.length; i++) {
      const env = envelopes[i];
      if (env.family !== "host") continue;
      const kind = String((env.payload as { kind?: string }).kind ?? "");
      if (kind === "summon" || kind === "prelude_refused") ticks.push({ index: i, kind });
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
  // The latest handlers, read at click time: the marks must not depend on
  // them (the parent passes new functions on every render).
  const handlersRef = useRef({ onOpenEvent: props.onOpenEvent, onScrub: props.onScrub });
  handlersRef.current = { onOpenEvent: props.onOpenEvent, onScrub: props.onScrub };
  // Marks depend on the events, not on the position (a scrub step must not
  // re-render thousands of them); the past/future shade is one overlay per
  // lane. Marks are not Tab stops — the ledger is the keyboard path.
  const marks = useMemo(() => {
    const out = {} as Record<LaneId, React.ReactElement[]>;
    for (const lane of LANES) {
      out[lane.id] = byLane[lane.id].map((e) => {
        const diary = lane.id === "diary";
        const when = `${dayLabelUtc(e.at)}, ${clockUtc(e.at)} UTC`;
        return (
          <button
            key={`${e.index}-${e.recordId}`}
            className="et_mark"
            tabIndex={-1}
            style={{ left: pct(e.index), background: lane.color }}
            title={`${lane.label} · ${when}\n${e.title}${diary ? "\n(click: shows it in his Book; reading its words there is recorded)" : ""}`}
            aria-label={`${lane.label}, ${when}: ${e.title}`}
            onClick={() => {
              const h = handlersRef.current;
              if (h.onOpenEvent) h.onOpenEvent(e.index, e.recordId);
              else h.onScrub(e.index);
            }}
          />
        );
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byLane, span]);

  return (
    <div className="entity_timeline et_grid">
      {LANES.map((lane) => (
        <React.Fragment key={lane.id}>
          <span className="et_lane_label" style={{ color: lane.color }}>
            {lane.label}
            <span className="et_lane_count">{byLane[lane.id].length || ""}</span>
          </span>
          <div className="et_lane" role="group" aria-label={`${lane.label}: ${byLane[lane.id].length}`}>
            {marks[lane.id]}
            {pos < max ? <div className="et_lane_future" style={{ left: pct(Math.max(pos, -1)) }} aria-hidden="true" /> : null}
          </div>
          <span />
        </React.Fragment>
      ))}
      <span className="et_lane_label et_time_label">time</span>
      <div className="et_track_wrap">
        <div className="et_ticks">
          {sessionTicks.map((t) => (
            <div
              key={`${t.kind}-${t.index}`}
              className={`et_tick ${t.kind === "summon" ? "et_tick_summon" : t.kind === "session" ? "et_tick_session" : t.kind === "maintenance" ? "et_tick_maintenance" : "et_tick_refused"}`}
              style={{ left: pct(t.index) }}
              title={`${t.kind} @ seq ${envelopes[t.index]?.seq}`}
            />
          ))}
        </div>
        <input
          type="range"
          className="et_track"
          aria-label="Time"
          min={-1}
          max={Math.max(-1, max)}
          value={live ? max : scrubIndex}
          style={{ ["--et-progress" as string]: pct(pos).replace(/^calc\(/, "calc(").toString() } as React.CSSProperties}
          onChange={(e) => props.onScrub(Number(e.target.value))}
        />
      </div>
      {/* Transport, all on the right (operator 2026-11-07): start · one
        * event back · play/pause · one event forward · end, then speed,
        * Live and the position. Stepping or scrubbing while live leaves the
        * tail (the parent's onScrub); ● Live snaps back to the head. */}
      <div className="et_right">
        <button className="et_btn" onClick={() => props.onScrub(-1)} title="Back to the beginning (leaves Live)" aria-label="Back to the beginning">
          <span className="et_icon_pair et_icon_back" aria-hidden="true">
            <Icon name="chevronRight" size={14} />
            <Icon name="chevronRight" size={14} />
          </span>
        </button>
        <button className="et_btn" onClick={() => props.onScrub(Math.max(-1, pos - 1))} disabled={pos <= -1} title="One event back (leaves Live)" aria-label="One event back">
          <span className="et_icon_back" aria-hidden="true">
            <Icon name="chevronRight" size={14} />
          </span>
        </button>
        <button
          className={`et_btn et_play ${live ? "" : "et_btn_accent"}`}
          onClick={props.onTogglePlay}
          disabled={live}
          title={live ? "Following live — leave Live to play the past" : playing ? "Pause" : "Play"}
          aria-label={playing ? "Pause" : "Play"}
        >
          <Icon name={playing ? "pause" : "play"} size={14} />
        </button>
        <button className="et_btn" onClick={() => props.onScrub(Math.min(max, pos + 1))} disabled={!live && pos >= max} title="One event forward" aria-label="One event forward">
          <Icon name="chevronRight" size={14} />
        </button>
        <button className="et_btn" onClick={() => props.onScrub(max)} disabled={!live && pos >= max} title="To the latest event" aria-label="To the latest event">
          <span className="et_icon_pair" aria-hidden="true">
            <Icon name="chevronRight" size={14} />
            <Icon name="chevronRight" size={14} />
          </span>
        </button>
        <select className="et_speed" value={speed} disabled={live} onChange={(e) => props.onSpeed(Number(e.target.value))} title="Playback speed" aria-label="Playback speed">
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
        <span className="et_pos" title="the time at the scrub position · event position / total (hover the bar's marks for each event)">
          {scrubIndex >= 0 && current ? `${clockUtc(current.observed_at)} UTC` : "—"} · {scrubIndex + 1}/{envelopes.length}
        </span>
      </div>
    </div>
  );
}
