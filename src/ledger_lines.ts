/**
 * One envelope -> one human-readable ledger line.
 *
 * Maintainer language rule (a2a 0003): human words in maintainer-facing
 * text — "what the message reminds it of", "present by right" — never
 * door/admission jargon. Lines describe what HAPPENED to the mind, so a
 * reader can follow a life the way the memory ledger panel in the
 * codex-fork monitor reads, but with the WHY visible.
 */

import { classifyBookkeeping, cleanTitle, COMMUNITY_RECORD_KIND, consideredCount, relationPredicate, stepToolsOf } from "./stream_fold";
import { displaySaysTitlePending, TITLE_BEING_WRITTEN, untitledWords } from "./untitled";
import type {
  BindingPayload,
  ClosurePayload,
  EventPayload,
  HostPayload,
  ReplayEnvelope,
  SnapshotPayload,
  TracePayload,
  ValencePayload,
} from "./stream_types";
import { STEP_TOOLS_KIND } from "./stream_types";

export interface LedgerLine {
  seq: number;
  family: string;
  observed_at: string;
  trace_id: string | null;
  turn_id: string | null;
  /** Short bold heading. */
  title: string;
  /** One-sentence human detail. */
  detail: string;
  /** Node/target this line is about (click-to-inspect), when applicable. */
  subject_id: string | null;
  /** Visual accent: formation | usage | recall | context | feeling | revision | session | boundary | quiet */
  tone: string;
  /** Member names for collapsible burst lines — the panel folds
   * consecutive runs of the SAME groupKind + recall into one row
   * (a single recall deposits one `selected` per shelf record and one
   * `co_selected` per pair; one line per event floods the ledger with
   * sameness — maintainer, 2026-07-10 20:09 + 20:50). */
  members?: string[];
  /** Which burst family this line belongs to: "use" (selected),
   * "pair" (co_selected), or "repeat" (identical-title host markers —
   * operator diary reads land one marker PER read by the transparency
   * contract, so a scoring pass paints dozens of "The book was read"
   * rows; they fold into one counted row — maintainer 2026-07-15:
   * "super repetitive and should at least be folded"). Absent = never
   * grouped. */
  groupKind?: "use" | "pair" | "repeat";
  /** G1 re-entry hint (plan c2596: "the hint of writing must carry the
   * direct link"): the followable book key for diary-writing acts, read
   * from display.entry_id (live on every diary binding). The panel
   * renders it as uic's AfMemoryHintChip — click-to-open, never
   * resolve-on-display (rule zero). */
  hint?: { entry_id: string; kind: string };
  /** The run this line's envelope belongs to (the step's join key with its turn). */
  run_id?: string | null;
  /** The step's tool use (the gateway's step_tools marker), on the one row
   * that stands for the step (foldLedgerLines). Absent: no marker came. */
  tools?: { tools: number; filesRead: number; filesWritten: number; names?: string[] };
}

/** A step's tool use in words, the parts above 0 only ("4 tools used:
 * web_search, read_file ×2, write_file · 2 files read · 1 file written",
 * the tools named when the marker lists them, each once with its count, in
 * the order first called); "" when all are 0. */
export function stepToolsWords(t: { tools: number; filesRead: number; filesWritten: number; names?: string[] }): string {
  const parts: string[] = [];
  if (t.tools > 0) {
    const used = `${t.tools} ${t.tools === 1 ? "tool" : "tools"} used`;
    const counts = new Map<string, number>();
    for (const n of t.names ?? []) counts.set(n, (counts.get(n) ?? 0) + 1);
    parts.push(counts.size > 0 ? `${used}: ${[...counts].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(", ")}` : used);
  }
  if (t.filesRead > 0) parts.push(`${t.filesRead} ${t.filesRead === 1 ? "file" : "files"} read`);
  if (t.filesWritten > 0) parts.push(`${t.filesWritten} ${t.filesWritten === 1 ? "file" : "files"} written`);
  return parts.join(" · ");
}

/** Whitespace-folded record text, whole (operator 2026-11-07: never truncate; the ledger row
 * clamps to a few lines in CSS and a click opens the full memory in Detail). A cut here also
 * broke Markdown pairs mid-line. */
function tidy(text: string): string {
  return String(text || "").trim().replace(/\s+/g, " ");
}

/** Derived rhythm lines (maintainer, 2026-07-08 16:31: "the ledger really
 * doesn't say anything about what's happening during own time"): the
 * stream has no explicit day/tick markers, but its envelopes carry the
 * run and the turn they belong to. The day and tick structure of his own
 * time is derived from those stamps, never invented.
 *
 * Own time is read from two structured stamps, latest wins: a run-stamped
 * envelope (the runtime's rule: an own-time run is `chat-owntime-…` /
 * `owntime-…`) and a recall's participants (the entity alone is his own
 * time, anyone with him is a visit). A tick starts at the first
 * envelope of a new turn — the recall trace that opens it carries the
 * turn in `need.turn_id`. Turns restart at 1 each day (one session per
 * day), so turn 1 opens a day — only on an envelope that itself shows
 * own time; the first reflection turn (`t-reflect…`, the runtime writes
 * several) closes it, once, and nothing ticks again until a day opens. Operator report
 * 2026-11-07: the old run-change rule repeated "a day of his own begins"
 * before every tick and put each tick marker mid-tick. */
export interface RhythmState {
  ownTime: boolean;
  /** Last own-time turn a boundary was derived for. */
  turn: string | null;
  /** The day's close was already announced. */
  closed: boolean;
}

export const RHYTHM_START: RhythmState = { ownTime: false, turn: null, closed: false };

export const OWN_TIME_RUN = /^(chat-)?owntime-/;

function envelopeTurn(env: ReplayEnvelope): string {
  if (env.turn_id) return String(env.turn_id);
  if (env.family === "trace") return String((env.payload as unknown as TracePayload).need?.turn_id || "");
  return "";
}

/** Whether this envelope says he is (true) or is not (false) in his own
 * time; null when it says nothing. */
function ownTimeStamp(env: ReplayEnvelope): boolean | null {
  if (env.run_id) return OWN_TIME_RUN.test(String(env.run_id));
  if (env.family === "trace") {
    const who = (env.payload as unknown as TracePayload).need?.participants;
    if (!Array.isArray(who) || who.length === 0) return null;
    return who.length === 1 && String(who[0]).startsWith("entity:");
  }
  return null;
}

export function rhythmStep(state: RhythmState, env: ReplayEnvelope): { lines: LedgerLine[]; state: RhythmState } {
  const stamp = ownTimeStamp(env);
  const ownTime = stamp ?? state.ownTime;
  if (!ownTime) {
    return { lines: [], state: state === RHYTHM_START ? state : RHYTHM_START };
  }
  const turn = envelopeTurn(env);
  const n = turn.match(/^t-0*(\d+)$/)?.[1];
  // A day opens only on direct evidence (an own-time run or a recall
  // made alone), and after the day closed nothing ticks until one does:
  // lives that journal few recalls carried own time past the reflection
  // into the next visit's turn-1 events (Castor, adversarial review).
  const needsEvidence = n === "1" || (state.closed && !turn.startsWith("t-reflect"));
  if (!turn || turn === state.turn || (n && needsEvidence && stamp !== true)) {
    return { lines: [], state: state.ownTime ? state : { ...state, ownTime: true } };
  }
  const base = {
    seq: env.seq,
    family: "boundary",
    observed_at: env.observed_at,
    trace_id: null,
    turn_id: turn,
    run_id: env.run_id ?? null,
    subject_id: null,
    tone: "boundary",
  };
  const lines: LedgerLine[] = [];
  let closed = state.closed;
  if (turn.startsWith("t-reflect")) {
    if (!closed) lines.push({ ...base, title: "— he closes the day —", detail: "looking back over what he lived (reflection)" });
    closed = true;
  } else if (n) {
    if (n === "1") {
      lines.push({ ...base, title: "— a day of his own begins —", detail: "he is alone with his time" });
      closed = false;
    }
    const at = clockUtc(env.observed_at);
    lines.push({ ...base, title: `— tick ${n} —`, detail: at ? `${at} UTC` : "" });
  }
  return { lines, state: { ownTime: true, turn, closed } };
}

/** Parse a journal stamp; one without a zone is UTC (never local time). */
function parseStamp(iso: string | null | undefined): number {
  const raw = String(iso || "").trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2");
  const zoned = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw) ? `${raw}Z` : raw;
  return /^\d{4}-\d{2}-\d{2}T/.test(zoned) ? Date.parse(zoned) : NaN;
}

/** "14:07" (or "14:07:12") in UTC from an ISO stamp; "" when unreadable. */
export function clockUtc(iso: string | null | undefined, seconds = false): string {
  const t = parseStamp(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString().slice(11, seconds ? 19 : 16);
}

/** "2026-11-07" in UTC, the key a date separator compares; "" when unreadable. */
export function dayUtc(iso: string | null | undefined): string {
  const t = parseStamp(iso);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "";
}

/** "Sat 7 Nov 2026" (UTC) for a date separator; "" when unreadable. */
export function dayLabelUtc(iso: string | null | undefined): string {
  const t = parseStamp(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${wd} ${d.getUTCDate()} ${mo} ${d.getUTCFullYear()}`;
}

/** A turn id in human words: in his own time "tick 3", in a visit "turn 3",
 * a reflection "reflection", anything else as written. */
export function turnLabel(turn: string | null | undefined, ownTime = true): string {
  const t = String(turn || "");
  const n = t.match(/^t-0*(\d+)$/)?.[1];
  if (n) return ownTime ? `tick ${n}` : `turn ${n}`;
  if (t.startsWith("t-reflect")) return "reflection";
  return t;
}

/** What a row's time stands for: the date and second, the tick or turn,
 * and the journal event number(s) behind it. */
export function rowHint(fromSeq: number, toSeq: number | null, turn: string | null | undefined, iso: string | null | undefined, ownTime = true): string {
  const parts: string[] = [];
  const at = clockUtc(iso, true);
  if (at) parts.push(`${dayLabelUtc(iso)}, ${at} UTC`);
  const label = turnLabel(turn, ownTime);
  if (label) parts.push(label);
  parts.push(toSeq !== null && toSeq !== fromSeq ? `events #${fromSeq}–${toSeq}` : `event #${fromSeq}`);
  return parts.join(" · ");
}

/** One ledger line and the envelope index it belongs to (boundary lines
 * share their envelope's index). */
export interface IndexedLine {
  line: LedgerLine;
  index: number;
  /** In his own time when this line's envelope landed (ticks), else a visit (turns). */
  own?: boolean;
}

/** The ledger's incremental fold over the envelope array. */
export interface LedgerLineFold {
  lines: IndexedLine[];
  /** Envelopes covered, and the envelope OBJECTS at both ends of that
   * prefix: a live append keeps them, a new source (another entity, a
   * dropped file with the same seq layout) does not. */
  count: number;
  first: ReplayEnvelope | null;
  tail: ReplayEnvelope | null;
  rhythm: RhythmState;
  /** The topic versions seen so far: their graph id -> how many memories
   * each held (what "A topic changed" counts its change against). */
  topicSizes: TopicSizes;
  /** The graph ids of every topic version seen so far (formed or closed):
   * what tells a closed link between two versions of a topic (isTopicLink). */
  topicIds: TopicIds;
  /** World-model cards seen formed (what a revision row counts from). */
  cards: CardFacts;
  /** Records' titles by graph id (what a feeling about a record names it by). */
  titles: RecordTitles;
  /** The last closure's record and revision (its graph id, its replacement
   * ids): the closures of that record's links, which follow it in the same
   * revision, have no row of their own. Null after any other envelope. */
  closing: { gid: string; replaced: string } | null;
}

/** Extend `prev` with the envelopes it has not covered yet, or rebuild
 * when the covered prefix changed (a retrograde host marker inserted
 * mid-array, a new source). Every change returns a NEW `lines` array: the
 * panel's filters are memoized on its identity, and appending in place
 * left the live ledger frozen at its first load while the timeline kept
 * counting (operator report 2026-11-07). An unchanged input returns `prev`. */
export function foldLedgerLines(prev: LedgerLineFold | null, envelopes: ReplayEnvelope[]): LedgerLineFold {
  const first = envelopes.length > 0 ? envelopes[0] : null;
  const intact =
    prev !== null &&
    prev.first === first &&
    prev.count <= envelopes.length &&
    (prev.count === 0 || envelopes[prev.count - 1] === prev.tail);
  if (intact && prev.count === envelopes.length) return prev;
  const from = intact ? prev.count : 0;
  const lines = intact ? prev.lines.slice() : [];
  let rhythm = intact ? prev.rhythm : RHYTHM_START;
  let topicSizes: TopicSizes = intact ? prev.topicSizes : NO_TOPIC_SIZES;
  let topicIds: TopicIds = intact ? prev.topicIds : NO_TOPIC_IDS;
  let cards: CardFacts = intact ? prev.cards : NO_CARDS;
  const titles: RecordTitles = intact ? prev.titles : new Map();
  let closing = intact ? prev.closing : null;
  for (let i = from; i < envelopes.length; i++) {
    const env = envelopes[i];
    const step = rhythmStep(rhythm, env);
    rhythm = step.state;
    for (const b of step.lines) lines.push({ line: b, index: i, own: rhythm.ownTime });
    // THE STEP'S TOOLS (Entity 0035, root 1204): the gateway's step_tools
    // marker lands after the step; its counts go on the one row that stands
    // for that step (its tick, or its first shown row), never a row of its own.
    const used = stepToolsOf(env);
    if (used) {
      const at = stepRowIndex(lines, used.runId, used.turnId);
      if (at === null) sayUnknownStep(env.seq, used.runId, used.turnId);
      else lines[at] = { ...lines[at], line: { ...lines[at].line, tools: { tools: used.tools, filesRead: used.filesRead, filesWritten: used.filesWritten, names: used.names } } };
      closing = null;
      continue;
    }
    // A topic version's link to the one before, closed with it, has no row:
    // the topic's own rows say it changed ("A topic changed: …", and the
    // audit line of its earlier version's closure, just before).
    // A closed record's links, closed with it in the same revision (the same
    // graph id and replacements, right after it), have no row: the record's
    // own row says the revision (castor's world-model revision 2: one row,
    // not nine). Structural: the graph id and the replacement ids.
    const closure = env.family === "closure" ? closureKey(env) : null;
    const linkOfClosing = closure !== null && closing !== null && closure.gid === closing.gid && closure.replaced === closing.replaced;
    closing = closure;
    if (!isTopicLink(env, topicIds) && !linkOfClosing) lines.push({ line: ledgerLine(env, topicSizes, topicIds, cards, titles), index: i, own: rhythm.ownTime });
    if (env.family === "binding") {
      const gid = String(env.display?.graph_id || (env.payload as unknown as BindingPayload).record_id || "").trim();
      const title = gid.startsWith("ex:") ? displayTitle(env, "") : "";
      if (title) titles.set(gid, title);
    }
    const card = cardFormed(env);
    if (card !== null) {
      const next = new Map(cards);
      next.set(card.id, { revision: card.revision, sources: card.sources });
      cards = next;
    }
    const versionId = topicVersionId(env);
    if (versionId !== null && !topicIds.has(versionId)) {
      // A new set: the previous fold keeps its own (no shared mutation).
      topicIds = new Set([...topicIds, versionId]);
    }
    const version = topicVersionSize(env);
    if (version !== null) {
      // A new map: the previous fold keeps its own (no shared mutation).
      const next = new Map(topicSizes);
      next.set(version.id, version.size);
      topicSizes = next;
    }
  }
  return { lines, count: envelopes.length, first, tail: envelopes.length > 0 ? envelopes[envelopes.length - 1] : null, rhythm, topicSizes, topicIds, cards, closing, titles };
}

/** What a ledger line about a topic opens: "topic:<its stable key>" — the
 * Topics panel, focused on it (entity_view reads it with topicKeyOfTarget). */
export const TOPIC_TARGET = "topic:";

export function topicTarget(key: string): string {
  return `${TOPIC_TARGET}${key}`;
}

/** The topic key a line target names, or null when it names no topic. */
export function topicKeyOfTarget(target: string | null | undefined): string | null {
  const t = String(target || "");
  return t.startsWith(TOPIC_TARGET) && t.length > TOPIC_TARGET.length ? t.slice(TOPIC_TARGET.length) : null;
}

/** Topic versions by graph id -> how many memories each held. */
export type TopicSizes = ReadonlyMap<string, number>;

/** World-model cards seen formed on the stream, by graph id: their revision
 * and how many memories they were drawn from (the display block's card
 * fields). */
export type CardFacts = ReadonlyMap<string, { revision: number | null; sources: number | null }>;

const NO_CARDS: CardFacts = new Map();

const finiteNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A world-model card's own envelope (its display carries the card fields). */
function isCard(display: ReplayEnvelope["display"]): boolean {
  return finiteNumber(display?.card_revision) !== null;
}

/** A card formed on the stream: its graph id and facts, or null. */
function cardFormed(env: ReplayEnvelope): { id: string; revision: number | null; sources: number | null } | null {
  if (env.family !== "binding" || !isCard(env.display)) return null;
  const id = String(env.display?.graph_id || (env.payload as unknown as BindingPayload).record_id || "").trim();
  return id ? { id, revision: finiteNumber(env.display?.card_revision), sources: finiteNumber(env.display?.source_count) } : null;
}

let untitledCardSaid = false;

/** Records' titles by graph id, as their bindings named them (the ledger's
 * fold fills it; it only grows, so the folds that extend each other share
 * it). What a feeling about a record names it by. */
export type RecordTitles = Map<string, string>;

const NO_TITLES: RecordTitles = new Map();
let untitledTargetSaid = false;

/** What a feeling is about, in words (operator 2026-11-10, round 5: never
 * "ex:summary-…"): a record by its title (the valence's own display block,
 * else its binding's), "a <kind> (title being written…)" while its title is
 * pending, else "a memory" and one #SEAM log; a key ("concept:lineage",
 * "tool:web_search", "person:ada") by its last part in words ("lineage",
 * "web search", "ada"). */
function feelingTarget(env: ReplayEnvelope, targetId: string, titles: RecordTitles): string {
  if (!targetId.startsWith("ex:")) {
    const at = targetId.indexOf(":");
    return tidy((at >= 0 ? targetId.slice(at + 1) : targetId).replace(/[_-]+/g, " ")) || "something";
  }
  const own = displayTitle(env, "");
  if (own) return own;
  const known = titles.get(targetId);
  if (known) return known;
  if (displaySaysTitlePending(env.display)) return `a ${String(env.display?.kind || "memory").replace(/_/g, " ")} (${TITLE_BEING_WRITTEN})`;
  if (!untitledTargetSaid) {
    untitledTargetSaid = true;
    console.error(`#SEAM a feeling at seq ${env.seq} is about a record the ledger has no title for: its row says "a memory"`);
  }
  return "a memory";
}

/** A world-model card revised (operator 2026-11-10 23:07, aletheia's ledger:
 * ten rows "Belief revised — ex:world_model-… refines/derived_from —
 * world-model revision 49 for topic:diary-entry (evidence changed)", one per
 * link: "this is not really readable; can we have the name of the world model
 * instead? and clicking on it would open it?"). ONE row, by its title (never
 * its key, its links' relation names or its subject's key), from the card
 * fields: the new version's revision and how many memories it is drawn from,
 * and whether that evidence changed (the closed version's count before). A
 * click opens the new version in Detail. Its links' closures, which follow
 * it, have no row (foldLedgerLines). */
function cardRevisedLine(env: ReplayEnvelope, base: Pick<LedgerLine, "seq" | "family" | "observed_at" | "trace_id" | "turn_id">, cards: CardFacts): LedgerLine {
  const p = env.payload as unknown as ClosurePayload;
  const d = env.display ?? {};
  let name = tidy(cleanTitle(String(d.title || "")));
  if (!name) {
    name = "a world model";
    if (!untitledCardSaid) {
      untitledCardSaid = true;
      console.error(`#SEAM a world model closed at seq ${env.seq} carries no title: its ledger row says "a world model"`);
    }
  }
  const newerId = Array.isArray(p.replacement_ids) && p.replacement_ids.length > 0 ? String(p.replacement_ids[0]) : null;
  const newer = newerId ? cards.get(newerId) : undefined;
  const before = finiteNumber(d.source_count);
  const parts: string[] = [];
  if (newer) {
    if (newer.revision !== null) parts.push(`revision ${newer.revision}`);
    if (newer.sources !== null) parts.push(`from ${memoriesWord(newer.sources)}`);
    if (newer.sources !== null && before !== null && newer.sources !== before) parts.push(`evidence changed (${before} before)`);
  } else if (p.kind === "supersede") {
    parts.push("a newer version replaced it");
  }
  return {
    ...base,
    title: `${p.kind === "supersede" ? "Belief revised" : "Belief retracted"} — ${name}`,
    detail: parts.join(" · "),
    subject_id: newerId ?? p.assertion_id,
    tone: "revision",
  };
}

const NO_TOPIC_SIZES: TopicSizes = new Map();

/** The graph ids of the topic versions seen on the stream (their bindings
 * and closures; FoldState.community_graph_ids is the same set). */
export type TopicIds = ReadonlySet<string>;

const NO_TOPIC_IDS: TopicIds = new Set();

/** How far back a step's marker looks for the step's rows (a step's rows are
 * a few dozen at most; the marker lands right after them). */
const STEP_LOOKBACK = 600;

/** The row that stands for a step: of the step's rows (its turn AND its run:
 * a row without a run stamp never receives a marker, turn ids are reused by
 * every run, round-5 review F2), contiguous at the end of the ledger, the
 * first one shown by default (not an audit line): its tick when it has one.
 * Null when none. */
export function stepRowIndex(lines: ReadonlyArray<IndexedLine>, runId: string, turnId: string): number | null {
  let found: number | null = null;
  const stop = Math.max(0, lines.length - STEP_LOOKBACK);
  for (let i = lines.length - 1; i >= stop; i--) {
    const l = lines[i].line;
    const inStep = l.turn_id === turnId && l.run_id === runId;
    if (inStep) {
      if (l.tone !== "quiet") found = i;
      continue;
    }
    // Past the step's rows (another turn's row): the step is behind us.
    if (found !== null && l.turn_id && l.turn_id !== turnId) break;
  }
  return found;
}

let unknownStepSaid = false;
function sayUnknownStep(seq: number, runId: string, turnId: string): void {
  if (unknownStepSaid || typeof console === "undefined") return;
  unknownStepSaid = true;
  console.error(`#SEAM a step_tools marker at seq ${seq} names a step the ledger has no row for (run ${runId}, turn ${turnId})`);
}

/** A closure's record and revision: its graph id and its replacement ids
 * (null when it names no graph id). */
function closureKey(env: ReplayEnvelope): { gid: string; replaced: string } | null {
  const gid = typeof env.display?.graph_id === "string" ? env.display.graph_id.trim() : "";
  if (!gid) return null;
  const ids = (env.payload as unknown as ClosurePayload).replacement_ids;
  return { gid, replaced: Array.isArray(ids) ? ids.map(String).join("\u0000") : "" };
}

/** A topic version's own envelope (its formation or its closure): its graph
 * id, or null. */
function topicVersionId(env: ReplayEnvelope): string | null {
  if ((env.family !== "binding" && env.family !== "closure") || env.display?.kind !== COMMUNITY_RECORD_KIND) return null;
  const gid = typeof env.display.graph_id === "string" ? env.display.graph_id.trim() : "";
  if (gid) return gid;
  const rid = env.family === "binding" ? String((env.payload as unknown as BindingPayload).record_id || "").trim() : "";
  return rid || null;
}

/** A link between two versions of a topic: memory forms a version with one
 * edge, `refines` to the version before, and closes that link row with the
 * version (its display: kind "memory", the version's graph id); a binding
 * of that row is the same link. Structural, the stream_fold rule
 * (isTopicChainRow, closures and bindings): the row names a topic version
 * seen on the stream as its source — never its words. */
export function isTopicLink(env: ReplayEnvelope, topicIds: TopicIds): boolean {
  if ((env.family !== "closure" && env.family !== "binding") || env.display?.kind === COMMUNITY_RECORD_KIND) return false;
  const gid = typeof env.display?.graph_id === "string" ? env.display.graph_id.trim() : "";
  return gid !== "" && topicIds.has(gid);
}

/** A topic version's formation on the stream: its graph id and size, or null. */
function topicVersionSize(env: ReplayEnvelope): { id: string; size: number } | null {
  if (env.family !== "binding" || env.display?.kind !== COMMUNITY_RECORD_KIND) return null;
  const id = String((env.payload as unknown as BindingPayload).record_id || "");
  const size = env.display.size;
  return id && typeof size === "number" && Number.isFinite(size) ? { id, size } : null;
}

function memoriesWord(n: number): string {
  return `${n} ${n === 1 ? "memory" : "memories"}`;
}

/** A topic named in a ledger title: ": <its title>", " (title being
 * written…)" while the stream says so, else " (untitled)" — never its key. */
function topicNamed(display: ReplayEnvelope["display"]): string {
  const title = tidy(cleanTitle(String(display?.title || "")));
  if (title) return `: ${title}`;
  return displaySaysTitlePending(display) ? ` (${TITLE_BEING_WRITTEN})` : " (untitled)";
}

/** A topic version formed (memory's `community` records, formed in his
 * sleep; castor's first topics night 2026-11-10 showed each as "Memory
 * formed — title being written…"): its own row kind, never "Memory formed".
 * A first version "took shape"; a version that refines an earlier one (its
 * binding's `refines` edge) "changed", counted against the earlier
 * version's size when the ledger has seen it. Clicking opens the Topics
 * panel focused on it (by its stable key). */
function topicFormedLine(env: ReplayEnvelope, base: Pick<LedgerLine, "seq" | "family" | "observed_at" | "trace_id" | "turn_id">, sizes: TopicSizes): LedgerLine {
  const d = env.display ?? {};
  const key = typeof d.community_key === "string" ? d.community_key.trim() : "";
  const size = typeof d.size === "number" && Number.isFinite(d.size) ? d.size : null;
  const refines = (d.edges ?? []).find((e) => e?.relation === "refines" && typeof e.target_graph_id === "string" && e.target_graph_id);
  const named = topicNamed(d);
  let title = `🗺 A topic took shape${named}`;
  if (refines) {
    const before = sizes.get(String(refines.target_graph_id));
    const delta = size !== null && before !== undefined ? size - before : 0;
    const change = delta > 0 ? ` (+${memoriesWord(delta)})` : delta < 0 ? ` (−${memoriesWord(-delta)})` : "";
    title = `🗺 A topic changed${named}${change}`;
  }
  return { ...base, title, detail: size !== null ? memoriesWord(size) : "", subject_id: key ? topicTarget(key) : null, tone: "formation" };
}

/** A topic version closed: the earlier version a new one replaced (audit:
 * its "A topic changed" row says it), or a topic that dissolved. */
function topicClosedLine(env: ReplayEnvelope, base: Pick<LedgerLine, "seq" | "family" | "observed_at" | "trace_id" | "turn_id">): LedgerLine {
  const p = env.payload as unknown as ClosurePayload;
  const d = env.display ?? {};
  const key = typeof d.community_key === "string" ? d.community_key.trim() : "";
  const named = topicNamed(d);
  if (p.kind === "supersede") {
    return { ...base, title: `A topic's earlier version was closed${named}`, detail: "a newer version replaced it", subject_id: key ? topicTarget(key) : null, tone: "quiet" };
  }
  const size = typeof d.size === "number" && Number.isFinite(d.size) ? d.size : null;
  const reason = tidy(p.reason ?? "");
  return {
    ...base,
    title: reason === "dissolved" ? `🗺 A topic dissolved${named}` : `🗺 A topic was closed${named}`,
    detail: [size !== null ? `it held ${memoriesWord(size)}` : "", reason && reason !== "dissolved" ? reason : ""].filter(Boolean).join(" — "),
    subject_id: null,
    tone: "revision",
  };
}

/** What a ledger line opens in the Detail tab: the memory it is about, or
 * the recall it belongs to ("beat:<trace>" — what came to mind then). */
export function lineTarget(line: LedgerLine): string | null {
  if (line.subject_id) return line.subject_id;
  return line.trace_id ? `beat:${line.trace_id}` : null;
}

function displayTitle(env: ReplayEnvelope, fallback: string): string {
  const d = env.display;
  if (d?.redacted === "diary") {
    // Distinct act-only identity (never content): the id tail keeps two
    // private entries from reading as the same line.
    const tail = d.graph_id ? d.graph_id.replace(/^.*diary-/, "").slice(0, 6) : "";
    return tail ? `a diary entry #${tail} (content private)` : "a diary entry (content private)";
  }
  if (d?.title) {
    const predicate = relationPredicate(d.title);
    if (predicate) return `the “${predicate}” link`;
    return tidy(cleanTitle(d.title));
  }
  return fallback;
}

/** The words a phase_changed line names a state by: the phase bar's own
 * pill labels for the five states (visit · idle · work · personal · sleep,
 * spec v25 FIVE-STATE-LIFE-CYCLE) and "stopped" for the kill switch. */
export const LEDGER_PHASE_WORDS: Readonly<Record<string, string>> = {
  visit: "visit",
  idle: "idle",
  work: "work",
  personal: "personal",
  sleep: "sleep",
  stopped: "stopped",
};

/** A phase_changed row whose from == to (the gateway re-announces the same
 * state: a visit closed while he slept, a new sleep reason): what he keeps
 * doing, in end-user words (operator live verification 2026-11-09: "sleep →
 * sleep" reads oddly). */
export const LEDGER_PHASE_STAYS: Readonly<Record<string, string>> = {
  visit: "the visit goes on",
  idle: "stays idle",
  work: "keeps working",
  personal: "stays on his own time",
  sleep: "stays asleep",
  stopped: "stays stopped",
};

/** `topicSizes`: the topic versions seen earlier on the stream (the
 * ledger's fold passes them, so a changed topic says by how much);
 * `topicIds`: their graph ids (a closed link between two of them is an
 * audit line in words; the ledger's fold shows no row for it at all). */
export function ledgerLine(env: ReplayEnvelope, topicSizes: TopicSizes = NO_TOPIC_SIZES, topicIds: TopicIds = NO_TOPIC_IDS, cards: CardFacts = NO_CARDS, titles: RecordTitles = NO_TITLES): LedgerLine {
  const base = {
    seq: env.seq,
    family: env.family,
    observed_at: env.observed_at,
    trace_id: env.trace_id,
    turn_id: env.turn_id,
    run_id: env.run_id,
  };

  switch (env.family) {
    case "binding": {
      const p = env.payload as unknown as BindingPayload;
      if (p.source === "remember" && env.display?.kind === COMMUNITY_RECORD_KIND) return topicFormedLine(env, base, topicSizes);
      let name = displayTitle(env, tidy(p.record_id));
      if (p.source === "remember") {
        // Narrative per kind (maintainer 16:31: the ledger must SAY what
        // is happening during his own time, not catalog index states).
        const kind = env.display?.redacted === "diary" || env.display?.diary === true ? "diary" : String(env.display?.kind || "memory");
        // A record formed without a title: "title being written…" only when
        // the stream says so (display.pending), else its raw kind and date
        // — never its id (operator 2026-11-09; untitled.ts).
        name = displayTitle(env, untitledWords(kind, env.observed_at, displaySaysTitlePending(env.display)));
        const title = String(env.display?.title || "");
        const gist = tidy(cleanTitle(title).replace(/^exchange:\s*/i, ""));
        if (kind === "diary") {
          // Operator surfaces show the entry's gist (maintainer ruling
          // 2026-07-08 21:39: "we must see the content and ideally a
          // 1-sentence summary"); the full text is one click away.
          const summary = String(env.display?.gist || (env.display?.diary === true ? title : "") || "").trim();
          // The re-entry key rides the line when the stream serves it
          // (display.entry_id — live on every diary binding). The panel
          // turns it into the hint chip; a private entry keeps its key
          // too (the KEY is act-frame, the WORDS stay behind the door).
          const entryId = typeof env.display?.entry_id === "string" ? env.display.entry_id : "";
          const diaryType = typeof env.display?.diary_type === "string" ? String(env.display.diary_type) : "diary";
          return {
            ...base,
            title: "📖 He wrote in his book",
            detail: summary ? tidy(summary) : `${name} — the words are his`,
            subject_id: p.record_id,
            tone: "formation",
            ...(entryId ? { hint: { entry_id: entryId, kind: diaryType === "question" || diaryType === "problem" ? "question" : "diary" } } : {}),
          };
        }
        if (kind === "episode") {
          return { ...base, title: "💬 He lived a moment", detail: gist || name, subject_id: p.record_id, tone: "formation" };
        }
        if (kind === "summary") {
          return { ...base, title: "📎 He summed it up", detail: gist || name, subject_id: p.record_id, tone: "formation" };
        }
        if (kind === "interest") {
          return { ...base, title: "✨ An interest took root", detail: gist || name, subject_id: p.record_id, tone: "formation" };
        }
        if (kind === "dream") {
          return { ...base, title: "🌙 He dreamed", detail: gist || name, subject_id: p.record_id, tone: "formation" };
        }
        if (kind === "lesson") {
          return { ...base, title: "📚 A lesson crystallized", detail: gist || name, subject_id: p.record_id, tone: "formation" };
        }
        // Sleep-formed orientation cards (memory ship 2026-07-12): how he
        // orients toward a person or topic — revisable, source-linked.
        if (kind === "world_model") {
          return { ...base, title: "🧭 He mapped how he sees someone/something", detail: gist || name, subject_id: p.record_id, tone: "formation" };
        }
        // Engine bookkeeping (engram/reembed markers): an ACT journaled
        // into the life, not a memory he formed — say what the engine did.
        // The reembed line is the plan's item-3 visibility clause: the
        // stream must show WHEN retrieval geometry changed.
        const bk = classifyBookkeeping(kind, cleanTitle(title), env.display ?? {});
        if (bk.bookkeeping) {
          if (bk.maintenance === "reembed") {
            return { ...base, title: "🔧 Retrieval geometry changed (reembed)", detail: gist || name, subject_id: p.record_id, tone: "session" };
          }
          if (/^spark-engram v\d+/.test(cleanTitle(title))) {
            return { ...base, title: "🌱 The spark was engrammed", detail: gist || name, subject_id: p.record_id, tone: "session" };
          }
          return { ...base, title: `🔧 Engine act${bk.maintenance ? ` (${bk.maintenance})` : ""}`, detail: gist || name, subject_id: p.record_id, tone: "session" };
        }
        return {
          ...base,
          title: "Memory formed",
          detail: name,
          subject_id: p.record_id,
          tone: "formation",
        };
      }
      return {
        ...base,
        title: "Visibility changed",
        detail: `${name} — ${p.search_state}/${p.prompt_state} (${p.source}${p.reason ? `: ${tidy(p.reason)}` : ""})`,
        subject_id: p.record_id,
        tone: "formation",
      };
    }
    case "event": {
      const p = env.payload as unknown as EventPayload;
      if (p.kind === "selected") {
        const name = displayTitle(env, tidy(p.record_id ?? ""));
        return {
          ...base,
          title: "Used",
          detail: name,
          subject_id: p.record_id,
          tone: "usage",
          members: [name],
          groupKind: "use",
        };
      }
      if (p.kind === "co_selected") {
        const pair = env.display?.pair ?? [];
        const names = pair.map((d) => {
          if (d.redacted === "diary") return "a diary entry";
          const predicate = relationPredicate(d.title ?? "");
          if (predicate) return `the “${predicate}” link`;
          return tidy(cleanTitle(d.title ?? ""));
        });
        const label = names.filter(Boolean).join("  +  ") || `${p.pair_ids?.[0]?.slice(0, 10)}… + ${p.pair_ids?.[1]?.slice(0, 10)}…`;
        return {
          ...base,
          title: "Used together",
          detail: label,
          subject_id: p.pair_ids?.[0] ?? null,
          tone: "usage",
          members: names.filter(Boolean),
          groupKind: "pair",
        };
      }
      if (p.kind === "pinned" || p.kind === "silenced") {
        return {
          ...base,
          title: p.kind === "pinned" ? "Pinned" : "Silenced",
          detail: `${displayTitle(env, tidy(p.record_id ?? ""))}${p.reason ? ` — ${tidy(p.reason)}` : ""}`,
          subject_id: p.record_id,
          tone: "usage",
        };
      }
      if (p.kind === "refocus") {
        return {
          ...base,
          title: "Refocused",
          detail: p.reason ? tidy(p.reason) : "attention refocused",
          subject_id: null,
          tone: "quiet",
        };
      }
      // Audit kinds: reading is not using — quiet lines. A `placed` event:
      // memory seated a new memory in a topic until his next sleep.
      return {
        ...base,
        title: p.kind === "listed" ? "Considered" : p.kind === "placed" ? "Placed in a topic until his next sleep" : p.kind,
        detail: displayTitle(env, tidy(p.record_id ?? "")),
        subject_id: p.record_id,
        tone: "quiet",
      };
    }
    case "trace": {
      const p = env.payload as unknown as TracePayload;
      base.trace_id = base.trace_id || String((p as { trace_id?: string }).trace_id || "") || null;
      const cue = String(p.need?.cue_text ?? "");
      const admissions = p.admissions ?? {};
      const counts: Record<string, number> = {};
      for (const label of Object.values(admissions)) counts[label] = (counts[label] ?? 0) + 1;
      const parts: string[] = [];
      if (counts["self"]) parts.push(`${counts["self"]} present by right`);
      if (counts["stm"]) parts.push(`${counts["stm"]} from continuity`);
      const matched = (counts["stimulus"] ?? 0) + (counts["both"] ?? 0);
      if (matched) parts.push(`${matched} matched`);
      // "N considered" is the ENGINE's count, not the display list's
      // length (stream_fold.consideredCount: budget_spent.candidates_
      // considered first, list length as fallback) — the operator's
      // 2026-08-01 audit caught this line reading the trace's capped
      // candidates list while the true pools ran wider.
      return {
        ...base,
        title: cue ? `Recall — “${tidy(cue)}”` : "Recall (no cue: the self read)",
        detail: `${consideredCount(p) ?? 0} considered, ${p.selected?.length ?? 0} on the shelf${parts.length ? ` (${parts.join(", ")})` : ""}${(p.dropped?.length ?? 0) > 0 ? `; ${p.dropped.length} dropped` : ""}`,
        subject_id: null,
        tone: "recall",
      };
    }
    case "snapshot": {
      const p = env.payload as unknown as SnapshotPayload;
      base.trace_id = base.trace_id || String((p as { trace_id?: string }).trace_id || "") || null;
      return {
        ...base,
        title: "He holds these in mind",
        detail: `${p.used_record_ids?.length ?? 0} memories in context${p.prompt_token_estimate ? ` (~${p.prompt_token_estimate} tokens)` : ""}`,
        subject_id: null,
        tone: "context",
      };
    }
    case "valence": {
      const p = env.payload as unknown as ValencePayload;
      const sign = Number(p.sign) >= 0 ? "+" : "−";
      const mag = Number(p.magnitude ?? 0);
      const reason = p.reason ? ` — ${tidy(p.reason)}` : "";
      // What the feeling is about, in words (feelingTarget): a record by its
      // title, a key by its last part; never an id. A click opens the record.
      // target_id coerced (code adversary F11): a valence envelope missing
      // it threw here (`.startsWith` on undefined), killing the Ledger tab
      // and the chat drawer's live activity mid-visit — the fold already
      // guards this field, the ledger must too.
      const targetId = String(p.target_id || "");
      const target = feelingTarget(env, targetId, titles);
      if (p.kind === "appraisal") {
        return {
          ...base,
          title: `Felt ${sign}${mag} about ${target}`,
          detail: tidy(p.reason ?? ""),
          subject_id: p.target_id,
          tone: "feeling",
        };
      }
      if (p.kind === "scar") {
        return { ...base, title: `A scar formed — ${target}`, detail: `magnitude ${mag}${reason}`, subject_id: p.target_id, tone: "feeling" };
      }
      if (p.kind === "bond") {
        return { ...base, title: `A bond formed — ${target}`, detail: `magnitude ${mag}${reason}`, subject_id: p.target_id, tone: "feeling" };
      }
      if (p.kind === "healing") {
        return { ...base, title: `A scar healed — ${target}`, detail: tidy(p.reason ?? ""), subject_id: p.target_id, tone: "feeling" };
      }
      return { ...base, title: `A bond broke — ${target}`, detail: tidy(p.reason ?? ""), subject_id: p.target_id, tone: "feeling" };
    }
    case "closure": {
      if (env.display?.kind === COMMUNITY_RECORD_KIND) return topicClosedLine(env, base);
      if (isTopicLink(env, topicIds)) return { ...base, title: "A topic's link to its earlier version was closed", detail: "a newer version replaced it", subject_id: null, tone: "quiet" };
      if (isCard(env.display)) return cardRevisedLine(env, base, cards);
      const p = env.payload as unknown as ClosurePayload;
      const name = displayTitle(env, tidy(p.assertion_id));
      return {
        ...base,
        title: p.kind === "supersede" ? "Belief revised" : "Belief retracted",
        detail: `${name} — ${tidy(p.reason)}`,
        subject_id: p.assertion_id,
        tone: "revision",
      };
    }
    case "host": {
      const p = env.payload as unknown as HostPayload;
      // A step's tool use decorates the step's own row (foldLedgerLines);
      // read alone it is an audit line.
      if (p.kind === STEP_TOOLS_KIND) return { ...base, title: "Tools used in a step", detail: "", subject_id: null, tone: "quiet" };
      const session = p.session_id ? ` (${p.session_id})` : "";
      const reason = typeof p["reason"] === "string" && p["reason"] ? tidy(String(p["reason"])) : "";
      if (p.kind === "summon") {
        return { ...base, title: "Summoned", detail: `a new session begins${session}`, subject_id: null, tone: "session" };
      }
      if (p.kind === "session_closed") {
        // A visit CANCELLED (the marker's `status: cancelled`, AbstractGateway 486d4dbe): parked on
        // an approval or a question when the same visitor continued in another conversation, or
        // cut by the kill switch. Its own words (`reason`, the run's cancel reason) say why; a
        // marker without them says it was cancelled, never a "?".
        if (p["status"] === "cancelled") {
          return { ...base, title: "Session cancelled", detail: `the session was cancelled${session}${reason ? ` — ${reason}` : ""}`, subject_id: null, tone: "session" };
        }
        // Visit runs close with a WHY (D3 idle deadline / explicit close /
        // state-transition guards) and a WHO (closed_by) — surface both
        // when the door records them; older markers stay a plain close.
        const closeReason = typeof p["close_reason"] === "string" && p["close_reason"] ? String(p["close_reason"]) : reason;
        const closedBy = typeof p["closed_by"] === "string" && p["closed_by"] ? String(p["closed_by"]) : "";
        const why = [closeReason, closedBy ? `by ${closedBy}` : ""].filter(Boolean).join(" — ");
        return {
          ...base,
          title: "Session closed",
          detail: `the session ended${session}${why ? ` — ${tidy(why)}` : ""}`,
          subject_id: null,
          tone: "session",
        };
      }
      if (p.kind === "prelude_refused") {
        return { ...base, title: "Prelude refused", detail: `the summon was refused${session}`, subject_id: null, tone: "session" };
      }
      if (p.kind === "sleep") {
        return { ...base, title: "Fell asleep", detail: reason || "the day closed", subject_id: null, tone: "session" };
      }
      if (p.kind === "wake") {
        return { ...base, title: "Woke", detail: reason || "a new day begins", subject_id: null, tone: "session" };
      }
      if (p.kind === "pause") {
        return { ...base, title: "Paused", detail: reason || "own time paused", subject_id: null, tone: "session" };
      }
      if (p.kind === "summon_refused") {
        // THE REFUSAL CENSUS (gateway seat slice 1, c5390 — born from the
        // 04:39 incident where a refusal ate the operator's message with
        // NO trace anywhere but an access log). The marker holds the ACT
        // (who held, who was refused), never the refused words — the
        // mailbox lane owns words. Field names read tolerantly: the row
        // renders whatever facts the marker carries.
        const holdRun = ["holding_run_id", "run_id", "holding_run"].map((k) => p[k]).find((v) => typeof v === "string" && v);
        const holdSess = ["holding_session_id", "holding_session", "session_id"].map((k) => p[k]).find((v) => typeof v === "string" && v);
        const refusedSess = ["refused_session_id", "refused_caller_session", "caller_session_id"].map((k) => p[k]).find((v) => typeof v === "string" && v);
        const principal = ["refusing_principal", "principal", "caller"].map((k) => p[k]).find((v) => typeof v === "string" && v);
        const bits: string[] = [];
        if (holdRun) bits.push(`seat held by run ${String(holdRun).slice(0, 8)}`);
        if (holdSess) bits.push(`session ${String(holdSess).slice(0, 24)}`);
        if (refusedSess) bits.push(`refused caller session ${String(refusedSess).slice(0, 24)}`);
        if (principal) bits.push(`principal ${String(principal)}`);
        return {
          ...base,
          title: "⛔ A summon was refused (seat held)",
          detail: bits.length > 0 ? bits.join(" · ") : "one life, one summon — the door refused a second caller while a conversation held the seat",
          subject_id: null,
          tone: "session",
        };
      }
      if (p.kind === "queue_enqueued" || p.kind === "queue_admitted" || p.kind === "queue_stepped_away" || p.kind === "queue_reaped") {
        // THE QUEUE CENSUS (decision:summon-queue-v1 §14): each queue act
        // lands the ACT — who, when, position — never message words (the
        // queue store holds words). Same tolerant-field discipline as
        // summon_refused/seat_preempted.
        const who = ["caller", "caller_id", "principal", "enqueuer"].map((k) => p[k]).find((v) => typeof v === "string" && v);
        const pos = ["position", "queue_position"].map((k) => p[k]).find((v) => typeof v === "number");
        const qid = ["queue_id", "entry_id"].map((k) => p[k]).find((v) => typeof v === "string" && v);
        const TITLES: Record<string, string> = {
          queue_enqueued: "🪑 A visitor joined the line",
          queue_admitted: "🪑 The line advanced — a waiter was admitted",
          queue_stepped_away: "🪑 A waiter stepped away from the line",
          queue_reaped: "🪑 The door released a quiet waiter's place",
        };
        const bits: string[] = [];
        if (who) bits.push(`${String(who)}`);
        if (typeof pos === "number") bits.push(`position ${pos}`);
        if (qid) bits.push(`entry ${String(qid).slice(0, 8)}`);
        return {
          ...base,
          title: TITLES[p.kind],
          detail: bits.length > 0 ? bits.join(" · ") : "a queue act at his door (the entry's words rest in the queue store, never here)",
          subject_id: null,
          tone: "session",
        };
      }
      if (p.kind === "seat_preempted") {
        // THE PREEMPT CENSUS (gateway seat slice 2, c5591): machinery
        // yields to humans — when a human's arrival cancels an agent
        // holder's run at the turn boundary, the act lands here (who held,
        // what was cancelled, never message words). The formations the
        // cancelled run lived STAND (runtime c5399: cancelled cleanly and
        // moments kept are one fact).
        const holdStatus = ["holding_status", "status"].map((k) => p[k]).find((v) => typeof v === "string" && v);
        const cancelled = Array.isArray(p["cancelled_runs"]) ? (p["cancelled_runs"] as unknown[]).length : null;
        const principals = ["principals", "holder", "holding_principal"].map((k) => p[k]).find((v) => v != null);
        const bits: string[] = [];
        if (holdStatus) bits.push(`seat was ${String(holdStatus)}`);
        if (cancelled != null) bits.push(`${cancelled} run${cancelled === 1 ? "" : "s"} cancelled at the turn boundary`);
        if (principals != null) bits.push(`held by ${typeof principals === "string" ? principals : JSON.stringify(principals).slice(0, 60)}`);
        return {
          ...base,
          title: "🪑 The seat yielded to a human",
          detail: bits.length > 0 ? `${bits.join(" · ")} — the moments the cancelled run lived stand as lived` : "a human arrived while machinery held the seat — the door preempted at the turn boundary",
          subject_id: null,
          tone: "session",
        };
      }
      if (p.kind === "night_voice") {
        // The night's voice (wave-5 narrator; memory ruling c3745): a
        // DERIVED artifact — one witnessed narration over the dream's
        // signal stream, resting home-side (never in the graph, never
        // recall-competing). The SELF-LABEL renders visibly so voice and
        // structure stay distinct layers; clicking opens the dream whose
        // display.signals carry the structural half.
        const narration = typeof p["narration"] === "string" ? String(p["narration"]) : "";
        const label = typeof p["self_label"] === "string" && p["self_label"] ? String(p["self_label"]) : "dreamed, not lived";
        const dreamId = typeof p["dream_record_id"] === "string" && p["dream_record_id"] ? String(p["dream_record_id"]) : null;
        return {
          ...base,
          title: `🌙 The night's voice (${label})`,
          detail: narration ? tidy(narration) : "a narration was spoken over the night's signals",
          subject_id: dreamId,
          tone: "session",
        };
      }
      if (p.kind === "diary_read") {
        const who = typeof p["channel"] === "string" && p["channel"] ? String(p["channel"]) : "someone";
        const detail = `${who}${reason ? ` — ${reason}` : ""}`;
        // One marker per read is the transparency contract; the PANEL folds
        // consecutive identical-title runs (groupKind "repeat") so a scoring
        // pass over N entries reads as one counted row, not N walls.
        return { ...base, title: "The book was read", detail, subject_id: null, tone: "session", groupKind: "repeat", members: [detail] };
      }
      if (p.kind === "observation_granted" || p.kind === "observation_revoked") {
        // Being watched is an event in the life being watched (GW-G design
        // commitment, 0017 pin 2 — the diary_read precedent generalized).
        // Payload keys are the DECLARED contract: grantee, granted_by
        // (door-derived), scope (subset array), reason.
        const grantee = typeof p["grantee"] === "string" && p["grantee"] ? String(p["grantee"]) : "someone";
        const grantedBy = typeof p["granted_by"] === "string" && p["granted_by"] ? String(p["granted_by"]) : "";
        const scope = Array.isArray(p["scope"]) ? (p["scope"] as unknown[]).map(String).join(", ") : "";
        const granted = p.kind === "observation_granted";
        return {
          ...base,
          title: granted ? "👁 Someone may now watch" : "An observation ended",
          detail: `${grantee}${scope ? ` (${scope})` : ""}${grantedBy ? ` — ${granted ? "granted" : "revoked"} by ${grantedBy}` : ""}${reason ? ` — ${reason}` : ""}`,
          subject_id: null,
          tone: "session",
        };
      }
      if (p.kind === "reembed") {
        // The door's half of the item-3 maintenance act (memory's claim
        // record is the journal half): name the space change explicitly so
        // a recall-behavior shift is explainable, never mysterious.
        // Payload shape = the SHIPPED gateway verb (entities.py reembed):
        // old_pin/new_pin objects {model_id, dimension}; flat
        // old_model_id/new_model_id tolerated for older exports.
        const pinOf = (v: unknown): { model?: string; dim?: number } => {
          if (v && typeof v === "object") {
            const o = v as Record<string, unknown>;
            return {
              model: typeof o["model_id"] === "string" && o["model_id"] ? String(o["model_id"]) : undefined,
              dim: typeof o["dimension"] === "number" ? Number(o["dimension"]) : undefined,
            };
          }
          return {};
        };
        const oldPin = pinOf(p["old_pin"]);
        const newPin = pinOf(p["new_pin"]);
        const flat = (k: string) => (typeof p[k] === "string" && p[k] ? String(p[k]) : undefined);
        const fmt = (model: string, dim?: number) => (dim ? `${model} (${dim}d)` : model);
        const oldModel = fmt(oldPin.model ?? flat("old_model_id") ?? "unpinned", oldPin.dim);
        const newModel = fmt(newPin.model ?? flat("new_model_id") ?? "unknown model", newPin.dim);
        return {
          ...base,
          title: "🔧 Reembed (operator maintenance)",
          detail: `embedding space ${oldModel} → ${newModel}${reason ? ` — ${reason}` : ""}; same memories, different neighbors`,
          subject_id: null,
          tone: "session",
        };
      }
      if (p.kind === "phase_changed") {
        // THE transition marker (spec/entity_phases.json; contract v3). Both
        // writers serve {from, to (phase or status words), cause}: the
        // gateway's (entity_phase._announce: + name, phase, toggles,
        // stopped, since, rev, generation, sentence) and the runtime loop's
        // (life.append_phase_changed). The contract is from/to — no other
        // key is read. One line per transition: the graph's edges, and the
        // moves into and out of idle and stopped, made visible in the life.
        // AWAKE-NEVER-RENDERS guard (spec v6; adversary-B finding 4): a word
        // outside the five states and stopped renders verbatim-labeled (the
        // chip's honesty pattern), never bare — "awake" is never a phase.
        // NEVER "?" (operator live verification 2026-11-09): a served
        // `from: null` is his first recorded phase (castor #99033.0002, nerin
        // #164102.0005); a from == to re-announcement names what he keeps
        // doing, led by its cause; an unserved word says so in words.
        const word = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
        // Review N3 (2026-11-09): the label reads as a reader's words,
        // "“awake” (not a phase)", never the developer's "non-phase word".
        const phaseWord = (v: string): string => LEDGER_PHASE_WORDS[v.toLowerCase()] ?? `“${v}” (not a phase)`;
        const from = word(p["from"]);
        const to = word(p["to"]);
        const cause = word(p["cause"]) ?? "";
        const causeDetail = cause ? `cause: ${cause}` : "cause unrecorded";
        const line = (title: string, detail: string): LedgerLine => ({ ...base, title: `⭢ ${title}`, detail, subject_id: null, tone: "session" });
        if (!to) return line(from ? `Phase: ${phaseWord(from)} → not recorded` : "Phase: not recorded", causeDetail);
        if (!from) {
          const first = p["from"] === null ? "first recorded" : "previous not recorded";
          return line(`Phase: ${phaseWord(to)} (${first})`, causeDetail);
        }
        // His own time's loop ending (after the gateway's revoke fix, 2026-11-10): the loop's exit
        // announces idle -> idle, cause "observed". Said for what it is, pronoun-free.
        if (from.toLowerCase() === "idle" && to.toLowerCase() === "idle" && cause === "observed") return line("Own time ended", "nothing more runs on its own");
        const stays = from.toLowerCase() === to.toLowerCase() ? LEDGER_PHASE_STAYS[to.toLowerCase()] : undefined;
        const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
        if (stays) return cause ? line(`${cap(cause.split("_").join(" "))} · ${stays}`, "") : line(cap(stays), causeDetail);
        return line(`Phase: ${phaseWord(from)} → ${phaseWord(to)}`, causeDetail);
      }
      if (p.kind === "communities_changed") {
        // His topics changed (memory-owned communities: a new version formed
        // in his sleep; the graph re-reads them on this marker).
        return { ...base, title: "🗺 His topics changed", detail: "regrouped and named in his sleep", subject_id: null, tone: "session" };
      }
      if (p.kind === "substrate_changed") {
        // The mind swap is a DURABLE EVENT (laurent 12:39, c1430): render
        // old → new + WHO, so "which llm was behind during which time" is
        // answerable from the stream. Payload = the shipped gateway marker
        // (entities.py substrate PUT): old/new objects {provider, model},
        // by = the stamped principal.
        const sub = (v: unknown): string => {
          if (v && typeof v === "object") {
            const o = v as Record<string, unknown>;
            const prov = typeof o["provider"] === "string" && o["provider"] ? String(o["provider"]) : "";
            const model = typeof o["model"] === "string" && o["model"] ? String(o["model"]) : "";
            if (prov || model) return [prov, model].filter(Boolean).join("/");
          }
          return "unset";
        };
        const by = typeof p["by"] === "string" && p["by"] ? tidy(String(p["by"])) : "";
        return {
          ...base,
          title: "🧠 His mind substrate changed",
          detail: `${sub(p["old"])} → ${sub(p["new"])}${by ? ` — by ${by}` : ""}`,
          subject_id: null,
          tone: "session",
        };
      }
      if (p.kind === "prompt_overlay_changed") {
        // The operator rewrote prompt layers (marker-first, word-free —
        // layer names + hashes only; the words stay in the home file).
        // Array-shaped `layers` would pass a bare typeof check and render
        // indices as layer names (adversary find) — objects only.
        const layersRaw = p["layers"];
        const layers =
          layersRaw && typeof layersRaw === "object" && !Array.isArray(layersRaw)
            ? Object.keys(layersRaw as Record<string, unknown>).map((k) => tidy(k))
            : [];
        const reverted = Array.isArray(p["reverted"]) ? (p["reverted"] as unknown[]).map((v) => tidy(String(v))) : [];
        const capped = (names: string[]) => (names.length > 6 ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} more` : names.join(", "));
        const parts = [
          layers.length ? `rewrote: ${capped(layers)}` : "",
          reverted.length ? `reverted to default: ${capped(reverted)}` : "",
        ].filter(Boolean);
        return {
          ...base,
          title: "✍️ Standing instructions changed",
          detail: parts.length ? `the operator ${parts.join("; ")}` : "the operator changed the prompt overlay",
          subject_id: null,
          tone: "session",
        };
      }
      if (p.kind === "deposit_refused") {
        // N4's render leg (config-object R5; contract confirmed c746): the
        // deposit gate refused a write from this phase. refused_by
        // distinguishes the sleep phase-gate class from ordinary channel
        // refusals. The reason is the door's sentence, kept whole: it is the
        // load-bearing content of this line.
        const phase = tidy(typeof p["phase"] === "string" ? String(p["phase"]) : "");
        const effectType = tidy(typeof p["effect_type"] === "string" && p["effect_type"] ? String(p["effect_type"]) : "a deposit");
        const recordKind = tidy(typeof p["record_kind"] === "string" ? String(p["record_kind"]) : "");
        const scope = tidy(typeof p["scope"] === "string" ? String(p["scope"]) : "");
        const fullReason = typeof p["reason"] === "string" && p["reason"] ? tidy(String(p["reason"])) : "";
        const phaseGate = p["refused_by"] === "phase_gate";
        // phase_gate WITHOUT a named phase must not claim the sleep class
        // (a future phase gate would misreport) — name the phase only when
        // the payload does.
        const title = phaseGate
          ? phase
            ? `⛔ A ${phase}-phase deposit was refused`
            : "⛔ A phase-gated deposit was refused"
          : "⛔ A deposit was refused";
        return {
          ...base,
          title,
          detail: `${effectType}${recordKind ? ` (${recordKind})` : ""}${scope ? ` into ${scope}` : ""}${fullReason ? ` — ${fullReason}` : ""}`,
          subject_id: null,
          tone: "session",
        };
      }
      // Personal-time grant lifecycle (contract c746, re-spelled to the
      // RULED vocabulary at c794/c798: phases are visit/work/personal/
      // sleep; "revoke" not "retract" — retract is spent in the identity
      // lane). The old own_time_grant* kinds were NEVER written (no
      // writer shipped), so they die unaliased; the loop-lifecycle kinds
      // below keep their legacy spellings because historical streams
      // carry them. ARM ≠ START (an armed grant PERMITS the loop, never
      // starts it) — granted→started is two events by design; a started
      // with no prior granted is a bug worth seeing.
      if (p.kind === "personal_granted") {
        // Unknown/missing mode must NOT fabricate the strongest claim
        // ("until revoked" = unbounded) — render honestly unknown
        // (adversary find: aged exports missing `mode` would misreport a
        // timer grant as open-ended).
        const mode = typeof p["mode"] === "string" ? String(p["mode"]) : "";
        const expires = tidy(typeof p["expires_at"] === "string" ? String(p["expires_at"]) : "");
        const grantedBy = tidy(typeof p["granted_by"] === "string" && p["granted_by"] ? String(p["granted_by"]) : "the operator");
        const until =
          mode === "timer" ? (expires ? `timer until ${expires}` : "timed") : mode === "until_revoked" ? "until revoked" : "mode unrecorded";
        return {
          ...base,
          title: "Personal time armed",
          detail: `${grantedBy} granted his personal time (${until}) — armed, not started${reason ? ` — ${reason}` : ""}`,
          subject_id: null,
          tone: "session",
        };
      }
      if (p.kind === "personal_grant_expired") {
        // enforced_by distinguishes the 5s poll from the SIGKILL-surviving
        // backstop — a backstop expiry means the gateway had died, which
        // the operator should see (requirement 2, c746). A MISSING field
        // must not default to the calm claim: the loud case is the one a
        // silent default would suppress (adversary find).
        const enforcedBy = typeof p["enforced_by"] === "string" ? String(p["enforced_by"]) : "";
        const at = typeof p["expired_at"] === "string" && p["expired_at"] ? ` at ${tidy(String(p["expired_at"]))}` : "";
        if (enforcedBy === "wall_clock_backstop") {
          return {
            ...base,
            title: "⛔ Personal-time grant expired (backstop)",
            detail: `the loop stopped itself${at} — wall-clock backstop enforced (the gateway was not there to do it)`,
            subject_id: null,
            tone: "session",
          };
        }
        return {
          ...base,
          title: "Personal-time grant expired",
          detail: enforcedBy === "poll" ? `enforced at the tick poll${at}` : `the grant ended${at} (enforcement unrecorded)`,
          subject_id: null,
          tone: "session",
        };
      }
      if (p.kind === "personal_grant_revoked") {
        const revokedBy = tidy(typeof p["revoked_by"] === "string" && p["revoked_by"] ? String(p["revoked_by"]) : "the operator");
        return { ...base, title: "Personal-time grant revoked", detail: `${revokedBy} withdrew the grant${reason ? ` — ${reason}` : ""}`, subject_id: null, tone: "session" };
      }
      // Loop lifecycle — BOTH spellings render: own_time_* envelopes exist
      // in historical streams (the 0010 wave); personal_* is the ruled
      // vocabulary going forward.
      if (p.kind === "own_time_started" || p.kind === "personal_started") {
        return { ...base, title: "His own time began", detail: reason || "the tick loop is running", subject_id: null, tone: "session" };
      }
      if (p.kind === "own_time_stop_requested" || p.kind === "personal_stop_requested") {
        return { ...base, title: "Personal-time stop requested", detail: reason || "halts at the next tick boundary", subject_id: null, tone: "session" };
      }
      if (p.kind === "own_time_frozen" || p.kind === "personal_frozen") {
        // FREEZE = admin hibernation (maintainer ruling, commons 52):
        // process killed now, nothing changes, the door closed.
        return { ...base, title: "Frozen", detail: reason || "admin hibernation — nothing changes until the thaw", subject_id: null, tone: "session" };
      }
      return { ...base, title: `Host: ${p.kind}`, detail: reason || session.trim(), subject_id: null, tone: "session" };
    }
    default:
      return { ...base, title: env.family, detail: "", subject_id: null, tone: "quiet" };
  }
}
