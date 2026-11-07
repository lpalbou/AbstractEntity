/**
 * The book reader — the entity's diary read as a chronological narrative.
 *
 * The diary is the ELECTED-memory plane (what the entity chose to keep,
 * sole-author), and it is the single best surface for understanding WHO an
 * entity is over time — but until now it was reachable only node-by-node
 * via the graph shelf or the Diary lens (mission adversary finding, 0059).
 * This lists every diary node the fold already holds, oldest→newest (the
 * self-story in the order it was written), and opens each through the same
 * operator diary door the inspector uses (VerbatimModal → fetchDiaryEntry,
 * marker-first, no ceremony per the 2026-07-08 ruling).
 *
 * Honesty rules kept from the rest of the app:
 * - Redacted entries (sealed private words, no gist served) render as the
 *   act only — "a private entry" — never reconstructed from another field.
 * - The date is the entity's own `born_at` (wall-clock), so "what did he
 *   write, and when" is answerable at a glance — the time axis the
 *   seq-scrubber lacks.
 * - Zero server work beyond the diary door that already exists; the list
 *   is a pure read of the fold.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { selectDiaryEntries, type BookEntry } from "./book_reader_select";
import type { FoldState, NodeState } from "./stream_fold";
import { VerbatimModal, type VerbatimSource } from "./verbatim_modal";
import { fromLink, WordsLine } from "./words_line";

export interface BookReaderProps {
  fold: FoldState;
  /** The gateway source for the diary door; null on exported files (then
   * entries list but cannot be opened — stated, not hidden). */
  verbatimSource: VerbatimSource | null;
  /** An entry to bring into view and mark (a diary line in the ledger or a
   * diary mark on the time panel was clicked): its graph id, and a nonce so
   * the same entry can be asked for twice. Showing it reads nothing. */
  focus?: { id: string; nonce: number } | null;
}

/** A readable date/time for a book row; falls back to the raw string when
 * the stream's timestamp is non-ISO (never fabricated). */
export function bookDate(iso: string): { day: string; time: string } {
  if (!iso) return { day: "date unknown", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: iso.slice(0, 10) || "date unknown", time: "" };
  return {
    day: d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

export function BookReader({ fold, verbatimSource, focus = null }: BookReaderProps): React.ReactElement {
  const listRef = useRef<HTMLDivElement | null>(null);
  const focusRow = focus ? (fold.graph_to_row.get(focus.id) ?? focus.id) : null;
  useEffect(() => {
    if (!focusRow) return;
    // After the tab is shown (the drawer reveals it in the same commit).
    const t = window.setTimeout(() => {
      const el = listRef.current?.querySelector(`[data-entry="${CSS.escape(focusRow)}"]`);
      el?.scrollIntoView({ block: "center" });
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRow, focus?.nonce]);
  const [open, setOpen] = useState<NodeState | null>(null);

  const entries = useMemo<BookEntry[]>(() => selectDiaryEntries(fold), [fold]);

  // Group by day so the narrative reads as a journal, not a flat list.
  const byDay = useMemo(() => {
    const groups: Array<{ day: string; rows: BookEntry[] }> = [];
    for (const e of entries) {
      const { day } = bookDate(e.bornAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.rows.push(e);
      else groups.push({ day, rows: [e] });
    }
    return groups;
  }, [entries]);

  return (
    <div className="book_reader">
      <div className="book_head">
        <span className="book_title">📔 His book</span>
        <span className="book_count">
          {entries.length === 0 ? "no entries yet" : `${entries.length} elected ${entries.length === 1 ? "entry" : "entries"}`}
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="book_empty wl_p">
          <WordsLine text="Nothing in the book yet. The diary is what he ELECTS to keep — it fills as he writes, never automatically." />
        </div>
      ) : (
        <div className="book_list" ref={listRef}>
          {byDay.map((group) => (
            <div key={group.day} className="book_day_group">
              <div className="book_day">{group.day}</div>
              {group.rows.map((e) => {
                const { time } = bookDate(e.bornAt);
                const openable = !e.sealed && Boolean(e.node.entry_id) && Boolean(verbatimSource);
                return (
                  <button
                    key={e.node.id}
                    data-entry={e.node.id}
                    className={`book_entry ${e.sealed ? "book_entry_sealed" : ""} ${e.node.id === focusRow ? "book_entry_focus" : ""}`}
                    disabled={!openable}
                    onClick={(ev) => !fromLink(ev) && openable && setOpen(e.node)}
                    title={
                      e.sealed
                        ? "A private entry — the words are sealed (sole-author). Only the act of writing it is visible."
                        : openable
                          ? "Read this entry (opens the diary door — recorded as a visible read in his stream)"
                          : "This entry cannot be opened here (exported file, or no entry id)"
                    }
                  >
                    {time ? <span className="book_time">{time}</span> : null}
                    <span className="book_entry_title">
                      <WordsLine text={e.sealed ? "a private entry" : e.node.title || "an entry"} inline />
                    </span>
                    {e.sealed ? <span className="book_seal">sealed</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {open && verbatimSource ? (
        <VerbatimModal node={open} source={verbatimSource} diaryReason="operator review (book)" onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
