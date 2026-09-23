/**
 * Turn pulse — the live meaning behind the thinking bars (operator
 * 2026-08-01: "the 3 animated bars … is it possible to make them represent
 * something more meaningful? like the growing number of turns, tool calls
 * and tokens used maybe? each bar with a different color?").
 *
 * What the live stream HONESTLY carries while a visit turn runs (envelopes
 * past the turn-start seq):
 *   - trace  ("Recall")            → memories put on the shelf, of how many
 *                                    considered — the ATT-class signal.
 *   - snapshot ("holds in mind")   → memories in context + ~prompt-token
 *                                    estimate — the tokens signal, labeled
 *                                    as the estimate it is.
 *   - binding                      → records formed mid-turn (+N on recall).
 * Tool calls deliberately do NOT appear here: the replay stream carries no
 * per-call tool events during a visit turn (they arrive with the reply's
 * probe payload) — a tool bar would be a zero-fake until the turn ended,
 * exactly the absent-not-zero violation the house forbids. Turn count rides
 * from the thread itself (the third ask), not from envelopes.
 *
 * Pure + tested; the component owns pixels only.
 */

export interface TurnPulse {
  /** Recall result: memories on the shelf, of how many considered. null
   * until the trace envelope lands (absent, never zero); `considered`
   * prefers the engine's own count (budget_spent.candidates_considered —
   * the trace's candidates LIST is display-bounded, so its length
   * under-read wide pools until the operator's 2026-08-01 "at most a 100"
   * ruling aligned the bounds) and falls back to the list length; null
   * when the trace shipped neither — the bar then shows the number
   * without a fill (a fabricated denominator was adversary N2). */
  shelf: { selected: number; considered: number | null } | null;
  /** ~tokens of the RECALLED MEMORIES serialized into his context (the
   * snapshot's own estimate — it measures the recall payload, NOT the full
   * prompt; adversary F1). null until the commit snapshot lands or when it
   * ships no estimate. */
  recallTokens: number | null;
  /** Records he FORMED this turn — remember-sourced bindings only
   * (adversary F4: pin/silence visibility bindings and engine bookkeeping
   * are acts, not memories he formed). */
  formed: number;
}

import { classifyBookkeeping, cleanTitle, consideredCount } from "./stream_fold";
import type { DisplayBlock } from "./stream_types";

interface EnvelopeLike {
  seq: number;
  family?: string;
  payload?: unknown;
  display?: DisplayBlock | null;
}

/** The recall token budget the estimate is honestly drawn against: the
 * attention slice (12%) of the 50k recommended working size — the same
 * arithmetic abstractmemory's entity_recall_budget applies (seam.py; the
 * 50k is the operator's 2026-08-01 re-ruling, "a (soft) recommended
 * target of 50k tokens", and the gateway's summon_budget_profile now
 * sizes attention from min(window, recommendation), so 12% × 50k = 6000
 * IS the door's budget for every at/above-recommendation window). The
 * snapshot estimate measures the recalled-memories block, so THIS is its
 * denominator — the full window would under-read forever (adversary F1). */
export const RECALL_TOKENS_SCALE = Math.round(0.12 * 50_000);

/** Fold the live envelopes past `sinceSeq` into the pulse. Walks BACKWARD
 * and stops at the boundary (the tail is ~90k envelopes at operator scale —
 * adversary N3): the first trace/snapshot met from the end IS the newest,
 * which is the read the bars want. Malformed payloads are skipped, never
 * guessed at. */
export function turnPulse(envelopes: readonly EnvelopeLike[], sinceSeq: number): TurnPulse {
  const pulse: TurnPulse = { shelf: null, recallTokens: null, formed: 0 };
  for (let i = envelopes.length - 1; i >= 0; i--) {
    const env = envelopes[i];
    if (!env || typeof env.seq !== "number") continue;
    if (env.seq <= sinceSeq) break;
    const p = (env.payload ?? {}) as Record<string, unknown>;
    if (env.family === "trace" && pulse.shelf === null) {
      const selected = Array.isArray(p["selected"]) ? p["selected"].length : null;
      // The TRUE pool first (budget_spent.candidates_considered — engine
      // accounting), the display-bounded candidates list as fallback: the
      // operator's 2026-08-01 audit caught the bars reading the trace's
      // capped list (64) while the real pools ran 321-463. One reading
      // rule for every surface (stream_fold.consideredCount); still never
      // fabricated: absent both, considered stays null (N2).
      const considered = consideredCount(p);
      if (selected !== null) pulse.shelf = { selected, considered };
      continue;
    }
    if (env.family === "snapshot" && pulse.recallTokens === null) {
      const est = p["prompt_token_estimate"];
      if (typeof est === "number" && Number.isFinite(est) && est > 0) pulse.recallTokens = est;
      continue;
    }
    if (env.family === "binding" && p["source"] === "remember") {
      // Same classification the ledger renders (one truth): engram/reembed
      // bookkeeping under the remember source is an engine ACT, not a
      // memory he formed. Absent source counts as nothing (default-closed:
      // an undercounted "+N formed" beats a fabricated one).
      const kind = String(env.display?.kind ?? "memory");
      const title = cleanTitle(String(env.display?.title ?? ""));
      if (!classifyBookkeeping(kind, title, env.display ?? {}).bookkeeping) pulse.formed += 1;
    }
  }
  return pulse;
}

/** Compact token count for the bar label ("9.9k", "412"). */
export function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(Math.round(n));
}
