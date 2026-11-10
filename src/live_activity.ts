/**
 * The live activity panel's rows (operator 2026-11-10, root backlog 1196 / app backlog 0010: "the
 * live activity panel (turns/recall bars) must be actionable realtime feedback: what the entity is
 * doing, memory passively retrieved, tools used with key parameters, memory actively retrieved,
 * number of iterations"). DOM-free: served records in, rows out; the component owns pixels.
 *
 * Two sources, one row vocabulary:
 * - his own visit (the driver lane): the visit run's ledger (`GET .../visit/{run}/ledger`), the same
 *   records the gateway folds into a turn's tool details. A turn is everything after the resume of
 *   the visitor's wait that carried his words (effect `resume`, wait key `visitor_input`, a payload
 *   with `text` and not a close: AbstractGateway entity_visits `_served_words`), up to the next wait
 *   on `visitor_input`.
 * - the flow brain: the run's replay view (`activities`: `llm`, `tool`) for thinking and tools, and
 *   the memory stream past the turn's start for what came to mind and what formed.
 *
 * Only what is served is said. Three visit-ledger fields say more where served (AbstractRuntime
 * 1afbf68, entity-runtime.md "What a visit turn's ledger records say"); a record without one reads
 * as before, never "of ?" or "0 found":
 * - `result.handles[i].topic` on a memory_recall record (node RECALL, and a live correction's recall
 *   on node `reason`): the stable key of the topic the memory is in (the topics route's `key`), or
 *   null. The row adds the titles of the topics most of them are in, resolved from the served topics
 *   by key (`withTopicTitles`); a key is never shown.
 * - `effect.payload.iteration` (from 1, per turn) and `effect.payload.max_iterations` on the `reason`
 *   model call: "Step 2 of 50". Without them "Step n" counts the model calls of his reasoning loop
 *   this turn (ledger node `reason`: one call per iteration, abstractagent react_runtime).
 * - `hits` (int) on a search_memory result entry: "→ 7 found".
 * The flow brain's view and stream carry none of them.
 */

import type { ReplayView } from "@abstractframework/panel-chat";

import { classifyBookkeeping, cleanTitle, COMMUNITY_RECORD_KIND } from "./stream_fold";
import type { VisitLedgerRecord } from "./stream_source";
import type { ReplayEnvelope, TracePayload } from "./stream_types";
import { describeToolAsk } from "./turn_probe_parse";
import type { ToolDetail } from "./turn_probe_views";

export type ActivityKind = "thinking" | "writing" | "tool" | "recall_passive" | "recall_active" | "formed" | "wrote";
export type ActivityState = "running" | "done" | "failed";

/** What a click on a row opens. */
export type ActivityOpen =
  /** A record in the Detail panel, by graph id. */
  | { type: "record"; graphId: string }
  /** The memories that came to mind (each opens in Detail when its graph id is served). */
  | { type: "records"; items: Array<{ graphId: string | null; title: string }> }
  /** The tool call with what it returned. */
  | { type: "tool"; tool: ToolDetail };

export interface ActivityRow {
  key: string;
  kind: ActivityKind;
  /** The row in end-user words. */
  text: string;
  /** Second words (the tool's name, the model), or null. */
  detail: string | null;
  state: ActivityState;
  /** How long it took, when both ends are served. */
  seconds: number | null;
  open: ActivityOpen | null;
  /** A passive recall's topics (served keys, never shown), the one most of its memories are in
   * first; absent where none is served. */
  topicKeys?: string[];
}

export interface TurnActivity {
  rows: ActivityRow[];
  /** His reasoning loop's model calls this turn (null where the lane does not serve the loop). */
  steps: number | null;
  tools: number;
  /** Memories that came to mind (identity excluded), null until the recall lands. */
  recalled: number | null;
  formed: number;
  /** The turn has begun on the served record (its first row can be read). */
  begun: boolean;
  /** Everything the turn did is in (it ended, failed or was closed). */
  complete: boolean;
  /** From the turn's first record to its last, when both are served. */
  seconds: number | null;
  /** Which turn this is (the step id of the resume that began it), where the lane serves one. */
  turnKey?: string | null;
}

export const NO_ACTIVITY: TurnActivity = { rows: [], steps: null, tools: 0, recalled: null, formed: 0, begun: false, complete: false, seconds: null };

// ------------------------------------------------------------------ words

/** His memory tools (abstractruntime identity/tools.py TIER1 self reads): a call to one is memory
 * he went looking for, so its row reads "Recalled on purpose". The words name what each asked for,
 * from the argument the tool declares (empty optional argument = the tool's own default). */
const MEMORY_TOOLS: Record<string, (args: Record<string, unknown>) => string> = {
  search_memory: (a) => quoted(a.query) ?? "his memory",
  read_memory: (a) => (str(a.tag) ? `memory ${withHash(str(a.tag))}` : "a memory in full"),
  recent_memories: (a) => (str(a.window) ? `his memories of ${str(a.window)}` : "his memories of the last 2 days"),
  topics: (a) => {
    const t = str(a.topic);
    if (!t) return "his topics";
    return t.startsWith("#") ? `the topic ${t}` : `the topic closest to “${t}”`;
  },
  diary_read: (a) => (str(a.entry) ? `book entry ${str(a.entry)}` : "a book entry"),
  diary_list: (a) => (str(a.limit) ? `his ${str(a.limit)} latest book entries` : "his 5 latest book entries"),
  feelings_about: (a) => (str(a.target) ? `his feelings about ${str(a.target)}` : "his feelings"),
};

/** What his own visit's model calls are doing, by the capability the call names (the visit lane's
 * authoring calls carry `capability`; his reasoning calls carry none). */
const CAPABILITY_WORDS: Record<string, { running: string; done: string }> = {
  summaries: { running: "Writing this moment's title and summary…", done: "Wrote this moment's title and summary" },
};

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** A served count: an integer >= `min`, else null (absent or not a count). */
function servedInt(v: unknown, min: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min ? v : null;
}

function quoted(v: unknown): string | null {
  const s = str(v);
  return s ? `“${s}”` : null;
}

function withHash(tag: string): string {
  return tag.startsWith("#") ? tag : `#${tag}`;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function seconds(start: unknown, end: unknown): number | null {
  const s = Date.parse(String(start ?? ""));
  const e = Date.parse(String(end ?? ""));
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return Math.round((e - s) / 100) / 10;
}

/** A tool's asked-for thing in plain words: the argument it declares (turn_probe_parse's table), else
 * its scalar arguments as `name value`; never JSON. */
export function toolAskWords(name: string, args: Record<string, unknown>): string | null {
  const memory = MEMORY_TOOLS[name];
  if (memory) return memory(args);
  const ask = describeToolAsk(name, JSON.stringify(args));
  if (ask.object !== null) return ask.form === "quote" ? `“${ask.object}”` : ask.object;
  const scalars = Object.entries(args)
    .map(([k, v]) => [k, str(v)] as const)
    .filter(([, v]) => v);
  return scalars.length ? scalars.map(([k, v]) => `${k} ${v}`).join(", ") : null;
}

/** One tool call's row. `outcome.hits`: how many a memory search found, where served. */
export function toolRow(key: string, name: string, args: Record<string, unknown>, state: ActivityState, outcome: { output?: unknown; error?: unknown; hits?: unknown } | null, secs: number | null): ActivityRow {
  const memory = name in MEMORY_TOOLS;
  const ask = toolAskWords(name, args);
  const hits = memory && outcome && state === "done" ? servedInt(outcome.hits, 0) : null;
  const output = outcome ? (typeof outcome.output === "string" ? outcome.output : outcome.output == null ? "" : JSON.stringify(outcome.output)) : undefined;
  const error = outcome && outcome.error != null && outcome.error !== "" ? String(outcome.error) : "";
  const tool: ToolDetail = { name, arg: JSON.stringify(args) };
  if (outcome) {
    tool.result = state === "failed" && !output && error ? error : (output ?? "");
    tool.success = state !== "failed";
  }
  return {
    key,
    kind: memory ? "recall_active" : "tool",
    text: memory ? `Recalled on purpose: ${ask ?? name}${hits !== null ? ` → ${hits} found` : ""}` : ask ? `Tool: ${name} — ${ask}` : `Tool: ${name}`,
    detail: memory ? name : null,
    state,
    seconds: secs,
    open: { type: "tool", tool },
  };
}

function recallRow(key: string, count: number, items: Array<{ graphId: string | null; title: string }>, state: ActivityState, secs: number | null, topicKeys: string[] = []): ActivityRow {
  const row: ActivityRow = {
    key,
    kind: "recall_passive",
    text: state === "running" ? "Recalling…" : `Recalled passively: ${count} ${count === 1 ? "memory" : "memories"}`,
    detail: null,
    state,
    seconds: secs,
    open: state === "running" || items.length === 0 ? null : { type: "records", items },
  };
  if (state === "done" && topicKeys.length) row.topicKeys = topicKeys;
  return row;
}

/** The topics of recalled handles (each handle's served `topic` key), the one most of them are in
 * first, ties by first seen; a handle in no topic (null) or one served without the field is left out. */
export function rankTopicKeys(handles: ReadonlyArray<Record<string, unknown>>): string[] {
  const counts = new Map<string, number>();
  for (const h of handles) {
    const k = typeof h.topic === "string" ? h.topic.trim() : "";
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

function formedRow(key: string, kind: string, title: string, graphId: string | null, state: ActivityState): ActivityRow {
  const diary = kind === "diary";
  const name = title || (diary ? "an entry" : `a ${kind || "memory"}`);
  return {
    key,
    kind: diary ? "wrote" : "formed",
    text: state === "running" ? (diary ? "Writing in his book…" : "Forming a memory…") : diary ? `Wrote in his book: ${name}` : `Formed a memory: ${name}`,
    detail: !diary && kind && kind !== "memory" ? kind : null,
    state,
    seconds: null,
    open: graphId && state !== "running" ? { type: "record", graphId } : null,
  };
}

// ------------------------------------------------------- his own visit

export const VISITOR_WAIT_KEY = "visitor_input";

function effectOf(r: VisitLedgerRecord): { type: string; payload: Record<string, unknown> } {
  const e = r.effect ?? null;
  return { type: String(e?.type ?? ""), payload: obj(e?.payload) };
}

/** The resume of the visitor's wait that carried his words (not a close). */
export function isVisitorTurnStart(r: VisitLedgerRecord): boolean {
  const { type, payload } = effectOf(r);
  if (type !== "resume" || str(payload.wait_key) !== VISITOR_WAIT_KEY) return false;
  const sent = obj(payload.payload);
  return "text" in sent && str(sent.kind) !== "close";
}

/** A wait on the visitor's words: the turn before it is over. */
function isVisitorWait(r: VisitLedgerRecord): boolean {
  const { type, payload } = effectOf(r);
  return type === "wait_event" && str(payload.wait_key) === VISITOR_WAIT_KEY;
}

/** The newest turn's records: after the newest visitor-turn resume, up to the next wait on the
 * visitor (exclusive). `begun` = a turn start was found; `complete` = a wait follows it. */
export function visitTurnSlice(records: readonly VisitLedgerRecord[]): { records: VisitLedgerRecord[]; begun: boolean; complete: boolean; turnKey: string | null } {
  let start = -1;
  for (let i = records.length - 1; i >= 0; i--) {
    if (isVisitorTurnStart(records[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return { records: [], begun: false, complete: false, turnKey: null };
  const turnKey = str(records[start].step_id) || null;
  const out: VisitLedgerRecord[] = [];
  for (let i = start + 1; i < records.length; i++) {
    if (isVisitorWait(records[i])) return { records: out, begun: true, complete: true, turnKey };
    out.push(records[i]);
  }
  return { records: out, begun: true, complete: false, turnKey };
}

/** The ledger node of his reasoning loop: one model call per iteration. */
export const REASON_NODE = "reason";

interface StepPair {
  started: VisitLedgerRecord | null;
  completed: VisitLedgerRecord | null;
  order: number;
}

/** Fold one turn's records (from `visitTurnSlice`) into rows. `runEnded` = the run is terminal (a
 * failed or cancelled run's open steps are not running any more). */
export function foldVisitTurn(records: readonly VisitLedgerRecord[], opts: { begun: boolean; complete: boolean; runEnded?: boolean }): TurnActivity {
  if (!opts.begun) return { ...NO_ACTIVITY, complete: Boolean(opts.runEnded) };
  // Pair each step's started record with its terminal one (a step id served on both).
  const pairs = new Map<string, StepPair>();
  let order = 0;
  for (const r of records) {
    const id = str(r.step_id) || `#${order}`;
    const pair = pairs.get(id) ?? { started: null, completed: null, order: order++ };
    const status = str(r.status);
    if (status === "completed" || status === "failed") pair.completed = r;
    else if (!pair.started) pair.started = r;
    pairs.set(id, pair);
  }
  const rows: ActivityRow[] = [];
  let steps = 0;
  let tools = 0;
  let recalled: number | null = null;
  let formed = 0;
  const ended = opts.complete || Boolean(opts.runEnded);
  for (const [id, pair] of [...pairs.entries()].sort((a, b) => a[1].order - b[1].order)) {
    const first = pair.started ?? pair.completed!;
    const done = pair.completed;
    const { type, payload: startedPayload } = effectOf(first);
    const payload = pair.started ? startedPayload : effectOf(done!).payload; // the started twin keeps the full payload
    const result = done ? obj(done.result) : {};
    const failed = done ? str(done.status) === "failed" : false;
    const state: ActivityState = failed ? "failed" : done ? "done" : ended ? "failed" : "running";
    const secs = done ? seconds(first.started_at ?? done.started_at, done.ended_at) : null;
    const node = str(first.node_id);
    if (type === "llm_call") {
      const model = str(payload.model) || str(result.model);
      if (node === REASON_NODE) {
        steps += 1;
        // The loop's own position where served (runtime 1afbf68), else this turn's count.
        const at = servedInt(payload.iteration, 1) ?? steps;
        const cap = servedInt(payload.max_iterations, 1);
        const step = cap !== null ? `Step ${at} of ${cap}` : `Step ${at}`;
        rows.push({
          key: id,
          kind: "thinking",
          text: state === "running" ? `${step} · thinking…` : state === "failed" ? `${step} · the model call failed` : `${step} · thought`,
          detail: model || null,
          state,
          seconds: secs,
          open: null,
        });
      } else {
        const words = CAPABILITY_WORDS[str(payload.capability)];
        if (words) rows.push({ key: id, kind: "writing", text: state === "running" ? words.running : words.done, detail: model || null, state, seconds: secs, open: null });
      }
      list(result.diary_entries).forEach((d, i) => {
        const e = obj(d);
        formed += 1;
        rows.push(formedRow(`${id}:diary:${i}`, "diary", str(e.title), str(e.projected_record_id) || null, "done"));
      });
      continue;
    }
    if (type === "tool_calls") {
      const outcomes = new Map<string, Record<string, unknown>>();
      const served = list(result.results).map(obj);
      served.forEach((o) => {
        if (str(o.call_id)) outcomes.set(str(o.call_id), o);
      });
      list(payload.tool_calls).forEach((c, i) => {
        const call = obj(c);
        const name = str(call.name) || "tool";
        tools += 1;
        const outcome = (str(call.call_id) && outcomes.get(str(call.call_id))) || (done && !str(call.call_id) ? served[i] : undefined) || null;
        const callState: ActivityState = outcome ? (outcome.success === false ? "failed" : "done") : state === "done" ? "done" : state;
        rows.push(toolRow(`${id}:${i}`, name, obj(call.arguments), callState, outcome ? { output: outcome.output, error: outcome.error, hits: outcome.hits } : null, secs));
      });
      continue;
    }
    if (type === "memory_recall") {
      const handles = list(result.handles).map(obj).filter((h) => str(h.admission) !== "self");
      if (done && !failed) recalled = handles.length;
      const items = handles.map((h) => ({ graphId: str(obj(h.provenance).record_id) || null, title: cleanTitle(str(h.title)) || str(h.kind) || "a memory" }));
      rows.push(recallRow(id, handles.length, items, state, secs, done && !failed ? rankTopicKeys(handles) : []));
      continue;
    }
    if (type === "memory_form") {
      const ids = list(result.record_ids).map(str);
      const recs = list(payload.records).map(obj);
      if (state === "running") {
        rows.push(formedRow(id, str(recs[0]?.kind), "", null, "running"));
        continue;
      }
      if (failed) continue;
      recs.forEach((r, i) => {
        formed += 1;
        rows.push(formedRow(`${id}:${i}`, str(r.kind), cleanTitle(str(r.title)), ids.length === recs.length ? ids[i] || null : null, "done"));
      });
    }
  }
  const firstAt = records.find((r) => r.started_at)?.started_at;
  const last = [...records].reverse().find((r) => r.ended_at || r.started_at);
  return {
    rows,
    steps,
    tools,
    recalled,
    formed,
    begun: true,
    complete: ended,
    seconds: ended ? seconds(firstAt, last?.ended_at || last?.started_at) : null,
  };
}

// --------------------------------------------------------- the flow brain

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/** The flow brain's turn: thinking and tools from the run's replay view, what came to mind and
 * what formed from the memory stream past `sinceSeq` (the turn's start). The view names no loop
 * iteration, so no step number here. */
export function foldFlowTurn(view: ReplayView | null, envelopes: readonly ReplayEnvelope[], sinceSeq: number): TurnActivity {
  const timed: Array<{ at: string; rows: ActivityRow[] }> = [];
  let tools = 0;
  let recalled: number | null = null;
  let formed = 0;
  const viewDone = view ? TERMINAL.has(str(view.status).toLowerCase()) : false;
  for (const a of view?.activities ?? []) {
    const status = str(a.status).toLowerCase();
    const state: ActivityState = status === "completed" ? "done" : status === "failed" || status === "cancelled" ? "failed" : viewDone ? "failed" : "running";
    const secs = state === "running" ? null : seconds(a.started_at, a.ended_at);
    if (a.kind === "llm") {
      timed.push({ at: str(a.started_at), rows: [{ key: `v:${a.id}`, kind: "thinking", text: state === "running" ? "Thinking…" : state === "failed" ? "The model call failed" : "Thought", detail: null, state, seconds: secs, open: null }] });
    } else if (a.kind === "tool") {
      const rows = (a.tool_calls ?? []).map((call, i) => {
        tools += 1;
        const cs = str(call.status).toLowerCase();
        const callState: ActivityState = cs === "completed" ? "done" : cs === "failed" || cs === "denied" || cs === "cancelled" ? "failed" : state;
        const outcome = callState === "running" ? null : { output: call.output, error: call.error };
        return toolRow(`v:${a.id}:${i}`, str(call.name) || "tool", obj(call.arguments), callState, outcome, secs);
      });
      timed.push({ at: str(a.started_at), rows });
    }
  }
  // The memory stream, oldest first, past the turn's start (seq-ordered: walk back to the boundary).
  let from = envelopes.length;
  while (from > 0 && envelopes[from - 1].seq > sinceSeq) from--;
  const selectedTitles = new Map<string, Map<string, { graphId: string | null; title: string }>>();
  for (let i = from; i < envelopes.length; i++) {
    const env = envelopes[i];
    if (env.family === "event" && str(env.payload?.kind) === "selected" && env.trace_id) {
      const byTrace = selectedTitles.get(env.trace_id) ?? new Map();
      const rid = str(env.payload?.record_id);
      if (rid) byTrace.set(rid, { graphId: str(env.display?.graph_id) || null, title: cleanTitle(str(env.display?.title)) || str(env.display?.kind) || "a memory" });
      selectedTitles.set(env.trace_id, byTrace);
    }
  }
  for (let i = from; i < envelopes.length; i++) {
    const env = envelopes[i];
    if (env.family === "trace") {
      const p = env.payload as unknown as TracePayload;
      const selected = list(p.selected).map(str).filter(Boolean);
      const admissions = obj(p.admissions);
      if (p.trace_kind === "reconstruct") {
        const kept = selected.filter((rid) => str(admissions[rid]) !== "self");
        recalled = (recalled ?? 0) + kept.length;
        const titles = selectedTitles.get(str(p.trace_id));
        const items = kept.map((rid) => titles?.get(rid) ?? null).filter((x): x is { graphId: string | null; title: string } => x !== null);
        timed.push({ at: env.observed_at, rows: [recallRow(`e:${env.seq}`, kept.length, items, "done", null)] });
      } else if (p.trace_kind === "probe") {
        const cue = str(p.need?.cue_text);
        timed.push({ at: env.observed_at, rows: [{ key: `e:${env.seq}`, kind: "recall_active", text: `Recalled on purpose: ${cue ? `“${cue}”` : "his memory"} → ${selected.length}`, detail: null, state: "done", seconds: null, open: null }] });
      }
      continue;
    }
    if (env.family === "binding" && str(env.payload?.source) === "remember") {
      const display = env.display ?? {};
      const kind = display.redacted === "diary" || display.diary === true ? "diary" : str(display.kind) || "memory";
      if (kind === COMMUNITY_RECORD_KIND) continue;
      const title = cleanTitle(str(display.title));
      if (classifyBookkeeping(kind, title, display).bookkeeping) continue;
      formed += 1;
      timed.push({ at: env.observed_at, rows: [formedRow(`e:${env.seq}`, kind, title, str(display.graph_id) || null, "done")] });
    }
  }
  // One time line: the view's activities and the stream's acts by when they started.
  timed.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
  const rows = timed.flatMap((t) => t.rows);
  return { rows, steps: null, tools, recalled, formed, begun: rows.length > 0, complete: viewDone, seconds: null };
}

// ------------------------------------------------------------- topics

/** How many topic titles a passive recall's row names. */
export const TOPIC_TITLES_SHOWN = 3;

/** Every topic key the turn's rows carry (to resolve), each once. */
export function activityTopicKeys(a: TurnActivity): string[] {
  const keys = new Set<string>();
  for (const r of a.rows) for (const k of r.topicKeys ?? []) keys.add(k);
  return [...keys];
}

/** The passive recall rows with the titles of their first TOPIC_TITLES_SHOWN topics that have one
 * (`titles`: served key -> authored title; a key with none is skipped, never shown):
 * "Recalled passively: 44 memories · Harbour work, The sea, Old letters". The same object when no
 * row gains a title. */
export function withTopicTitles(a: TurnActivity, titles: ReadonlyMap<string, string>): TurnActivity {
  if (titles.size === 0) return a;
  let changed = false;
  const rows = a.rows.map((r) => {
    if (!r.topicKeys?.length) return r;
    const names: string[] = [];
    for (const k of r.topicKeys) {
      const t = titles.get(k);
      if (t) names.push(t);
      if (names.length === TOPIC_TITLES_SHOWN) break;
    }
    if (!names.length) return r;
    changed = true;
    return { ...r, text: `${r.text} · ${names.join(", ")}` };
  });
  return changed ? { ...a, rows } : a;
}

// ------------------------------------------------------------- words

/** The row that says what he is doing now: the newest running row, else the newest row. */
export function currentRow(a: TurnActivity): ActivityRow | null {
  for (let i = a.rows.length - 1; i >= 0; i--) if (a.rows[i].state === "running") return a.rows[i];
  return a.rows.length ? a.rows[a.rows.length - 1] : null;
}

/** The turn in one line, for the folded summary: what it did, in counts that were served. */
export function turnSummary(a: TurnActivity): string {
  const parts: string[] = [];
  if (a.steps !== null && a.steps > 0) parts.push(`${a.steps} ${a.steps === 1 ? "step" : "steps"}`);
  const active = a.rows.filter((r) => r.kind === "recall_active").length;
  const tools = a.tools - active;
  if (tools > 0) parts.push(`${tools} ${tools === 1 ? "tool" : "tools"}`);
  if (active > 0) parts.push(`${active} memory ${active === 1 ? "search" : "searches"}`);
  if (a.recalled !== null) parts.push(`${a.recalled} ${a.recalled === 1 ? "memory" : "memories"} came to mind`);
  if (a.formed > 0) parts.push(`${a.formed} formed`);
  if (a.seconds !== null) parts.push(`${formatSeconds(a.seconds)}`);
  return parts.length ? parts.join(" · ") : "nothing to show";
}

export function formatSeconds(s: number): string {
  if (s < 10) return `${s.toFixed(1)} s`;
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}
