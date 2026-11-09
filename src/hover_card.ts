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
 *   diary entry"; a record with no served title says "title being
 *   written…" only while the stream says so, else its raw kind and date
 *   (untitledHeader);
 * - summary (nodeCardText, the topic card's exemplar): the record's full
 *   digest as the stream served it at or before the scrub position
 *   (stream_fold NodeState.digest — never kept for a diary record); none
 *   otherwise (absent, never invented). A memory's own hover card leads
 *   with its CURRENT understanding instead (cardSummary/currentReading:
 *   the record read, the fold's text only until it arrives);
 * - topic cards: the topic's readable words, then its exemplar — the
 *   memory the runtime chose as most representative — by its summary
 *   (or title) when the fold holds it and it is not private.
 */

import React, { isValidElement, type ReactNode } from "react";

import type { FoldState, NodeState } from "./stream_fold";
import { isDiaryGraphId } from "./stream_fold";
import { shapeLabel, summaryLabel } from "./node_label";
import { recordTitle } from "./record_detail";
import { kindWords, wordsReadOnOpen } from "./record_detail_parts";
import { isDiaryShaped } from "./episode_parse";
import { Words } from "./verbatim_view";
import { readCard } from "./world_model_view";
import { sourceWords } from "./world_model_sources";
import { untitledWords } from "./untitled";
import { cardProvenance, isMechanicalMethod, PLACEHOLDER_WORDS, servedDigest, type Understanding } from "./understanding";

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
export function isDiaryNode(node: Pick<NodeState, "diary" | "redacted" | "graph_id" | "id"> & { kind?: string }): boolean {
  return node.diary || node.redacted || isDiaryGraphId(node.graph_id ?? "") || isDiaryGraphId(node.id) || isDiaryShaped(node);
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

/** A record with no served title (operator 2026-11-09): "title being
 * written…" ONLY while the stream says so (its served `display.pending
 * .title`, stream_fold NodeState.title_pending); otherwise its raw kind and
 * the date it was formed — never a title, nor a claim, the app makes
 * (untitled.ts). */
export function untitledHeader(node: Pick<NodeState, "kind" | "born_at" | "title_pending">): string {
  return untitledWords(node.kind, node.born_at, node.title_pending === true);
}

/** A memory's title as plain words (a tooltip line): the card's own title,
 * its first block as the shared renderer draws it (canvasLabel); a private
 * diary entry is "a diary entry"; no served title: untitledHeader. */
export function plainCardTitle(node: NodeState): string {
  if (node.redacted) return "a diary entry";
  if (node.kind === "dream") return recordTitle(node);
  return canvasLabel(node.title) || untitledHeader(node);
}

export function nodeCardText(node: NodeState): CardText {
  if (node.redacted) return { title: "a diary entry", summary: null, plain: false };
  const dream = node.kind === "dream";
  // A dream is named the way Detail names it (record_detail.recordTitle).
  const title = dream ? recordTitle(node) : markdownTitle(node.title) || untitledHeader(node);
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

// ------------------------------------------------ the card's summary

/** What a diary record's card says instead of its words: they are never
 * read from a card (a read is recorded in his biography); the Book opens
 * them on its own click. */
export const DIARY_CARD_LINE = "a diary entry — opens in his Book";

/** The record's summary as the fold holds it (a recall served its digest). */
function digestOf(node: NodeState): string | null {
  return typeof node.digest === "string" && node.digest.trim() ? node.digest.trim() : null;
}

/** Does the card read the record? Whenever the record is not diary-shaped
 * (NEVER read from a card) and Detail itself would read it on open
 * (record_detail_parts.wordsReadOnOpen: relation rows and engine acts carry
 * no words) — a digest the fold holds too: it is the reading that entered
 * the context then, and the record's understanding is rewritten in place
 * (a backfill turns a mechanical digest into his prose), so only the read
 * knows the current one (operator 2026-11-08: the card still showed the
 * old mechanical digest of a backfilled record). */
export function needsWords(node: NodeState): boolean {
  if (isDiaryNode(node)) return false;
  return wordsReadOnOpen(node);
}

/** The record's current understanding as its read served it
 * (understanding.ts) — the fields the card shows and compares. */
export type ServedReading = Pick<Understanding, "digest" | "digest_version" | "digest_method" | "authored_by" | "reader" | "cause" | "understood_at">;

/** What the card's read holds: reading; the words (`served`: the record's
 * current understanding, null when the gateway does not serve it); or
 * nothing to show, with why. */
export type HoverWords = { phase: "reading" } | { phase: "ready"; text: string; served: ServedReading | null } | { phase: "none"; message: string };

/** The summary the card leads with and its hint (understanding.cardProvenance). */
export interface CardReading {
  text: string;
  /** Under the summary, in Detail's words; null when nothing is known of
   * who wrote it (a fold digest that is not mechanical). */
  provenance: string | null;
  /** The record read's current understanding (else the fold's reading). */
  current: boolean;
}

/** The fold's reading is newer than the read's only when both name their
 * version and the fold's is higher (a rewrite landed on the stream after
 * the card read the record). */
function foldIsNewer(fold: number | null | undefined, served: number | null): boolean {
  return typeof fold === "number" && typeof served === "number" && fold > served;
}

/** Which reading the card shows: the record read's current understanding
 * (its served digest) — unless the fold holds a newer one; else the
 * fold's digest (the reading that entered the context at the scrub
 * position), shown while the read is under way or when the read serves
 * none, with the placeholder hint when its method is mechanical. A text is
 * never rewritten: an old mechanical digest is superseded, never repaired.
 * Never for a diary record. */
export function currentReading(node: NodeState, served: ServedReading | null, timeZone?: string): CardReading | null {
  if (isDiaryNode(node)) return null;
  const fold = digestOf(node);
  const own = served ? servedDigest(served) : null;
  if (own && served && !(fold && foldIsNewer(node.digest_version, served.digest_version))) {
    return { text: own, provenance: cardProvenance(served, timeZone), current: true };
  }
  if (fold) return { text: fold, provenance: isMechanicalMethod(node.digest_method) ? PLACEHOLDER_WORDS : null, current: false };
  return null;
}

export type CardSummary =
  | { kind: "diary"; text: string }
  | { kind: "floor"; name: string; lines: string[]; threads: string[]; feeling: string | null; provenance: string | null }
  | { kind: "words"; text: string; plain: boolean; provenance: string | null }
  | { kind: "reading" }
  | { kind: "none"; text: string };

function dayOf(stamp: string | null): string {
  return String(stamp ?? "").slice(0, 10);
}

/** What the card says first, per kind: the record's current understanding
 * (currentReading: the read's served digest, the fold's digest until it
 * arrives), else the words just read (`words`; null while unread), through
 * the parses Detail uses (a served summary is used as served, never
 * derived from the words):
 * - a diary record: DIARY_CARD_LINE, never its words;
 * - a world model: its card (world_model_view.readCard) — the evidence
 *   floor's name, count, days, threads and standing feeling, or its lead;
 * - a lived moment: its summary, else his answer's lead
 *   (world_model_sources.sourceWords, the exchange parse) when none is
 *   served;
 * - a dream: its understanding as Markdown (Detail's rule); the sleep
 *   pass's own summary — the fold's, or its words — as written;
 * - everything else (lessons, interests, identity, summaries, …): the
 *   whole words.
 * Every summary carries its hint (`provenance`; null when unknown). */
export function cardSummary(node: NodeState, words: HoverWords | null, entity: string, timeZone?: string): CardSummary | null {
  if (isDiaryNode(node)) return { kind: "diary", text: DIARY_CARD_LINE };
  const reading = currentReading(node, words && words.phase === "ready" ? words.served : null, timeZone);
  const read = words && words.phase === "ready" && words.text.trim() ? words.text.trim() : null;
  const text = reading?.text ?? read;
  const provenance = reading?.provenance ?? null;
  if (!text) {
    if (words?.phase === "reading") return { kind: "reading" };
    if (words?.phase === "none") return { kind: "none", text: words.message };
    return null;
  }
  if (node.kind === "world_model") {
    const shape = readCard(text);
    if (shape.kind === "floor") {
      const lines: string[] = [];
      if (shape.count !== null) {
        const days = shape.first ? (dayOf(shape.first) === dayOf(shape.last) ? `, ${dayOf(shape.first)}` : `, ${dayOf(shape.first)} to ${dayOf(shape.last)}`) : "";
        lines.push(`${shape.count} lived ${shape.count === 1 ? "memory" : "memories"}${days}${shape.kinds ? ` (${shape.kinds})` : ""}`);
      }
      return { kind: "floor", name: shape.name, lines, threads: shape.threads, feeling: shape.feeling ? shape.feeling.replace(/^Standing feeling:\s*/, "") : null, provenance };
    }
    return { kind: "words", text: shape.lead || text, plain: false, provenance };
  }
  if (node.kind === "dream") return { kind: "words", text, plain: !reading?.current, provenance };
  if (node.kind === "episode" && !reading) {
    const lead = sourceWords(text, entity);
    return { kind: "words", text: lead.phase === "ready" && lead.lead ? lead.lead : text, plain: false, provenance };
  }
  return { kind: "words", text, plain: false, provenance };
}

/** The record's kind in plain words (the line Detail opens with). */
export function cardKindLine(node: NodeState): string {
  return kindWords(node);
}

// ------------------------------------------------ the card's actions

export type CardActionId = "open" | "book" | "topic" | "partners" | "light" | "members";

export interface CardAction {
  id: CardActionId;
  label: string;
}

/** What a memory's card offers, first the default (what a click does):
 * a diary entry shows in the Book (never Detail: no read), a world model
 * opens its card, anything else opens in Detail; then its topic, when it
 * has one, and the memories it was used with, when there are any. */
export function nodeActions(node: NodeState, ctx: { topic: string | null; partners: number }): CardAction[] {
  const out: CardAction[] = [];
  if (isDiaryNode(node)) out.push({ id: "book", label: "Show in Book" });
  else if (node.kind === "world_model") out.push({ id: "open", label: "Open the card" });
  else out.push({ id: "open", label: "Open in Detail" });
  if (ctx.topic) out.push({ id: "topic", label: "Show its topic" });
  if (ctx.partners > 0 && !isDiaryNode(node)) out.push({ id: "partners", label: `Used with ${ctx.partners} →` });
  return out;
}

/** What a topic's card offers. */
export function topicActions(size: number): CardAction[] {
  return [
    { id: "light", label: "Light this topic" },
    { id: "members", label: `${size} ${size === 1 ? "memory" : "memories"} →` },
  ];
}

/** How many memories this one was used with (its co-use trails). */
export function partnerCount(fold: FoldState, id: string): number {
  let n = 0;
  for (const e of fold.edges.values()) if (e.a === id || e.b === id) n += 1;
  return n;
}
