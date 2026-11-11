/**
 * THE PHONE OVERLAY STACK (castor's second topics night, 2026-11-10: at
 * 400 px the open Topics panel showed about one topic at a time and sat
 * over the see-through Context legend, whose words showed through it).
 *
 * On a phone-width canvas (graph_canvas.css: the entity-canvas container
 * below 860 px) the Context legend and the Topics panel are ONE column under
 * the lens row — the legend on top, the panel's line below it — so they
 * never overlap, whatever either holds. OPEN, the panel takes the legend's
 * slot: it becomes a sheet over the canvas below the lens row (over the lens
 * row too where the canvas is too short for its head and two topic rows)
 * and the legend steps aside until the panel folds again (its own fold
 * state kept). A wide canvas keeps both in their own places (the stack
 * draws no box there): this mapping only says what a phone shows.
 */

/** The Topics panel: absent (topics off), one line (folded, or its one
 * sentence while his topics are not served), or open on its list. */
export type StackTopics = "none" | "line" | "open";
/** The Context legend: absent (Context off, a search or a selection
 * showing), folded to its summary, or open on its key. */
export type StackLegend = "none" | "folded" | "open";

export type OverlayStack = {
  /** "aside": present but not drawn while the panel is a sheet. */
  legend: "none" | "shown" | "aside";
  /** "sheet": the open panel in the legend's slot, down to the canvas edge. */
  topics: "none" | "line" | "sheet";
};

/** What a phone-width canvas shows of the two (the data attributes the
 * stylesheet reads: data-legend, data-topics). */
export function overlayStack(topics: StackTopics, legend: StackLegend): OverlayStack {
  const sheet = topics === "open";
  return {
    legend: legend === "none" ? "none" : sheet ? "aside" : "shown",
    topics: sheet ? "sheet" : topics,
  };
}

/**
 * THE FLOATING TOPICS PANEL (operator 2026-11-10, Entity backlog 0017 "the
 * Topics panel floatable and resizable", folding 0001 "it should start from
 * the top right, not bottom right"; round 4, backlog 0027: "it should be
 * able to move anywhere on the page … drag & drop from the menu bar … the
 * resize… on the opposite side of the window, not intuitive at all"). On a
 * wide canvas the panel floats over the PAGE: it starts DOCKED at the
 * canvas's top right, under the motion buttons, and grows downward; its head
 * bar (and its grip) moves it anywhere in the window, its bottom-right
 * corner grows it toward the bottom right (its top-left stays put), "put
 * back" docks it again. Where it is and its size are presentation,
 * remembered in one versioned key. A phone keeps the stack.
 * Pure: the canvas measures, these numbers clamp. In viewport px.
 */
export type PanelFloat = {
  /** Where its top-left corner is in the window; null: docked. */
  at: { x: number; y: number } | null;
  /** Its width (null: the docked default) and its height while open on its
   * list (null: as tall as its list, up to its cap). */
  w: number | null;
  h: number | null;
};

export const PANEL_DOCKED: PanelFloat = { at: null, w: null, h: null };
/** The width a resize keeps (px). */
export const PANEL_W = { min: 240, max: 560 } as const;
/** The shortest a resize makes it (its head and a few rows). */
export const PANEL_MIN_H = 120;
/** Its head stays inside the window (its bar with it). */
export const PANEL_HEAD_H = 40;
/** The gap it keeps from the window's edges and under the motion buttons. */
export const PANEL_GAP = 8;
/** v2 (round 4): positions are the window's, not the canvas's; a v1 value
 * (canvas px, from before the page float) is never read. */
export const PANEL_STORAGE_KEY = "abstractentity_topics_panel_v2";
/** A press on the head moves the panel once the pointer travels this far
 * (px); short of it, the press is the head's click (it folds the panel). */
export const PANEL_DRAG_SLOP = 4;

type Box = { x: number; y: number; w: number; h: number };

/** Where a move by (dx, dy) from `start` puts it: anywhere in the window,
 * its head kept inside it. */
export function movePanel(start: Box, dx: number, dy: number, view: { w: number; h: number }): { x: number; y: number } {
  const x = Math.max(0, Math.min(start.x + dx, view.w - start.w));
  const y = Math.max(0, Math.min(start.y + dy, view.h - PANEL_HEAD_H));
  return { x: Math.round(x), y: Math.round(y) };
}

/** THE CORNER'S RULE (round-4 review F1, F2): the edge under the pointer is
 * the edge that moves, and no other edge moves. The grip is the bottom-right
 * corner, so it moves the bottom edge and the right edge; the top and the
 * left edges never move.
 * - Moved (anywhere in the window): the right edge follows the pointer and
 *   stops at the window's edge (the width is clamped to the room on the
 *   right, PANEL_W wide at most and at least); the bottom follows, as far
 *   as the window's foot.
 * - Docked: its right edge IS the dock (10 px inside the canvas's), so it
 *   cannot move; the corner moves the bottom edge only, the panel stays
 *   docked (only a drag of its head or grip undocks it), as far as the
 *   canvas's foot. */
export function resizePanel(start: Box, dx: number, dy: number, view: { w: number; h: number }, docked: boolean, dockBottom: number): { w: number; h: number } {
  // The room on the right; a panel already past it (moved flush to the
  // window's edge) keeps its width: a pull never makes its right edge retreat.
  const room = Math.max(view.w - PANEL_GAP - start.x, Math.min(start.w, PANEL_W.max));
  const w = docked ? start.w : Math.max(Math.min(PANEL_W.min, start.w), Math.min(start.w + dx, PANEL_W.max, room));
  const foot = (docked ? dockBottom : view.h) - PANEL_GAP;
  const h = Math.max(PANEL_MIN_H, Math.min(start.h + dy, foot - start.y));
  return { w: Math.round(w), h: Math.round(h) };
}

/** The float after a corner pull from `start` (the panel's box at the
 * press): docked, it stays docked with its new height; moved, its place
 * kept and its new size. */
export function resizeFloat(from: PanelFloat, start: Box, dx: number, dy: number, view: { w: number; h: number }, dockBottom: number): PanelFloat {
  const docked = from.at === null;
  const r = resizePanel(start, dx, dy, view, docked, dockBottom);
  return docked ? { at: null, w: from.w, h: r.h } : { at: from.at, w: r.w, h: r.h };
}

/** The float after a move from `start` (round-4 review F3: a move never
 * changes the height). Open on its list, a panel with no height of its own
 * keeps the height it had at the press (docked, its cap was 58 % of the
 * canvas; moved, the window's would let it grow on release); folded (its
 * head) it keeps none. */
export function moveFloat(from: PanelFloat, start: Box, dx: number, dy: number, view: { w: number; h: number }, openList: boolean): PanelFloat {
  return { at: movePanel(start, dx, dy, view), w: from.w, h: from.h ?? (openList ? Math.round(start.h) : null) };
}

/** Where the docked panel goes (window px, measured by the canvas): its top
 * (under the motion buttons), its right edge (10 px inside the canvas's),
 * and the canvas's width and bottom (its default width and height cap). */
export type PanelDock = { top: number; right: number; canvasW: number; canvasBottom: number; canvasH: number; viewW: number };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The remembered float (PANEL_STORAGE_KEY), or null when none is stored or
 * it is not this version's shape. */
export function parsePanelFloat(raw: string | null): PanelFloat | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const at = o.at === null ? null : o.at && typeof o.at === "object" && finite((o.at as Record<string, unknown>).x) && finite((o.at as Record<string, unknown>).y) ? { x: (o.at as { x: number }).x, y: (o.at as { y: number }).y } : undefined;
  const w = o.w === null ? null : finite(o.w) ? Math.max(PANEL_W.min, Math.min(PANEL_W.max, o.w)) : undefined;
  const h = o.h === null ? null : finite(o.h) ? Math.max(PANEL_MIN_H, o.h) : undefined;
  if (at === undefined || w === undefined || h === undefined) return null;
  return { at, w, h };
}

export function serializePanelFloat(f: PanelFloat): string {
  return JSON.stringify({ at: f.at, w: f.w, h: f.h });
}

/** The panel's width: as resized, else the docked default. */
function panelWidth(f: PanelFloat, dock: PanelDock): string {
  return f.w !== null ? `${f.w}px` : `${Math.max(PANEL_W.min, Math.min(320, dock.canvasW - 32))}px`;
}

/** The panel box's custom properties (position: fixed; the stylesheet
 * clamps a moved one to a window that shrank since): its top, its left or
 * its right (docked: the canvas's right edge), its width, its height while
 * open on its list and its height cap (docked and not resized: 58 % of the
 * canvas, never past its foot). */
export function panelVars(f: PanelFloat, dock: PanelDock): Record<string, string> {
  const w = panelWidth(f, dock);
  if (f.at) {
    const top = `max(0px, min(${f.at.y}px, calc(100% - ${PANEL_HEAD_H}px)))`;
    return {
      "--gc-tp-top": top,
      "--gc-tp-left": `max(0px, min(${f.at.x}px, calc(100% - ${w})))`,
      "--gc-tp-right": "auto",
      "--gc-tp-w": w,
      "--gc-tp-h": f.h !== null ? `${f.h}px` : "auto",
      "--gc-tp-maxh": `calc(100% - ${top} - ${PANEL_GAP}px)`,
    };
  }
  const cap = f.h !== null ? dock.canvasBottom - dock.top - PANEL_GAP : Math.min(0.58 * dock.canvasH, dock.canvasBottom - dock.top - 12);
  return {
    "--gc-tp-top": `${dock.top}px`,
    "--gc-tp-left": "auto",
    "--gc-tp-right": `${Math.max(0, dock.viewW - dock.right)}px`,
    "--gc-tp-w": w,
    "--gc-tp-h": f.h !== null ? `${f.h}px` : "auto",
    "--gc-tp-maxh": `${Math.max(PANEL_MIN_H, Math.round(cap))}px`,
  };
}

/** The room the Context legend (top centre of the canvas) leaves the docked
 * panel: its width and gaps; none while it is moved (the viewer's choice).
 * Resolved in the canvas (its 100 % is the canvas's width). */
export function topReserve(f: PanelFloat): string {
  return f.at ? "0px" : `calc(${f.w !== null ? `${f.w}px` : "min(320px, calc(100% - 32px))"} + 20px)`;
}

/** The room the kinds legend (at the canvas's foot) leaves the panel
 * (entity.css reads --gc-tp-reserve on the canvas's wrap): the docked panel
 * open on its list, its width and gaps; none while it is moved (anywhere,
 * the viewer's choice), folded (its head, at the top) or absent. A phone's
 * stack never meets the rule (wide canvases only). */
export function legendReserve(f: PanelFloat | null, openList: boolean): string {
  return f && f.at === null && openList ? topReserve(f) : "0px";
}

/** THE CONTEXT BOX AT THE TOP (operator 2026-11-11: "this context legend
 * should be higher, at the same vertical offset than the other fit button"):
 * on a wide canvas it sits in the band the top row leaves, from just past
 * its last button to just short of the motion buttons (or the docked Topics
 * panel, whichever starts further left), canvas px. Too narrow (under
 * CONTEXT_BAND_MIN), null: it keeps its place under the top row. */
export const CONTEXT_BAND_MIN = 360;
export const CONTEXT_BAND_GAP = 12;
export const CONTEXT_BOX_MAX = 760;

export function contextBand(topRowRight: number, rightLimit: number): { centre: number; max: number } | null {
  const left = topRowRight + CONTEXT_BAND_GAP;
  const right = rightLimit - CONTEXT_BAND_GAP;
  if (!(right - left >= CONTEXT_BAND_MIN)) return null;
  return { centre: Math.round((left + right) / 2), max: Math.round(Math.min(CONTEXT_BOX_MAX, right - left)) };
}
