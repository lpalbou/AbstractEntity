// GRAPH LENSES (maintainer sign-off 2026-07-12: "the memory graph is pretty
// inefficient to access information").
//
// A lens is a one-click SEMANTIC filter over the fold: it computes the set
// of node ids to emphasize (everything else dims — the exact mechanism the
// text search already uses, so the canvas needs zero new render paths).
// Lenses answer the operator's standing questions in one click instead of a
// hunt across a hairball: who is this entity (identity), what just happened
// (recent), what does it feel (feelings), what did it elect to keep (diary),
// what did sleep propose (dreams), what is it wondering (questions/ideas).
import type { FoldState } from "./stream_fold";
import type { TemporalActivation } from "./temporal_activation";

export type GraphLens = "all" | "identity" | "recent" | "warm" | "feelings" | "diary" | "dreams" | "questions";

export const LENSES: Array<{ id: GraphLens; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "the whole life, no filter" },
  { id: "identity", label: "Identity", hint: "values, purposes, traits, interests — who this entity is" },
  { id: "recent", label: "Recent", hint: "records born or selected in the newest tenth of the life" },
  { id: "warm", label: "Warm", hint: "temporally active now — recent selections, decaying" },
  { id: "feelings", label: "Feelings", hint: "records and standings carrying valence" },
  { id: "diary", label: "Diary", hint: "elected memories (content sealed)" },
  { id: "dreams", label: "Dreams", hint: "sleep proposals — unconfirmed until waking evidence" },
  { id: "questions", label: "Questions", hint: "open questions and lessons (closed ones drop out)" },
];

// Identity per the ENGINE's identity kinds (spark: value/purpose/trait +
// entity-elected interests). Deliberately narrower than the canvas COLOR
// map, which paints `claim` identity-gold for legibility — a lens must not
// call engine claims "who this entity is" (adversary P1: the two sets
// contradicted each other silently).
const IDENTITY_KINDS = new Set(["value", "purpose", "trait", "interest"]);
// Only kinds that exist in the engine's record vocabulary — `problem` and
// `idea` are diary types / wake reasons, not record kinds; listing them
// here made the lens overclaim (adversary P1).
const QUESTION_KINDS = new Set(["question", "lesson"]);

/** A diary projection that IS an open question/problem (dm#27 forensics:
 * elected questions fold as kind="diary" — invisible to the kind filter;
 * diary_type is the honest key, served type-only by memory's display
 * addition). */
function isOpenQuestionDiary(node: { diary: boolean; diary_type: string | null; closed: unknown }): boolean {
  return node.diary && !node.closed && (node.diary_type === "question" || node.diary_type === "problem");
}

/** Compute the emphasized node-id set for a lens; null = no filter (all).
 * Pure read over the fold — safe to memoize on [fold, temporal, lens]. */
export function lensIds(fold: FoldState, temporal: TemporalActivation, lens: GraphLens): Set<string> | null {
  if (lens === "all") return null;
  const out = new Set<string>();

  if (lens === "identity") {
    for (const node of fold.nodes.values()) {
      if (node.bookkeeping) continue;
      if (IDENTITY_KINDS.has(node.kind)) out.add(node.id);
    }
    return out;
  }

  if (lens === "recent") {
    // "Recent" is relative to the LIFE, not the wall clock: the newest tenth
    // of the seq range (floored to a minimum window so young lives don't
    // filter to nothing). Born-recently OR selected-recently both count.
    let maxSeq = 0;
    for (const node of fold.nodes.values()) {
      if (node.first_seq > maxSeq) maxSeq = node.first_seq;
      if ((node.last_selected_seq ?? 0) > maxSeq) maxSeq = node.last_selected_seq ?? 0;
    }
    const cutoff = Math.max(0, maxSeq - Math.max(50, Math.floor(maxSeq / 10)));
    for (const node of fold.nodes.values()) {
      if (node.bookkeeping) continue;
      if (node.first_seq >= cutoff || (node.last_selected_seq ?? -1) >= cutoff) out.add(node.id);
    }
    return out;
  }

  if (lens === "warm") {
    // The two-count model's temporal side: whatever holds decayed activation
    // NOW. Empty when the entity has been quiet — that emptiness is honest.
    for (const [id, activation] of temporal.records) {
      if (activation > 0.05 && fold.nodes.has(id)) out.add(id);
    }
    return out;
  }

  if (lens === "feelings") {
    for (const standing of fold.standings.values()) {
      // Record-targeted feelings sit ON nodes; free-string targets orbit as
      // standing diamonds — emphasize both (the canvas keys standings as
      // "standing:<target>"). Targets can arrive as GRAPH ids (ex:…) while
      // nodes are keyed by row id — resolve through graph_to_row exactly
      // like the canvas does, or the lens dims the very node it claims to
      // show (adversary P1, the two-id-namespace class).
      const resolved = fold.graph_to_row.get(standing.target_id) ?? standing.target_id;
      if (fold.nodes.has(resolved)) out.add(resolved);
      else out.add(`standing:${standing.target_id}`);
    }
    return out;
  }

  if (lens === "diary") {
    for (const node of fold.nodes.values()) {
      if (node.kind === "diary" || node.diary) out.add(node.id);
    }
    return out;
  }

  if (lens === "dreams") {
    for (const node of fold.nodes.values()) {
      if (node.kind === "dream") out.add(node.id);
    }
    return out;
  }

  if (lens === "questions") {
    for (const node of fold.nodes.values()) {
      // "What is it wondering" excludes resolved/retracted records — a
      // closed question under a lens named for open wondering was a lie
      // of scope (adversary P1).
      if ((QUESTION_KINDS.has(node.kind) && !node.closed) || isOpenQuestionDiary(node)) out.add(node.id);
    }
    return out;
  }

  return null;
}
