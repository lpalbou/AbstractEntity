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

import React, { isValidElement, type ReactNode } from "react";

import type { FoldState, NodeState } from "./stream_fold";
import { isDiaryGraphId } from "./stream_fold";
import { shapeLabel, summaryLabel } from "./node_label";
import { recordTitle } from "./record_detail";
import { Words } from "./verbatim_view";

export interface CardText {
  /** Markdown, inline (one line of prose; headings/bold render, never
   * raw markers). */
  title: string;
  /** The record's full summary (Markdown unless `plain`), or null. */
  summary: string | null;
  /** The summary is not Markdown: a dream's born digest is the sleep
   * pass's mechanical text (quoted titles, stray backticks) — shown as
   * written, the way Detail shows it (verbatim_view plain). */
  plain: boolean;
}

/** A diary record by any of the app's rules: the fold's diary flag, its
 * redaction, or a diary graph id (stream_fold.isDiaryGraphId). */
export function isDiaryNode(node: Pick<NodeState, "diary" | "redacted" | "graph_id" | "id">): boolean {
  return node.diary || node.redacted || isDiaryGraphId(node.graph_id ?? "") || isDiaryGraphId(node.id);
}

/** A title as Markdown: the mechanical scaffolding of its FIRST line is
 * stripped (node_label.shapeLabel), every later line is kept as written —
 * collapsing the lines would turn "…\n### United States" into a raw
 * "### United States" mid-line that no Markdown renderer can read. */
export function markdownTitle(raw: string): string {
  const lines = String(raw || "").trim().split(/\r?\n/);
  const first = shapeLabel(lines[0] ?? "");
  // Later lines exactly as written (a blank line still ends a paragraph).
  const rest = lines.slice(1).join("\n");
  return rest.trim() ? `${first}\n${rest}`.trim() : first;
}

export function nodeCardText(node: NodeState): CardText {
  if (node.redacted) return { title: "a diary entry", summary: null, plain: false };
  const dream = node.kind === "dream";
  // A dream is named the way Detail names it (record_detail.recordTitle).
  const title = dream ? recordTitle(node) : markdownTitle(node.title) || node.id.slice(0, 22);
  const digest = !isDiaryNode(node) && typeof node.digest === "string" ? node.digest.trim() : "";
  // A digest identical to the title would only say it twice.
  const summary = digest && digest !== title ? digest : null;
  return { title, summary, plain: dream };
}

/** The exemplar line of a topic card: the exemplar's summary (or title)
 * from the fold; else the payload's exemplar title — unless the exemplar
 * is a diary entry (private: never its words). */
export function topicExemplarText(fold: FoldState, exemplarId: string, exemplarTitle: string): { text: string; plain: boolean } | null {
  if (isDiaryGraphId(exemplarId)) return null;
  const row = fold.graph_to_row.get(exemplarId) ?? exemplarId;
  const node = fold.nodes.get(row);
  if (node) {
    if (isDiaryNode(node)) return null;
    const { title, summary, plain } = nodeCardText(node);
    return summary ? { text: summary, plain } : { text: title, plain: false };
  }
  return summaryLabel(exemplarTitle) ? { text: shapeLabel(exemplarTitle), plain: false } : null;
}

/** Where a hover card goes: beside the cursor (right, below), kept whole
 * inside the viewport with an 8 px margin — measured, so a long summary
 * or a 400 px phone never pushes it off screen. */
export function placeCard(x: number, y: number, w: number, h: number, vw: number, vh: number): { left: number; top: number } {
  const left = Math.max(8, Math.min(x + 16, vw - w - 8));
  const top = Math.max(8, Math.min(y + 12, vh - h - 8));
  return { left, top };
}

/** What the shared renderer would draw for `md`, as the element tree it
 * returns: `Words` hands the text to panel-chat's `Markdown`, which is a
 * plain function of its props (no hooks) — calling it parses exactly as
 * the cards and Detail do, without mounting anything. */
function renderedTree(md: string): ReactNode {
  const outer = Words({ text: md, className: "" });
  const render = outer.type as unknown;
  return typeof render === "function" ? (render as (props: unknown) => ReactNode)(outer.props) : outer;
}

/** The text a rendered tree shows: host elements' children in order, a
 * line break as a space, a code block by its code. */
function treeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(treeText).join("");
  if (!isValidElement(node)) return "";
  if (node.type === "br") return " ";
  const props = node.props as { children?: ReactNode; code?: unknown };
  if (typeof node.type === "string" || node.type === React.Fragment) return treeText(props.children);
  return typeof props.code === "string" ? props.code : treeText(props.children);
}

const plainCache = new Map<string, string>();

/** Canvas text cannot render Markdown: a label drawn on the canvas is the
 * plain text of the FIRST block the shared renderer draws for the title —
 * after the runtime's own title scaffolding ("exchange:" …) is stripped
 * from its first line (markdownTitle), so a heading under it still parses
 * as a heading. Nothing is guessed: whatever the renderer shows as text is
 * the label. Cached per title (labels draw every frame). */
export function canvasLabel(raw: string): string {
  const key = String(raw ?? "");
  const hit = plainCache.get(key);
  if (hit !== undefined) return hit;
  const tree = renderedTree(markdownTitle(key));
  const blocks = isValidElement(tree) ? (tree.props as { children?: ReactNode }).children : tree;
  let text = "";
  for (const block of React.Children.toArray(blocks)) {
    text = treeText(block).replace(/\s+/g, " ").trim();
    if (text) break;
  }
  if (plainCache.size > 4000) plainCache.clear();
  plainCache.set(key, text);
  return text;
}
