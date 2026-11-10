/**
 * Where a topic's TITLE goes on the canvas (screen px): wrapped onto two
 * lines at most, placed just outside its circle where it covers no memory,
 * no other title and no overlay. Pure functions; graph_canvas draws.
 */

/** Wrap a label onto at most two lines of `maxW` (measured), breaking
 * after ", " first, then at spaces. `complete` = nothing was left out (the
 * canvas then needs no "…"; the hover card always shows everything). */
export function wrapTopicLabel(text: string, maxW: number, measure: (s: string) => number): { lines: string[]; complete: boolean } {
  if (measure(text) <= maxW) return { lines: [text], complete: true };
  const tokens = text.split(/(?<=, )|(?<= )/);
  let first = "";
  let i = 0;
  while (i < tokens.length && measure(first + tokens[i]) <= maxW) {
    first += tokens[i];
    i += 1;
  }
  if (!first) {
    // One word wider than a line: it is the first line as is.
    first = tokens[0];
    i = 1;
  }
  const rest = tokens.slice(i).join("").trim();
  if (!rest) return { lines: [first.trim()], complete: true };
  if (measure(rest) <= maxW) return { lines: [first.trim(), rest], complete: true };
  let second = "";
  for (const ch of rest) {
    if (measure(second + ch + "…") > maxW) break;
    second += ch;
  }
  return { lines: [first.trim(), `${second.trimEnd()}…`], complete: false };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectHitsCircle(rc: Rect, c: { x: number; y: number; r: number }): boolean {
  const nx = Math.max(rc.x, Math.min(c.x, rc.x + rc.w));
  const ny = Math.max(rc.y, Math.min(c.y, rc.y + rc.h));
  return (nx - c.x) ** 2 + (ny - c.y) ** 2 < c.r * c.r;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Where a topic label may go (screen px): just above the halo, else
 * below, right, left — never over a node, another label, a blocked band,
 * or off the canvas. null = no free spot this frame (the label waits). */
export function placeTopicLabel(args: {
  halo: { cx: number; cy: number; r: number };
  w: number;
  h: number;
  nodes: Array<{ x: number; y: number; r: number }>;
  placed: Rect[];
  bounds: { w: number; h: number };
  blocked?: (rc: Rect) => boolean;
}): Rect | null {
  const { halo, w, h, nodes, placed, bounds, blocked } = args;
  const candidates: Rect[] = [
    { x: halo.cx - w / 2, y: halo.cy - halo.r - 4 - h, w, h },
    { x: halo.cx - w / 2, y: halo.cy + halo.r + 4, w, h },
    { x: halo.cx + halo.r + 6, y: halo.cy - h / 2, w, h },
    { x: halo.cx - halo.r - 6 - w, y: halo.cy - h / 2, w, h },
  ];
  for (const rc of candidates) {
    if (rc.x < 2 || rc.y < 2 || rc.x + rc.w > bounds.w - 2 || rc.y + rc.h > bounds.h - 2) continue;
    if (blocked?.(rc)) continue;
    if (placed.some((p) => rectsOverlap(p, rc))) continue;
    if (nodes.some((n) => rectHitsCircle(rc, n))) continue;
    return rc;
  }
  return null;
}
