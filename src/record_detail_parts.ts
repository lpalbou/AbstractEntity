/**
 * What a Detail card says first about a memory, a recall or a feeling, in
 * plain words — from the fold's own fields only (operator 2026-11-07:
 * "clicking on a memory should always give us the key information and meta
 * first. then we can deep dive if needed with proper progressive
 * disclosure").
 */

import type { BeatState, DreamSignal, NodeState, StandingState } from "./stream_fold";

/** The kinds his identity is made of (graph_canvas IDENTITY_KINDS, plus
 * limits, which the spark also plants). */
const IDENTITY_WORDS: Record<string, string> = {
  value: "One of his values",
  purpose: "One of his purposes",
  trait: "One of his traits",
  limit: "One of his limits",
  claim: "Something he holds true about himself",
};

const KIND_WORDS: Record<string, string> = {
  episode: "A lived moment",
  summary: "A summary he formed — a look back over a session, or memories brought together in sleep",
  lesson: "A lesson he drew",
  interest: "An interest that took root",
  dream: "A dream — the sleep pass at work on his memories",
  world_model: "His working model of someone or something",
  observation: "An observation",
  realization: "A realization",
  question: "A question",
  relation: "A link between two memories",
  memory: "A memory",
};

/** The diary entry types (the diary_type the stream serves). */
const DIARY_WORDS: Record<string, string> = {
  note: "a note",
  reflection: "a reflection",
  question: "a question he left open",
  problem: "a problem he noted",
  lesson: "a lesson",
  commitment: "a commitment",
  idea: "an idea",
};

/** The kind of a record, in plain words. */
export function kindWords(node: Pick<NodeState, "kind" | "diary" | "diary_type" | "bookkeeping" | "maintenance">): string {
  if (node.diary) {
    const t = node.diary_type ? DIARY_WORDS[node.diary_type] ?? `a ${node.diary_type.replace(/_/g, " ")}` : null;
    return t ? `A diary entry — ${t}` : "A diary entry";
  }
  if (node.bookkeeping) return `An engine act${node.maintenance ? ` (${node.maintenance})` : ""} — the engine's own bookkeeping, not a memory`;
  return IDENTITY_WORDS[node.kind] ?? KIND_WORDS[node.kind] ?? `A ${node.kind.replace(/_/g, " ")}`;
}

/** Whether the app may read a record's words without being asked: never
 * for a diary-shaped one (the read is recorded in his biography), never for
 * relation rows and engine acts (they carry no words). */
export function wordsReadOnOpen(node: Pick<NodeState, "kind" | "diary" | "bookkeeping" | "graph_id" | "id">): boolean {
  if (node.diary || node.kind === "diary" || /(^|:)diary-/.test(String(node.graph_id ?? node.id ?? ""))) return false;
  return node.kind !== "relation" && !node.bookkeeping;
}

/** A dream's key line, from its signals (memory's night telemetry). */
export function dreamLine(signals: DreamSignal[] | null): string {
  const s = signals ?? [];
  if (s.length === 0) return "The night left no record of what it moved.";
  const changed = s.filter((x) => x.kind === "changed_understanding" && (x.act === "card_formed" || x.act === "card_revised")).reduce((n, x) => n + (x.touched?.length ?? 0), 0);
  const tensions = s.filter((x) => x.kind === "unresolved_tension").length;
  const other = s.length - s.filter((x) => (x.kind === "changed_understanding" && (x.act === "card_formed" || x.act === "card_revised")) || x.kind === "unresolved_tension").length;
  const parts: string[] = [];
  if (changed > 0) parts.push(`changed his understanding of ${changed === 1 ? "one thing" : `${changed} things`}`);
  if (tensions > 0) parts.push(`set ${tensions === 1 ? "one tension" : `${tensions} tensions`} side by side`);
  if (other > 0) parts.push(`moved ${other === 1 ? "one more thing" : `${other} more things`}`);
  return `The night ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}.`;
}

/** The recall card's key line. */
export function recallLine(beat: Pick<BeatState, "candidate_count" | "selected" | "committed" | "used_record_ids" | "prompt_token_estimate">): string {
  const shelf = beat.selected.length;
  const base = `He considered ${beat.candidate_count} ${beat.candidate_count === 1 ? "memory" : "memories"}; ${shelf} came to mind`;
  if (!beat.committed) return `${base}; none is recorded as entering his context.`;
  const used = beat.used_record_ids.length;
  return `${base}; ${used} entered his context${beat.prompt_token_estimate ? ` (about ${beat.prompt_token_estimate} tokens)` : ""}.`;
}

/** A trace's turn id in words: "turn 6 of that session" (the runtime's
 * "t-0006"), a reflection, or the id as written. */
export function beatTurnWords(turnId: string | null): string | null {
  const t = String(turnId ?? "");
  if (!t) return null;
  const n = /^t-0*(\d+)$/.exec(t)?.[1];
  if (n) return `turn ${n} of that session`;
  if (t.startsWith("t-reflect")) return "the look back that closed a day";
  return t;
}

/** The standing card's key line: both channels, never netted away. */
export function standingLine(s: Pick<StandingState, "positive" | "negative" | "positive_count" | "negative_count">): string {
  const pos = `+${s.positive} from ${s.positive_count} positive ${s.positive_count === 1 ? "moment" : "moments"}`;
  const neg = `−${s.negative} from ${s.negative_count} negative ${s.negative_count === 1 ? "moment" : "moments"}`;
  return `${pos}; ${neg}.`;
}
