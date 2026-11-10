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
  /** Where the trails turn green and bright for this many trails (edgeTiers). */
  edgeTiers: EdgeTiers;
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
  return { nodes, edges: quantileRanks(edgeItems), edgeTiers: edgeTiers(edgeItems.length) };
}

/** The top decile: above this place the scale turns bright green. */
export const TOP_DECILE = 0.9;

/** Place on the scale -> position on the grey->green ramp (0 grey, 1
 * green). Below the top decile the ramp climbs gently, staying grey (at
 * most 0.3 of the way to green); the top decile STEPS to 0.85 (0.75 until the operator's 2026-11-10 test:
 * "a bit more contrast, not too much") and climbs
 * to full green, so his most used tenth pops instead of sharing one
 * gradual wash. */
export function usageMix(t: number): number {
  if (!(t > 0)) return 0;
  if (t > TOP_DECILE) return 0.85 + 0.15 * Math.min(1, (t - TOP_DECILE) / (1 - TOP_DECILE));
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

/**
 * THE LINES (operator 2026-11-10 20:13, backlog 0025: "edges were supposed
 * to be dark grey if not visited? here nothing really pops up"). Castor's
 * life draws 3 999 born-linked lines and 2 368 co-use trails; at 0.16 and up
 * to 0.11 they summed to a pale grey-green haze. Now:
 * - every line he has not walked much is ONE dark grey near the background
 *   (EDGE_QUIET_ALPHA of the scale's dark end, coldOf: a dark colour stays
 *   dark however many lines cross, where the light topology grey at a low
 *   alpha summed to a haze in his topics' packed circles): the born-linked
 *   lines and the trails up to the upper third of the ranks;
 * - the upper third turns green on a steep curve (the square of the way
 *   through it), still faint;
 * - the top tenth is bright and wider, its very top the strongest, never
 *   above EDGE_ALPHA_CEILING.
 * Both tiers are also capped in COUNT (EDGE_GREEN_MAX, EDGE_BRIGHT_MAX): the
 * ranks are relative, so a life of 25 000 trails would otherwise light 2 500
 * of them bright and turn into a green blob; past those counts the tiers
 * narrow to the most used trails.
 */
export const EDGE_QUIET_ALPHA = 0.07;
export const EDGE_ALPHA_CEILING = 0.75;
export const EDGE_GREEN_FROM = 2 / 3;
export const EDGE_GREEN_MAX = 1000;
export const EDGE_BRIGHT_MAX = 300;

/** The ranks above which the trails turn green (`green`) and bright
 * (`bright`) for a life of `n` trails. */
export interface EdgeTiers {
  green: number;
  bright: number;
}

export function edgeTiers(n: number): EdgeTiers {
  if (n <= 0) return { green: EDGE_GREEN_FROM, bright: TOP_DECILE };
  return { green: Math.max(EDGE_GREEN_FROM, 1 - EDGE_GREEN_MAX / n), bright: Math.max(TOP_DECILE, 1 - EDGE_BRIGHT_MAX / n) };
}

/** A co-use trail's look at its place on the scale: its position on the
 * grey->green ramp, its opacity and its width (px). */
export function usageEdgeStyle(t: number, tiers: EdgeTiers): { mix: number; alpha: number; width: number } {
  if (!(t > tiers.green)) return { mix: 0, alpha: EDGE_QUIET_ALPHA, width: 0.8 };
  if (t <= tiers.bright) {
    const u = (t - tiers.green) / (tiers.bright - tiers.green);
    return { mix: 0.55 * u * u, alpha: EDGE_QUIET_ALPHA + 0.13 * u * u, width: 0.8 + 0.5 * u };
  }
  const v = Math.min(1, (t - tiers.bright) / (1 - tiers.bright));
  return { mix: 0.85 + 0.15 * v, alpha: Math.min(EDGE_ALPHA_CEILING, 0.45 + 0.3 * Math.pow(v, 1.5)), width: 1.4 + 1.2 * v };
}

/** A lit line under a hover or a selection (the focus driver): at least this
 * opacity, so the hovered memory's lines show against the dark rest. */
export const FOCUS_EDGE_FLOOR = 0.4;

/** The dark end: a grey a little lifted from the background toward the
 * text colour (dark grey on the dark themes, a quiet grey on light ones). */
export function coldOf(bg: Rgb, text: Rgb): Rgb {
  return usageRgb(0.28, bg, text);
}

/** The legend's words for the scale (canvas legend + the graph's key). */
export const USAGE_LOW = "rarely used";
export const USAGE_HIGH = "most used";
/** The scale's one-line reading under the Context legend's fill row (review
 * N4: never in a tooltip only). */
export const USAGE_RANK = "how much he has used it, ranked within his own life";
export const USAGE_TITLE =
  "Colour of a memory and of a line between two memories: how much he has used it, ranked within his own life (the history loaded here). Dark grey: rarely used; green: his most used; his most used tenth is bright green. Ties are ordered by how recently he used them. Memories he keeps in mind by right are always there and are never counted as a use.";
