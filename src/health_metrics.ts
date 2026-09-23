/**
 * Fold-derived memory-health metrics — the shape of a life's memory, read
 * from the replay fold with zero server work.
 *
 * Motivation (mission adversary + Castor's doctoring, 2026-07-13): the
 * operator authorized a maintenance pass that cut Castor's journal from
 * 86,652 → 7,355 events (~99% duplicate mass) and memory.sqlite3 from
 * 92.5 → 26.7 MB. The app rendered the reembed/maintenance MARKERS but not
 * the health those numbers describe. The byte footprint (before/after)
 * genuinely needs a gateway endpoint and is stated as a gap; everything
 * here is honestly derivable from what the fold already holds:
 *
 * - re-use ratio: envelopes folded vs DISTINCT records (how much of the
 *   stream is recall/bookkeeping vs formation — the mass a doctoring pass
 *   targets);
 * - retrieval concentration: the top records' share of all selected-use —
 *   the "bridge attractor" (rich-get-richer) the AGENTS notes name;
 * - forgetting footprint: closed (superseded/retracted) + silenced;
 * - structure: isolated records (no associations) vs connected;
 * - kind distribution: episodes / summaries / diary / interest / dream / …
 *
 * These are GENERAL stream properties, never demo-specific.
 */

import type { FoldState, NodeState } from "./stream_fold";

export interface HealthMetrics {
  /** Envelopes folded (the whole stream to the scrub point). */
  envelopes: number;
  /** Distinct memory records (nodes), excluding pure relation connectors. */
  records: number;
  /** Bookkeeping/engine-act markers (engram, reembed) — not memories. */
  bookkeeping: number;
  /** Diary (elected) records. */
  diary: number;
  /** Records the entity has actually re-used at least once (selected_count>0). */
  everSelected: number;
  /** Total selected-use across all records (the global, never-decaying count). */
  totalSelectedUse: number;
  /** Share of total selected-use held by the top-N records [0..1] — the
   * attractor meter (1 = one record hoards all recall; low = even spread). */
  top5Share: number;
  top5: Array<{ id: string; title: string; kind: string; count: number }>;
  /** Belief lifecycle: superseded + retracted (closed) and silenced. */
  superseded: number;
  retracted: number;
  silenced: number;
  /** Associations (co-use trails + formation edges, de-duplicated by pair). */
  associations: number;
  /** Records with no association at all (islands) — the sleep pass's input. */
  isolated: number;
  /** kind -> count (memory kinds only; relation connectors excluded). */
  byKind: Array<{ kind: string; count: number }>;
  /** Maintenance acts observed in the stream (e.g. "reembed"). */
  maintenanceActs: Array<{ act: string; count: number }>;
}

/** A node participates in the memory graph as a real record (not a pure
 * relation connector). Relation rows render as tiny predicate connectors
 * and must not inflate the record count. */
function isRecord(n: NodeState): boolean {
  return n.kind !== "relation";
}

export function computeHealthMetrics(fold: FoldState): HealthMetrics {
  const records: NodeState[] = [];
  let bookkeeping = 0;
  let diary = 0;
  let everSelected = 0;
  let totalSelectedUse = 0;
  let superseded = 0;
  let retracted = 0;
  let silenced = 0;
  const kindCounts = new Map<string, number>();
  const maint = new Map<string, number>();

  for (const n of fold.nodes.values()) {
    if (n.bookkeeping) {
      bookkeeping += 1;
      if (n.maintenance) maint.set(n.maintenance, (maint.get(n.maintenance) ?? 0) + 1);
      continue; // engine acts are not memories
    }
    if (!isRecord(n)) continue;
    records.push(n);
    if (n.diary) diary += 1;
    if (n.selected_count > 0) everSelected += 1;
    totalSelectedUse += Math.max(0, n.selected_count);
    if (n.closed) {
      if (n.closed.kind === "supersede") superseded += 1;
      else retracted += 1;
    }
    if (n.silenced) silenced += 1;
    const kind = n.diary ? "diary" : n.kind || "memory";
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  // Retrieval concentration: the top-5 records' share of all selected-use.
  const byUse = [...records].sort((a, b) => b.selected_count - a.selected_count);
  const top5nodes = byUse.slice(0, 5).filter((n) => n.selected_count > 0);
  const top5Sum = top5nodes.reduce((s, n) => s + n.selected_count, 0);
  const top5Share = totalSelectedUse > 0 ? top5Sum / totalSelectedUse : 0;
  const top5 = top5nodes.map((n) => ({
    id: n.id,
    title: n.title || n.id.slice(0, 24),
    kind: n.diary ? "diary" : n.kind,
    count: n.selected_count,
  }));

  // Associations: co-use trails + formation edges, de-duplicated by unordered
  // pair (an association counted twice would overstate connectedness).
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const connected = new Set<string>();
  const pairs = new Set<string>();
  for (const e of fold.edges.values()) {
    if (!e.a || !e.b || e.a === e.b) continue;
    pairs.add(pairKey(e.a, e.b));
    connected.add(e.a);
    connected.add(e.b);
  }
  for (const se of fold.structural_edges.values()) {
    const a = se.source_graph_id;
    const b = se.target_graph_id;
    if (!a || !b || a === b) continue;
    // Map graph ids to row ids where possible so a structural edge and a
    // co-use trail over the same pair are not double-counted.
    const ar = fold.graph_to_row.get(a) ?? a;
    const br = fold.graph_to_row.get(b) ?? b;
    pairs.add(pairKey(ar, br));
    connected.add(ar);
    connected.add(br);
  }
  let isolated = 0;
  for (const n of records) {
    if (!connected.has(n.id) && !(n.graph_id && connected.has(n.graph_id))) isolated += 1;
  }

  const byKind = [...kindCounts.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
  const maintenanceActs = [...maint.entries()].map(([act, count]) => ({ act, count })).sort((a, b) => b.count - a.count);

  return {
    envelopes: fold.applied_count,
    records: records.length,
    bookkeeping,
    diary,
    everSelected,
    totalSelectedUse,
    top5Share,
    top5,
    superseded,
    retracted,
    silenced,
    associations: pairs.size,
    isolated,
    byKind,
    maintenanceActs,
  };
}
