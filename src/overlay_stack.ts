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
