/**
 * THE TOPIC SPOTLIGHT (operator's second test round 2026-11-10: an
 * activated topic was "barely" visible; Entity backlog 0002). The lit topic
 * — the one focused (its title, its panel row, a card), or the one whose
 * panel row the pointer rests on (a preview) — is drawn as a spotlight:
 *
 * - its circle: a tinted disc, a full-strength ring three px wide and a
 *   soft glow just outside it;
 * - its memories: each one ringed in the topic's colour (the usage scale
 *   paints most memories grey, so "lit" alone did not show them);
 * - everything else: a veil in the canvas background over all of the canvas
 *   but the lit circle, the other circles and their titles dimmed further
 *   (OTHER_TOPIC_DIM), memories outside dimmed by the emphasis rule
 *   (recall_emphasis.DIMMED_NODE).
 *
 * One eased gain per circle (0 at rest, 1 lit), on the canvas's existing
 * dim ramp (0.5 s): a topic lights and lets go as a transition. Pure numbers
 * here; graph_canvas draws.
 */

/** A circle at rest (no topic lit): readable without a hover (0002:
 * "communities are visible"); was fill 0.055, ring 0.3 x 1.1 px. */
export const TOPIC_REST = { fill: 0.065, stroke: 0.42, width: 1.3 } as const;
/** The lit circle (was fill 0.09, ring 0.75 x 2 px for a focused one). */
export const TOPIC_LIT = { fill: 0.16, stroke: 1, width: 3 } as const;
/** The glow just outside the lit ring: its alpha, width and gap (px). */
export const TOPIC_GLOW = { alpha: 0.3, width: 10, gap: 5 } as const;
/** Another circle (and its title) while a topic is lit (was 0.25). */
export const OTHER_TOPIC_DIM = 0.12;
/** A circle none of whose memories the emphasis holds (a lens, a search),
 * no topic lit: as before. */
export const MISSED_TOPIC_DIM = 0.25;
/** The veil over everything but the lit circle, at full gain. */
export const SPOTLIGHT_VEIL = 0.42;
/** The lit topic's memory ring: alpha, width and gap outside the memory. */
export const MEMBER_RING = { alpha: 0.95, width: 1.6, gap: 2 } as const;

/** The topic the canvas lights: the one the pointer rests on in the panel
 * (a preview) before the focused one; null when none. */
export function litTopicKey(hovered: string | null, picked: string | null): string | null {
  return hovered ?? picked;
}

/** The dim target of one circle this frame. */
export function topicDimTarget(args: { lit: boolean; anyLit: boolean; emphasis: boolean; emphasisHits: boolean }): number {
  if (args.lit) return 1;
  if (args.anyLit) return OTHER_TOPIC_DIM;
  if (args.emphasis && !args.emphasisHits) return MISSED_TOPIC_DIM;
  return 1;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A circle's paint at `gain` (0 = rest, 1 = lit; clamped). */
export function topicCircleStyle(gain: number): { fill: number; stroke: number; width: number; glow: number } {
  const g = Math.max(0, Math.min(1, gain));
  return {
    fill: lerp(TOPIC_REST.fill, TOPIC_LIT.fill, g),
    stroke: lerp(TOPIC_REST.stroke, TOPIC_LIT.stroke, g),
    width: lerp(TOPIC_REST.width, TOPIC_LIT.width, g),
    glow: TOPIC_GLOW.alpha * g,
  };
}

/** The veil's alpha: the strongest gain on the canvas (one veil, with a
 * hole for every circle still lit — two circles never overlap). */
export function veilAlpha(gains: Iterable<number>): number {
  let g = 0;
  for (const v of gains) g = Math.max(g, v);
  return SPOTLIGHT_VEIL * Math.max(0, Math.min(1, g));
}

/** The lit topic's memories as a set, rebuilt only when the lit topic or
 * the seating changes (never per frame): `rowsOf` is the seated fold's. */
export function litRowsCache(): (key: string | null, rowsOf: ReadonlyMap<string, string[]> | null, gen: number) => ReadonlySet<string> | null {
  let last: { key: string | null; gen: number; rows: ReadonlySet<string> | null } = { key: null, gen: -1, rows: null };
  return (key, rowsOf, gen) => {
    if (last.key === key && last.gen === gen) return last.rows;
    const rows = key && rowsOf ? new Set(rowsOf.get(key) ?? []) : null;
    last = { key, gen, rows };
    return rows;
  };
}

/** Whether a circle (screen px) meets the canvas: a hovered topic lights only
 * then (review 2026-11-10 blocker: once a topic is framed, the others are
 * off-screen, and resting on one veiled the whole graph with nothing lit). */
export function circleMeetsCanvas(c: { x: number; y: number }, r: number, w: number, h: number): boolean {
  return c.x + r >= 0 && c.x - r <= w && c.y + r >= 0 && c.y - r <= h;
}

/** Where the lit topic's title goes when no place around its circle is free
 * (framed, its circle fills the canvas): just inside the circle's top edge,
 * held inside the canvas and below the lens row (`top`). */
export function litPlateFallback(halo: { cx: number; cy: number; r: number }, w: number, h: number, bounds: { w: number; h: number }, top: number): { x: number; y: number; w: number; h: number } {
  const x = Math.min(Math.max(8, halo.cx - w / 2), Math.max(8, bounds.w - w - 8));
  const y = Math.min(Math.max(top, halo.cy - halo.r + 8), Math.max(top, bounds.h - h - 8));
  return { x, y, w, h };
}

/** Whether a title plate's centre lies inside a disc (another topic's title
 * is not drawn inside the lit circle). */
export function plateInDisc(rc: { x: number; y: number; w: number; h: number }, disc: { cx: number; cy: number; r: number }): boolean {
  return Math.hypot(rc.x + rc.w / 2 - disc.cx, rc.y + rc.h / 2 - disc.cy) < disc.r;
}
