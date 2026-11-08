/**
 * The graph's hover cards (operator 2026-11-07: "they must be informative
 * and actionable, they must contain the summaries"): what the memory is
 * and says first — its title, its kind in plain words, its summary — then
 * its facts, then what to do with it. The text selection is pure
 * (hover_card.ts); this module draws it and reads the words a card needs.
 *
 * Reading: the card reads the record through the app's shared reader
 * (verbatim_view.readRecordWords: a GET, one in flight per record) — its
 * current understanding, which replaces the fold's digest when it arrives
 * (the fold's is the reading that entered the context then; a backfill
 * rewrites it in place) — after HOVER_READ_DELAY_MS on the same memory, so
 * a sweep across the graph does not fire a read per node; leaving the
 * memory cancels it. A diary-shaped record is NEVER read from a card.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { NodeState } from "./stream_fold";
import type { VerbatimSource } from "./verbatim_modal";
import { readRecordWords, Words, type RecordWords } from "./verbatim_view";
import { servedDigest } from "./understanding";
import { WordsLine } from "./words_line";
import { needsWords, placeCard, type CardAction, type CardActionId, type CardSummary, type HoverWords } from "./hover_card";

export type { HoverWords } from "./hover_card";

/** How long the pointer rests on a memory before its words are read. */
export const HOVER_READ_DELAY_MS = 250;

/** A record read as the card holds it: its words and its current
 * understanding (`served`; null when the gateway does not serve it) —
 * "none" when it has neither words nor a stored summary. */
export function hoverWordsOf(w: RecordWords): HoverWords {
  const served = w.understanding && w.understanding.served ? w.understanding.understanding : null;
  if (!w.text.trim() && !(served && servedDigest(served))) return { phase: "none", message: "no words are kept for this memory" };
  return { phase: "ready", text: w.text, served };
}

/** The words and current understanding a card shows for `node` — read
 * once the pointer has rested HOVER_READ_DELAY_MS; null when the card
 * reads nothing (a diary record, a relation row…). */
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
          if (live) setState({ key: graphId, words: hoverWordsOf(w) });
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

/** Who wrote the summary, why, as of when — Detail's words, small, under it. */
function CardProvenance({ text }: { text: string | null }): React.ReactElement | null {
  return text ? <WordsLine text={text} className="gc_hc_prov" /> : null;
}

/** The summary block: the record's words through the shared renderer (a
 * dream's own sleep-pass summary as written), a world model's card as its
 * floor, a diary record's line, or a reading note; then its provenance. */
export function CardSummaryBlock({ summary }: { summary: CardSummary | null }): React.ReactElement | null {
  if (!summary) return null;
  if (summary.kind === "diary") return <WordsLine text={summary.text} className="gc_hc_quiet" />;
  if (summary.kind === "reading") return <WordsLine text="reading his words…" className="gc_hc_quiet" />;
  if (summary.kind === "none") return <WordsLine text={summary.text} className="gc_hc_quiet" />;
  if (summary.kind === "floor") {
    return (
      <>
        <div className="gc_hc_summary gc_hc_floor">
          <div className="gc_hc_floor_name">
            <WordsLine text={`What he knows of ${summary.name}`} />
          </div>
          {summary.lines.map((l) => (
            <WordsLine key={l} text={l} />
          ))}
          {summary.threads.length ? (
            <div className="gc_hc_threads">
              {summary.threads.map((t) => (
                <span key={t} className="gc_hc_thread">
                  <WordsLine text={t} inline />
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
        <CardProvenance text={summary.provenance} />
      </>
    );
  }
  return (
    <>
      {summary.plain ? <div className="gc_hc_summary gc_hc_plain">{summary.text}</div> : <Words text={summary.text} className="gc_hc_summary" />}
      <CardProvenance text={summary.provenance} />
    </>
  );
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
