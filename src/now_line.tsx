/**
 * What the entity is doing now (operator 2026-11-07: "I still have no
 * realtime feedback on what the entity is doing. Is it thinking? Is it
 * using tools? Is it doing nothing?").
 *
 * Read from the live stream only:
 *   - a recall newer than the last lived moment → he is thinking (a turn
 *     opens with its recall; the moment forms when the turn ends);
 *   - otherwise → the last moment, when it ended, and what he looked up
 *     in it (counted from the moment's own record: the runtime writes one
 *     "[used tool: <name>]" line per lookup in his thinking rounds —
 *     abstractruntime identity/chat.py, turn formation).
 * His lookups are NOT visible while a personal-time turn runs: the runtime
 * records them only when the turn ends (stated, never faked).
 */

import React, { useEffect, useMemo, useState } from "react";

import { clockUtc, turnLabel } from "./ledger_lines";
import type { ReplayEnvelope, TracePayload } from "./stream_types";
import type { VerbatimSource } from "./verbatim_modal";
import { parseExchange, splitUnspokenThinking } from "./verbatim_parse";
import { readRecordWords } from "./verbatim_view";

export type NowState =
  | { kind: "thinking"; since: string; turn: string; withSomeone: boolean }
  | { kind: "moment"; at: string; turn: string; graphId: string }
  | { kind: "none" };

export function nowState(envelopes: ReplayEnvelope[]): NowState {
  let recall: ReplayEnvelope | null = null;
  let moment: ReplayEnvelope | null = null;
  for (let i = envelopes.length - 1; i >= 0 && (!recall || !moment); i--) {
    const e = envelopes[i];
    if (!recall && e.family === "trace") recall = e;
    if (!moment && e.family === "binding" && (e.display as { kind?: string } | undefined)?.kind === "episode") moment = e;
  }
  if (recall && (!moment || recall.seq > moment.seq)) {
    const need = (recall.payload as unknown as TracePayload).need;
    const raw = (need as { participants?: unknown } | undefined)?.participants;
    const who: string[] = Array.isArray(raw) ? raw.map(String) : [];
    return { kind: "thinking", since: recall.observed_at, turn: String(need?.turn_id || ""), withSomeone: who.length > 1 || who.some((p) => !p.startsWith("entity:")) };
  }
  if (moment) {
    const d = moment.display as { graph_id?: string; record_id?: string } | undefined;
    return { kind: "moment", at: moment.observed_at, turn: String(moment.turn_id || ""), graphId: String(d?.graph_id || d?.record_id || (moment.payload as { record_id?: string }).record_id || "") };
  }
  return { kind: "none" };
}

/** His lookups in one moment, by tool, from the "[used tool: <name>]"
 * lines of his thinking rounds. Tool results can quote older moments whole
 * (their own heads and thinking lines included), and the format cannot
 * tell a quoted round from a real one, so counting stops at the first
 * quoted exchange (a namespaced head such as "entity:nerin:" inside the
 * rounds) and the count is then a floor: `partial`. */
export function lookupsIn(verbatim: string, entity: string): { items: Array<{ tool: string; count: number }>; partial: boolean } {
  const { spoken } = splitUnspokenThinking(verbatim);
  const x = parseExchange(spoken, entity);
  if (!x?.between) return { items: [], partial: false };
  const name = entity.trim().toLowerCase();
  const counts = new Map<string, number>();
  let thinking = false;
  let partial = false;
  for (const line of x.between.split("\n")) {
    const t = line.trim();
    if (/^[a-z0-9_-]+:[\w.@-]+:$/i.test(t)) {
      partial = true;
      break;
    }
    if (t.toLowerCase() === `${name} (thinking, unspoken):`) thinking = true;
    else if (t === "(what the tools returned:)") thinking = false;
    else if (thinking) {
      const m = t.match(/^\[used tool: ([\w.-]+)\]$/);
      if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
  }
  return { items: [...counts.entries()].map(([tool, count]) => ({ tool, count })), partial };
}

const TOOL_WORDS: Record<string, [string, string]> = {
  web_search: ["web search", "web searches"],
  fetch_url: ["page read", "pages read"],
  read_memory: ["memory reread", "memories reread"],
  search_memory: ["memory search", "memory searches"],
  diary_read: ["diary entry reread", "diary entries reread"],
};

export function lookupWords({ items, partial }: { items: Array<{ tool: string; count: number }>; partial: boolean }): string {
  if (items.length === 0) return partial ? "lookups not counted (his record quotes older moments)" : "no lookups";
  const words = items.map(({ tool, count }) => `${count} ${(TOOL_WORDS[tool] ?? [tool, tool])[count === 1 ? 0 : 1]}`).join(", ");
  return partial ? `at least ${words}` : words;
}

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return "";
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

export function NowLine({ envelopes, live, source, onOpen }: { envelopes: ReplayEnvelope[]; live: boolean; source: VerbatimSource | null; onOpen(id: string): void }): React.ReactElement | null {
  const state = useMemo(() => nowState(envelopes), [envelopes]);
  const [clock, setClock] = useState(Date.now());
  const [lookups, setLookups] = useState<{ graphId: string; words: string } | null>(null);
  useEffect(() => {
    const t = window.setInterval(() => setClock(Date.now()), 10_000);
    return () => window.clearInterval(t);
  }, []);
  const momentId = state.kind === "moment" ? state.graphId : "";
  useEffect(() => {
    if (!momentId || !source) return;
    let cancelled = false;
    // An episode record: a pure read (no access recorded).
    readRecordWords(source, momentId, "episode")
      .then((w) => !cancelled && setLookups({ graphId: momentId, words: lookupWords(lookupsIn(w.text, source.entity)) }))
      .catch(() => !cancelled && setLookups(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentId, source?.baseUrl, source?.entity]);

  if (!live || state.kind === "none") return null;
  if (state.kind === "thinking") {
    const tick = turnLabel(state.turn, !state.withSomeone);
    return (
      <div className="now_line now_thinking" role="status">
        <span className="now_dot" aria-hidden="true" />
        <span>
          <strong>Thinking</strong>
          {tick ? ` — ${tick}` : ""}, since {clockUtc(state.since)} UTC ({ago(state.since, clock)}).{" "}
          <span className="now_note">
            {state.withSomeone ? "His answer appears when it is ready." : "What he looks up and his answer appear when this tick ends."}
          </span>
        </span>
      </div>
    );
  }
  const tick = turnLabel(state.turn, true);
  return (
    <div className="now_line" role="status">
      <span className="now_dot now_dot_idle" aria-hidden="true" />
      <span>
        <strong>Last moment</strong>
        {tick ? ` — ${tick}` : ""} ended {clockUtc(state.at)} UTC ({ago(state.at, clock)})
        {lookups?.graphId === state.graphId ? ` · ${lookups.words}` : ""}.{" "}
        <button className="el_open_btn" onClick={() => onOpen(state.graphId)}>
          open →
        </button>
      </span>
    </div>
  );
}
