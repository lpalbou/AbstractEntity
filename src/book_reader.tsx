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
import { DisclosureList, type DisclosureListHandle, type DisclosureSelection } from "@abstractframework/ui-kit";

import {
  bookDayOf,
  bookEntryRowKey,
  bookEntryText,
  bookRows,
  bookSessionStore,
  groupBookDays,
  newestDayKey,
  readBookDayChoices,
  selectDiaryEntries,
  withBookDayChoice,
  writeBookDayChoices,
  type BookDay,
  type BookDayChoices,
  type BookEntry,
  type BookRow,
  type BookRowData,
} from "./book_reader_select";
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

/** A day row's date: the first entry's day, in the reader's words. */
function dayLabel(day: BookDay): string {
  return bookDate(day.entries[0]?.bornAt ?? "").day;
}

/** A click followed by a double-click's activation is one gesture. */
const DOUBLE_CLICK_MS = 500;

export function BookReader({ fold, verbatimSource, focus = null }: BookReaderProps): React.ReactElement {
  const listRef = useRef<DisclosureListHandle | null>(null);
  const focusRow = focus ? (fold.graph_to_row.get(focus.id) ?? focus.id) : null;
  const [open, setOpen] = useState<NodeState | null>(null);

  const entries = useMemo<BookEntry[]>(() => selectDiaryEntries(fold), [fold]);
  // One row per day, folded except the newest (operator 2026-11-08); a
  // reader's own unfolding and folding is remembered for the session.
  const days = useMemo(() => groupBookDays(entries), [entries]);
  const newest = newestDayKey(days);
  const scope = verbatimSource ? `${verbatimSource.baseUrl}|${verbatimSource.entity}` : "file";
  const [choiceScope, setChoiceScope] = useState(scope);
  const [choices, setChoices] = useState<BookDayChoices>(() => readBookDayChoices(bookSessionStore(), scope));
  if (choiceScope !== scope) {
    setChoiceScope(scope);
    setChoices(readBookDayChoices(bookSessionStore(), scope));
  }
  const [selection, setSelection] = useState<DisclosureSelection | null>(null);

  // An entry asked for (a ledger diary line, a diary mark, "Show in Book"):
  // its day unfolds and it is marked — reading nothing. Settled once the
  // Book holds the entry (a live entry may land after the ask).
  const focusSig = focusRow ? `${focusRow}#${focus?.nonce ?? 0}` : null;
  const [seenFocus, setSeenFocus] = useState<string | null>(null);
  if (focusSig !== seenFocus) {
    const day = focusRow ? bookDayOf(days, focusRow) : null;
    if (!focusRow || day !== null) {
      setSeenFocus(focusSig);
      if (day !== null && focusRow) {
        setChoices((c) => withBookDayChoice(c, day, true));
        setSelection({ entityId: focusRow, rowKey: bookEntryRowKey(focusRow) });
      }
    }
  }
  useEffect(() => {
    if (!seenFocus || !focusRow) return;
    // After the tab is shown (the drawer reveals it in the same commit).
    const t = window.setTimeout(() => listRef.current?.scrollToRow(bookEntryRowKey(focusRow), "center"), 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seenFocus]);

  useEffect(() => writeBookDayChoices(bookSessionStore(), choiceScope, choices), [choiceScope, choices]);

  const lastClickToggle = useRef(0);
  const toggleDay = (key: string) => setChoices((c) => withBookDayChoice(c, key, !(Object.prototype.hasOwnProperty.call(c, key) ? c[key] : key === newest)));
  const openable = (e: BookEntry) => !e.sealed && Boolean(e.node.entry_id) && Boolean(verbatimSource);
  // Reading an entry is its own act: a click on it, Enter or a double-click.
  // Moving through the list (arrows, Space, typeahead) only marks a row.
  const activate = (row: BookRow) => {
    const d = row.data;
    if (d.kind === "day") {
      if (Date.now() - lastClickToggle.current > DOUBLE_CLICK_MS) toggleDay(d.day.key);
      return;
    }
    if (openable(d.entry)) setOpen(d.entry.node);
  };

  const rows = useMemo(() => bookRows(days, choices, newest, dayLabel), [days, choices, newest]);

  const renderRow = (row: BookRow): React.ReactNode => {
    const d = row.data;
    if (d.kind === "day") {
      const n = d.day.entries.length;
      return (
        <span
          className="book_day_head"
          onClick={(ev) => {
            if (fromLink(ev) || ev.detail > 1) return;
            lastClickToggle.current = Date.now();
            toggleDay(d.day.key);
          }}
        >
          <span className="book_day_date">{row.textValue}</span>
          <span className="book_day_count">{`${n} ${n === 1 ? "entry" : "entries"}`}</span>
          {d.open ? null : (
            <span className="book_day_first">
              <WordsLine text={bookEntryText(d.day.entries[0])} inline />
            </span>
          )}
        </span>
      );
    }
    const e = d.entry;
    const { time } = bookDate(e.bornAt);
    const can = openable(e);
    return (
      <span
        data-entry={e.node.id}
        className={`book_entry_row ${e.sealed ? "book_entry_sealed" : ""} ${can ? "" : "book_entry_closed"}`}
        onClick={(ev) => !fromLink(ev) && can && setOpen(e.node)}
        title={
          e.sealed
            ? "A private entry — the words are sealed (sole-author). Only the act of writing it is visible."
            : can
              ? "Read this entry (opens the diary door — recorded as a visible read in his stream)"
              : "This entry cannot be opened here (exported file, or no entry id)"
        }
      >
        {time ? <span className="book_time">{time}</span> : null}
        <span className="book_entry_title">
          <WordsLine text={bookEntryText(e)} inline />
        </span>
        {e.sealed ? <span className="book_seal">sealed</span> : null}
      </span>
    );
  };

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
        <DisclosureList<BookRowData>
          ref={listRef}
          className="book_days"
          ariaLabel="His book, by day"
          rows={rows}
          selection={selection}
          onSelect={setSelection}
          onToggleExpand={(_key, row) => row.data && row.data.kind === "day" && toggleDay(row.data.day.key)}
          onActivate={(_sel, row) => activate(row as BookRow)}
          renderRow={(row) => renderRow(row as BookRow)}
          scrollOnSelect={false}
        />
      )}
      {open && verbatimSource ? (
        <VerbatimModal node={open} source={verbatimSource} diaryReason="operator review (book)" onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
