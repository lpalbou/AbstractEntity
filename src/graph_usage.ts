/**
 * THE USAGE SCALE (operator live test 2026-11-09: "the gradient should be
 * from dark grey (rarely visited node) to green (highly visited node) … when
 * i look at that, for me, all the graph is visited, so nothing pops up").
 *
 * One scale for memories AND for the trails between them: dark grey = rarely
 * used, green = most used. Pure reading of the fold the app already has (the
 * loaded history up to the scrub position); the gateway serves no count.
 *
 * NORMALIZATION: QUANTILE (the empirical percentile, ties sharing their
 * average rank), per home, over the loaded window — never raw counts, never
 * a min-max. Why: the colour used to be the
 * raw temporal activation on a fixed ceiling; on a live life (Castor,
 * 2026-11-09: 1 612 of 2 305 trails warm, 45 memories at the top) every
 * recent trail sat near that ceiling and the whole graph painted one light
 * green. A min-max over raw counts fails the other way: one memory used 300
 * times flattens every other to grey. A rank spreads ANY population evenly
 * over the scale, so the top tenth always sits at the green end and a
 * dominant memory never compresses the rest.
 *
 * Order (the key a rank sorts on): the lifetime use count (selected_count,
 * the trail's co-use count), ties broken by WARMTH — the engine-parity
 * temporal activation, i.e. how many turns ago it was used. So a home where
 * everything was used exactly once still spreads, by recency; elements tied
 * on BOTH keys (used in the same turns) share one place on the scale.
 *
 * Populations: memories are ranked among the memories he has used at least
 * once (never used = 0, the darkest grey: ranking the never-used too would
 * push every used memory into the top decile — the wash again); trails among
 * the co-use trails (each was used at least once). Engine bookkeeping is no
 * memory and stays at 0. Present-by-right memories are in every prompt but
 * are never selected, so the engine counts no use for them: they read grey.
 */
import type { FoldState } from "./stream_fold";
import type { TemporalActivation } from "./temporal_activation";

export interface UsageScale {
  /** node id -> place on the scale, 0 (never used) .. 1 (most used). */
  nodes: Map<string, number>;
  /** co-use edge key ("a|b") -> place on the scale, 0 .. 1. */
  edges: Map<string, number>;
}

export interface UsageItem<K> {
  id: K;
  /** Lifetime use over the loaded window (the primary key). */
  count: number;
  /** Temporal activation (the tie-break: recency by turns). */
  warmth: number;
}

/** Warmth equal to this precision is one tie (same turns, same weights). */
const WARMTH_TIE = 1e-6;

function sameKey(a: UsageItem<unknown>, b: UsageItem<unknown>): boolean {
  return a.count === b.count && Math.abs(a.warmth - b.warmth) <= WARMTH_TIE;
}

/** Percentile of each item, (0, 1]: the items sorted by (count, warmth),
 * item i of n (from 0) at (i + 1) / n — the most used is 1, the least used
 * 1/n, never 0 (0 is kept for "never used"); a run of ties shares its
 * average rank. "The top decile" is then every item above 0.9: the most
 * used tenth. */
export function quantileRanks<K>(items: ReadonlyArray<UsageItem<K>>): Map<K, number> {
  const out = new Map<K, number>();
  const n = items.length;
  if (n === 0) return out;
  const sorted = [...items].sort((x, y) => x.count - y.count || x.warmth - y.warmth);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sameKey(sorted[j + 1], sorted[i])) j += 1;
    const t = ((i + j) / 2 + 1) / n;
    for (let k = i; k <= j; k++) out.set(sorted[k].id, t);
    i = j + 1;
  }
  return out;
}

/** The scale for one home at the scrub position. */
export function usageScale(fold: FoldState, temporal: Pick<TemporalActivation, "records" | "pairs">): UsageScale {
  const nodeItems: Array<UsageItem<string>> = [];
  const nodes = new Map<string, number>();
  for (const node of fold.nodes.values()) {
    const warmth = temporal.records.get(node.id) ?? 0;
    if (node.bookkeeping || (node.selected_count <= 0 && warmth <= 0)) {
      nodes.set(node.id, 0);
      continue;
    }
    nodeItems.push({ id: node.id, count: node.selected_count, warmth });
  }
  for (const [id, t] of quantileRanks(nodeItems)) nodes.set(id, t);
  const edgeItems: Array<UsageItem<string>> = [];
  for (const e of fold.edges.values()) edgeItems.push({ id: e.key, count: e.count, warmth: temporal.pairs.get(e.key) ?? 0 });
  return { nodes, edges: quantileRanks(edgeItems) };
}

/** The top decile: above this place the scale turns bright green. */
export const TOP_DECILE = 0.9;

/** Place on the scale -> position on the grey->green ramp (0 grey, 1
 * green). Below the top decile the ramp climbs gently, staying grey (at
 * most 0.3 of the way to green); the top decile STEPS to 0.75 and climbs
 * to full green, so his most used tenth pops instead of sharing one
 * gradual wash. */
export function usageMix(t: number): number {
  if (!(t > 0)) return 0;
  if (t > TOP_DECILE) return 0.75 + 0.25 * Math.min(1, (t - TOP_DECILE) / (1 - TOP_DECILE));
  return 0.3 * Math.pow(t / TOP_DECILE, 2);
}

export type Rgb = readonly [number, number, number];

/** The ramp colour between the two ends (theme-resolved by the canvas). */
export function usageRgb(mix: number, cold: Rgb, warm: Rgb): Rgb {
  const m = Math.max(0, Math.min(1, mix));
  return [
    Math.round(cold[0] + (warm[0] - cold[0]) * m),
    Math.round(cold[1] + (warm[1] - cold[1]) * m),
    Math.round(cold[2] + (warm[2] - cold[2]) * m),
  ];
}

/** A line's opacity at its place on the scale: below the top decile a
 * whisper (a dense life draws thousands of lines: 2 305 on Castor), the top
 * decile clearly drawn, its very top the strongest. */
export function usageEdgeAlpha(t: number): number {
  if (!(t > 0)) return 0.03;
  if (t > TOP_DECILE) return 0.2 + 0.42 * Math.pow(Math.min(1, (t - TOP_DECILE) / (1 - TOP_DECILE)), 1.5);
  return 0.03 + 0.08 * Math.pow(t / TOP_DECILE, 2);
}

/** The dark end: a grey a little lifted from the background toward the
 * text colour (dark grey on the dark themes, a quiet grey on light ones). */
export function coldOf(bg: Rgb, text: Rgb): Rgb {
  return usageRgb(0.28, bg, text);
}

/** The legend's words for the scale (canvas legend + the graph's key). */
export const USAGE_LOW = "rarely used";
export const USAGE_HIGH = "most used";
export const USAGE_TITLE =
  "Colour of a memory and of a line between two memories: how much he has used it, ranked within his own life (the history loaded here). Dark grey: rarely used; green: his most used; his most used tenth is bright green. Ties are ordered by how recently he used them. Memories he keeps in mind by right are always there and are never counted as a use.";
