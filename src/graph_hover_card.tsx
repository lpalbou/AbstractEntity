/**
 * The graph's hover cards (operator 2026-11-07: "they must be informative
 * and actionable, they must contain the summaries"): what the memory is
 * and says first — its title, its kind in plain words, its summary — then
 * its facts, then what to do with it. The text selection is pure
 * (hover_card.ts); this module draws it and reads the words a card needs.
 *
 * Reading: when the fold holds no summary, the card reads the record's
 * words through the app's shared reader (verbatim_view.readRecordWords: a
 * GET, cached) — after HOVER_READ_DELAY_MS on the same memory, so a sweep
 * across the graph does not fire a read per node; leaving the memory
 * cancels it. A diary-shaped record is NEVER read from a card.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { NodeState } from "./stream_fold";
import type { VerbatimSource } from "./verbatim_modal";
import { readRecordWords, Words } from "./verbatim_view";
import { WordsLine } from "./words_line";
import { needsWords, placeCard, type CardAction, type CardActionId, type CardSummary } from "./hover_card";

/** How long the pointer rests on a memory before its words are read. */
export const HOVER_READ_DELAY_MS = 250;

export type HoverWords = { phase: "reading" } | { phase: "ready"; text: string } | { phase: "none"; message: string };

/** The words a card shows for `node` when the fold holds no summary —
 * read once the pointer has rested HOVER_READ_DELAY_MS; null when the card
 * needs none (a digest is held, a diary record, a relation row…). */
export function useHoverWords(source: VerbatimSource | null, node: NodeState | null): HoverWords | null {
  const graphId = node ? node.graph_id ?? node.id : null;
  const need = Boolean(node && source && needsWords(node));
  const kind = node?.kind;
  const [state, setState] = useState<{ key: string; words: HoverWords } | null>(null);
  useEffect(() => {
    if (!need || !source || !graphId) return;
    let live = true;
    const timer = window.setTimeout(() => {
      if (!live) return;
      setState({ key: graphId, words: { phase: "reading" } });
      readRecordWords(source, graphId, kind)
        .then((w) => {
          if (live) setState({ key: graphId, words: w.text.trim() ? { phase: "ready", text: w.text } : { phase: "none", message: "no words are kept for this memory" } });
        })
        .catch((e: Error & { status?: number }) => {
          if (!live) return;
          // 404 = the door keeps no separate words for it (no payload_ref):
          // its summary is its digest, which a recall serves — the note
          // Detail gives for the same case.
          setState({ key: graphId, words: { phase: "none", message: e.status === 404 ? "The fuller summary arrives once this memory is recalled." : `his words could not be read (${e.message || "error"})` } });
        });
    }, HOVER_READ_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // Field deps, never the source object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphId, need, kind, source?.baseUrl, source?.entity]);
  if (!need) return null;
  return state && state.key === graphId ? state.words : { phase: "reading" };
}

/** A card beside the cursor, measured and kept inside the viewport
 * (hover_card.placeCard); it takes the pointer (its actions are buttons)
 * and tells the canvas when the pointer comes in or leaves. */
export const HoverCardBox = React.forwardRef(function HoverCardBox(
  {
    x,
    y,
    className,
    onEnter,
    onLeave,
    children,
  }: { x: number; y: number; className: string; onEnter(): void; onLeave(ev: React.MouseEvent): void; children: React.ReactNode },
  outerRef: React.ForwardedRef<HTMLDivElement>,
): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x + 16, top: y + 12 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const next = placeCard(x, y, r.width, r.height, window.innerWidth, window.innerHeight);
    setPos((p) => (p.left === next.left && p.top === next.top ? p : next));
  });
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (typeof outerRef === "function") outerRef(el);
        else if (outerRef) outerRef.current = el;
      }}
      className={`${className} gc_card_box`}
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
    </div>
  );
});

/** The summary block: the record's words through the shared renderer (a
 * dream's as written), a world model's card as its floor, a diary
 * record's line, or a reading note. */
export function CardSummaryBlock({ summary }: { summary: CardSummary | null }): React.ReactElement | null {
  if (!summary) return null;
  if (summary.kind === "diary") return <div className="gc_hc_quiet">{summary.text}</div>;
  if (summary.kind === "reading") return <div className="gc_hc_quiet">reading his words…</div>;
  if (summary.kind === "none") return <div className="gc_hc_quiet">{summary.text}</div>;
  if (summary.kind === "floor") {
    return (
      <div className="gc_hc_summary gc_hc_floor">
        <div className="gc_hc_floor_name">
          <WordsLine text={`What he knows of ${summary.name}`} />
        </div>
        {summary.lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
        {summary.threads.length ? (
          <div className="gc_hc_threads">
            {summary.threads.map((t) => (
              <span key={t} className="gc_hc_thread">
                {t}
              </span>
            ))}
          </div>
        ) : null}
        {summary.feeling ? (
          <div className="gc_hc_feeling">
            <WordsLine text={summary.feeling} />
          </div>
        ) : null}
      </div>
    );
  }
  return summary.plain ? <div className="gc_hc_summary gc_hc_plain">{summary.text}</div> : <Words text={summary.text} className="gc_hc_summary" />;
}

/** The card's actions: real buttons (keyboard-focusable, tappable), the
 * first one the default (what a click on the memory does). */
export function CardActions({ actions, onAction }: { actions: CardAction[]; onAction(id: CardActionId): void }): React.ReactElement | null {
  if (actions.length === 0) return null;
  return (
    <div className="gc_card_actions" role="group" aria-label="What to do with it">
      {actions.map((a, i) => (
        <button key={a.id} type="button" className={`gc_card_action${i === 0 ? " gc_card_action_main" : ""}`} onClick={() => onAction(a.id)}>
          {a.label}
        </button>
      ))}
    </div>
  );
}
