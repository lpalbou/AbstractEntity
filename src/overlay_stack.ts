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
 * the top right, not bottom right"). On a wide canvas the panel starts
 * DOCKED top-right, under the motion buttons, and grows downward; its grip
 * (on its head) moves it anywhere inside the canvas, its corner resizes it,
 * a double-click on its head docks it again. Where it is and its size are
 * presentation, remembered in one versioned key. A phone keeps the stack.
 * Pure: the canvas measures, these numbers clamp. In canvas px.
 */
export type PanelFloat = {
  /** Where its top-left corner is; null: docked top-right. */
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
/** Its head stays inside the canvas (the grip with it). */
export const PANEL_HEAD_H = 40;
/** The lens row's band: a moved panel stays below it. */
export const PANEL_TOP_MIN = 48;
/** The gap it keeps from the canvas edges and from the motion buttons. */
export const PANEL_GAP = 8;
export const PANEL_STORAGE_KEY = "abstractentity_topics_panel_v1";

type Box = { x: number; y: number; w: number; h: number };

/** Where a move by (dx, dy) from `start` puts it: inside the canvas, below
 * the lens row, its head never under the motion buttons (a panel across
 * their column stays below them). */
export function movePanel(start: Box, dx: number, dy: number, canvas: { w: number; h: number }, buttons: Box | null): { x: number; y: number } {
  const x = Math.max(0, Math.min(start.x + dx, canvas.w - start.w));
  let y = Math.max(PANEL_TOP_MIN, Math.min(start.y + dy, canvas.h - PANEL_HEAD_H));
  if (buttons && x < buttons.x + buttons.w && buttons.x < x + start.w && y < buttons.y + buttons.h + PANEL_GAP) y = buttons.y + buttons.h + PANEL_GAP;
  return { x, y };
}

/** Its size after its bottom-right corner moved by (dx, dy): PANEL_W wide
 * at most and at least, never past the canvas's edges. Its top-left stays
 * put; at the canvas's right edge a wider panel grows to the left instead
 * (a docked panel always does: its right edge is the canvas's). */
export function resizePanel(start: Box, dx: number, dy: number, canvas: { w: number; h: number }, docked: boolean): { x: number; w: number; h: number } {
  const right = docked ? start.x + start.w : canvas.w - PANEL_GAP;
  let w = Math.max(PANEL_W.min, Math.min(start.w + dx, PANEL_W.max));
  let x = docked ? right - w : start.x;
  if (x + w > right) x = right - w;
  if (x < 0) {
    // A canvas narrower than the panel's width: as wide as it.
    x = 0;
    w = right;
  }
  const h = Math.max(PANEL_MIN_H, Math.min(start.h + dy, canvas.h - start.y - PANEL_GAP));
  return { x: Math.round(x), w: Math.round(w), h: Math.round(h) };
}

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
function panelWidth(f: PanelFloat): string {
  return f.w !== null ? `${f.w}px` : "min(320px, calc(100% - 32px))";
}

/** The panel's custom properties (the stylesheet clamps them to the canvas
 * when it shrinks): its top, its left (docked: none, it keeps right), its
 * width, its height while open on its list, and the room the Context legend
 * leaves it at the top (docked only). `dockTop`: under the motion buttons. */
export function panelVars(f: PanelFloat, dockTop: number): Record<string, string> {
  const w = panelWidth(f);
  return {
    "--gc-tp-top": f.at ? `max(${PANEL_TOP_MIN}px, min(${f.at.y}px, calc(100% - ${PANEL_HEAD_H}px)))` : `${dockTop}px`,
    "--gc-tp-left": f.at ? `max(0px, min(${f.at.x}px, calc(100% - ${w})))` : "auto",
    "--gc-tp-right": f.at ? "auto" : "10px",
    "--gc-tp-w": w,
    "--gc-tp-h": f.h !== null ? `${f.h}px` : "auto",
    "--gc-tp-top-reserve": f.at ? "0px" : `calc(${w} + 20px)`,
  };
}

/** The room the kinds legend (at the canvas's foot) leaves the panel
 * (entity.css reads --gc-tp-reserve on the canvas's wrap): the docked panel
 * open on its list, its width and gaps; none while it is moved (anywhere,
 * the viewer's choice), folded (its head, at the top) or absent. A phone's
 * stack never meets the rule (wide canvases only). */
export function legendReserve(f: PanelFloat | null, openList: boolean): string {
  return f && f.at === null && openList ? `calc(${panelWidth(f)} + 20px)` : "0px";
}
