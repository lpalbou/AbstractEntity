/**
 * Pure diary selection for the book reader — extracted so the ordering and
 * redaction-honesty rules are testable without rendering.
 */
import type { DisclosureRow } from "@abstractframework/ui-kit";

import type { FoldState, NodeState } from "./stream_fold";

export interface BookEntry {
  node: NodeState;
  /** ISO birth time (the write moment) or "" when the stream omitted it. */
  bornAt: string;
  /** Words are sealed (redacted, no readable entry door) vs openable. */
  sealed: boolean;
}

/** Every diary node in the fold, oldest → newest (the self-story in the
 * order it was written). A redacted node with no `entry_id` is SEALED —
 * the words never resolve; the reader shows only the act. Ties / missing
 * timestamps fall back to append order (first_seq). */
export function selectDiaryEntries(fold: FoldState): BookEntry[] {
  const out: BookEntry[] = [];
  for (const node of fold.nodes.values()) {
    if (!node.diary) continue;
    out.push({ node, bornAt: node.born_at || "", sealed: node.redacted && !node.entry_id });
  }
  out.sort((a, b) => {
    if (a.bornAt && b.bornAt && a.bornAt !== b.bornAt) return a.bornAt < b.bornAt ? -1 : 1;
    return a.node.first_seq - b.node.first_seq;
  });
  return out;
}

/* ---------------------------------------------------------------- days
 * The Book folds by day (operator 2026-11-08): each day is a disclosure
 * row of the kit's DisclosureList, every day folded except the newest;
 * the days a reader unfolds or folds are remembered for the browser
 * session. Nothing here reads an entry: folding is presentation only. */

/** A day's key: the local calendar date of the write (YYYY-MM-DD); the
 * stamp's own date part when it is not a date; "" when the stream gave
 * none. */
export function bookDayKey(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface BookDay {
  key: string;
  /** Oldest → newest within the day. */
  entries: BookEntry[];
}

/** Entries (oldest → newest) grouped by day, days in the order they first
 * appear: one row per day, even when an undated entry sorts between two
 * of the same day's. */
export function groupBookDays(entries: BookEntry[]): BookDay[] {
  const days = new Map<string, BookDay>();
  for (const e of entries) {
    const key = bookDayKey(e.bornAt);
    const day = days.get(key);
    if (day) day.entries.push(e);
    else days.set(key, { key, entries: [e] });
  }
  return [...days.values()];
}

/** The day open by default: the newest dated day; the last one when no
 * entry has a date. */
export function newestDayKey(days: BookDay[]): string | null {
  for (let i = days.length - 1; i >= 0; i--) if (days[i].key) return days[i].key;
  return days.length ? days[days.length - 1].key : null;
}

/** The reader's own choices, by day key (true = unfolded). A day without
 * a choice is open only when it is the newest. */
export type BookDayChoices = Record<string, boolean>;

export function bookDayOpen(key: string, choices: BookDayChoices, newest: string | null): boolean {
  return Object.prototype.hasOwnProperty.call(choices, key) ? choices[key] : key === newest;
}

export function withBookDayChoice(choices: BookDayChoices, key: string, open: boolean): BookDayChoices {
  return { ...choices, [key]: open };
}

/** The day an entry (a node id) was written on, or null when the Book does
 * not hold it. */
export function bookDayOf(days: BookDay[], nodeId: string): string | null {
  for (const day of days) if (day.entries.some((e) => e.node.id === nodeId)) return day.key;
  return null;
}

export const bookDayRowKey = (key: string): string => `day:${key}`;
export const bookEntryRowKey = (nodeId: string): string => `entry:${nodeId}`;

/** What a day row or an entry row carries for its renderer. */
export type BookRowData = { kind: "day"; day: BookDay; open: boolean } | { kind: "entry"; entry: BookEntry };

/** One row of the kit's DisclosureList. */
export type BookRow = DisclosureRow<BookRowData> & { data: BookRowData };

/** An entry's words as the list shows them: its title, or the act alone
 * for a sealed one. */
export function bookEntryText(e: BookEntry): string {
  return e.sealed ? "a private entry" : e.node.title || "an entry";
}

/** The visible rows: every day, and the entries of the unfolded ones. */
export function bookRows(days: BookDay[], choices: BookDayChoices, newest: string | null, dayLabel: (day: BookDay) => string): BookRow[] {
  const rows: BookRow[] = [];
  for (const day of days) {
    const open = bookDayOpen(day.key, choices, newest);
    const key = bookDayRowKey(day.key);
    rows.push({ key, entityId: key, parentKey: null, depth: 0, expandable: true, expanded: open, textValue: dayLabel(day), data: { kind: "day", day, open } });
    if (!open) continue;
    for (const entry of day.entries) {
      rows.push({ key: bookEntryRowKey(entry.node.id), entityId: entry.node.id, parentKey: key, depth: 1, expandable: false, textValue: bookEntryText(entry), data: { kind: "entry", entry } });
    }
  }
  return rows;
}

const DAY_CHOICES_KEY = "abstractentity_book_days_v1:";

/** The remembered choices for one Book (one gateway + entity), {} when
 * none or when the browser refuses to read them. */
export function readBookDayChoices(storage: Pick<Storage, "getItem"> | null, scope: string): BookDayChoices {
  try {
    const raw = storage?.getItem(DAY_CHOICES_KEY + scope);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: BookDayChoices = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === "boolean") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function writeBookDayChoices(storage: Pick<Storage, "setItem"> | null, scope: string, choices: BookDayChoices): void {
  try {
    storage?.setItem(DAY_CHOICES_KEY + scope, JSON.stringify(choices));
  } catch {
    // Not remembered this session; the days still fold on screen.
  }
}

/** window.sessionStorage, or null where reading it throws. */
export function bookSessionStore(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
