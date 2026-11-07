/**
 * What the graph's hover cards say first (operator 2026-11-07: "the mouse
 * over cards of the graph are pretty uninformative (no summary) and also
 * need to render markdown properly"). Pure selection of the card's TEXT
 * from what the fold already holds — the card renders the title and the
 * summary as Markdown (verbatim_view.Words, the app's shared renderer),
 * then the meta grid as before.
 *
 * - title: the record's title (the first line's mechanical scaffolding
 *   stripped — node_label.shapeLabel — its later lines kept, so Markdown
 *   headings and lists stay readable); a private diary entry reads "a
 *   diary entry"; a record with no title shows its id's head;
 * - summary: the record's full digest when a recall at or before the
 *   scrub position served it (stream_fold NodeState.digest — never kept
 *   for a diary record); none otherwise (absent, never invented);
 * - topic cards: the topic's readable words, then its exemplar — the
 *   memory the runtime chose as most representative — by its summary
 *   (or title) when the fold holds it and it is not private.
 */

import type { FoldState, NodeState } from "./stream_fold";
import { isDiaryGraphId } from "./stream_fold";
import { shapeLabel, summaryLabel } from "./node_label";

export interface CardText {
  /** Markdown, inline (one line of prose; headings/bold render, never
   * raw markers). */
  title: string;
  /** Markdown, block (the record's full summary), or null. */
  summary: string | null;
}

/** A title as Markdown: the mechanical scaffolding of its FIRST line is
 * stripped (node_label.shapeLabel), every later line is kept as written —
 * collapsing the lines would turn "…\n### United States" into a raw
 * "### United States" mid-line that no Markdown renderer can read. */
export function markdownTitle(raw: string): string {
  const lines = String(raw || "").trim().split(/\r?\n/);
  const first = shapeLabel(lines[0] ?? "");
  const rest = lines.slice(1).join("\n").trim();
  return [first, rest].filter(Boolean).join("\n");
}

export function nodeCardText(node: NodeState): CardText {
  if (node.redacted) return { title: "a diary entry", summary: null };
  const title = markdownTitle(node.title) || node.id.slice(0, 22);
  const digest = !node.diary && typeof node.digest === "string" ? node.digest.trim() : "";
  // A digest identical to the title would only say it twice.
  const summary = digest && digest !== title ? digest : null;
  return { title, summary };
}

/** The exemplar line of a topic card: the exemplar's summary (or title)
 * from the fold; else the payload's exemplar title — unless the exemplar
 * is a diary entry (private: never its words). */
export function topicExemplarText(fold: FoldState, exemplarId: string, exemplarTitle: string): string | null {
  const row = fold.graph_to_row.get(exemplarId) ?? exemplarId;
  const node = fold.nodes.get(row);
  if (node) {
    if (node.diary || node.redacted) return null;
    const { title, summary } = nodeCardText(node);
    return summary ?? title;
  }
  if (isDiaryGraphId(exemplarId)) return null;
  return summaryLabel(exemplarTitle) ? shapeLabel(exemplarTitle) : null;
}

/** Where a hover card goes: beside the cursor (right, below), kept whole
 * inside the viewport with an 8 px margin — measured, so a long summary
 * or a 400 px phone never pushes it off screen. */
export function placeCard(x: number, y: number, w: number, h: number, vw: number, vh: number): { left: number; top: number } {
  const left = Math.max(8, Math.min(x + 16, vw - w - 8));
  const top = Math.max(8, Math.min(y + 12, vh - h - 8));
  return { left, top };
}

/** Canvas text cannot render Markdown: a label drawn on the canvas shows
 * the words without their markers (heading hashes, emphasis stars and
 * underscores, code ticks), on one line. */
export function plainLabel(md: string): string {
  return String(md || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/^\s*[-*+]\s+/, ""))
    .join(" ")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/(^|[\s(])[*_]([^\s*_][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}
