/**
 * visit_status_poll — the 15s visit-status fold as a pure reducer
 * (fable5 findings 5+6: the inline branch logic defeated its own 2-read
 * debounce under effect re-arms, and the miss counter leaked across run
 * identities).
 *
 * The component owns the interval and the side effects; this reducer owns
 * the LAW: one racy open:false read must never reset a held conversation,
 * a foreign run holding the room is a positive fact (immediate reset), and
 * miss counts belong to ONE run id.
 */

export interface VisitStatusRead {
  open?: boolean;
  run_id?: string | null;
}

export interface VisitPollState {
  /** The run id this drawer holds, or null. */
  runId: string | null;
  /** Consecutive open:false reads — meaningful only for `missesForRun`. */
  misses: number;
  /** The run id the current miss count belongs to (finding 6: a counter
   * carried across run identities let ONE racy read kill a fresh visit). */
  missesForRun: string | null;
}

export type VisitStatusAction =
  | { kind: "keep"; misses: number; missesForRun: string | null }
  /** A DIFFERENT run holds the room — positive fact, reset immediately. */
  | { kind: "foreign_takeover" }
  /** First open:false read against this run — count it, keep the room. */
  | { kind: "count_miss"; misses: number; missesForRun: string }
  /** Second agreeing read — the room is really gone. */
  | { kind: "confirmed_closed" };

export function foldVisitStatus(state: VisitPollState, read: VisitStatusRead): VisitStatusAction {
  const runId = state.runId;
  if (read.open) {
    if (runId && read.run_id && read.run_id !== runId) return { kind: "foreign_takeover" };
    // Open and ours (or no room held): any miss streak dies here.
    return { kind: "keep", misses: 0, missesForRun: null };
  }
  if (!runId) return { kind: "keep", misses: 0, missesForRun: null };
  // A miss only continues a streak for the SAME run id; a new run starts
  // its own count at 1 regardless of what the old one accumulated.
  const misses = state.missesForRun === runId ? state.misses + 1 : 1;
  if (misses >= 2) return { kind: "confirmed_closed" };
  return { kind: "count_miss", misses, missesForRun: runId };
}
