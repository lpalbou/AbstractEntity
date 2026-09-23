/**
 * Pure diary selection for the book reader — extracted so the ordering and
 * redaction-honesty rules are testable without rendering.
 */
import type { FoldState, NodeState } from "./stream_fold";

export interface BookEntry {
  node: NodeState;
  /** ISO birth time (the write moment) or "" when the stream omitted it. */
  bornAt: string;
  /** Words are sealed (redacted, no readable entry door) vs openable. */
  sealed: boolean;
}

/** Every diary node in the fold, oldest → newest (the self-story in the
 * order it was written). A redacted node with no `entry_id` is SEALED —
 * the words never resolve; the reader shows only the act. Ties / missing
 * timestamps fall back to append order (first_seq). */
export function selectDiaryEntries(fold: FoldState): BookEntry[] {
  const out: BookEntry[] = [];
  for (const node of fold.nodes.values()) {
    if (!node.diary) continue;
    out.push({ node, bornAt: node.born_at || "", sealed: node.redacted && !node.entry_id });
  }
  out.sort((a, b) => {
    if (a.bornAt && b.bornAt && a.bornAt !== b.bornAt) return a.bornAt < b.bornAt ? -1 : 1;
    return a.node.first_seq - b.node.first_seq;
  });
  return out;
}
