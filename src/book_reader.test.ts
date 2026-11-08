/**
 * Book reader ordering + redaction honesty (mission item 0059).
 *
 * The reader derives its list purely from the fold's diary nodes. These
 * pin the two properties that matter: chronological order (the self-story
 * as written), and that a REDACTED entry with no readable door is shown as
 * sealed — never reconstructed from another field.
 */
import { describe, expect, it } from "vitest";

import { foldEnvelopes } from "./stream_fold";
import {
  bookDayKey,
  bookDayOf,
  bookDayOpen,
  bookDayRowKey,
  bookEntryRowKey,
  bookRows,
  groupBookDays,
  newestDayKey,
  readBookDayChoices,
  selectDiaryEntries,
  withBookDayChoice,
  writeBookDayChoices,
  type BookEntry,
} from "./book_reader_select";
import type { ReplayEnvelope } from "./stream_types";

let autoSeq = 0;
function env(partial: Partial<ReplayEnvelope> & { family: ReplayEnvelope["family"]; payload: Record<string, unknown> }): ReplayEnvelope {
  autoSeq += 1;
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq: partial.seq ?? autoSeq,
    observed_at: "2026-07-07T00:00:00+00:00",
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: null,
    ...partial,
  } as ReplayEnvelope;
}

/** A diary binding: gist-visible (entry_id present, not redacted) unless
 * `sealed` is set (redaction mark, no entry_id → words stay sealed). */
function diaryEnv(recordId: string, seq: number, bornAt: string, opts: { title?: string; entryId?: string; sealed?: boolean } = {}): ReplayEnvelope {
  const display: Record<string, unknown> = opts.sealed
    ? { record_id: recordId, kind: "diary", redacted: "diary" }
    : { record_id: recordId, kind: "diary", diary: true, entry_id: opts.entryId ?? `diary_${recordId}`, title: opts.title ?? "an entry" };
  return env({
    family: "binding",
    seq,
    payload: {
      record_id: recordId,
      scope: "life",
      owner_id: "entity:test",
      search_state: "indexed",
      prompt_state: "active",
      lifecycle: "formed",
      source: "election",
      reason: null,
      observed_at: bornAt,
      binding_id: `b-${recordId}`,
      seq,
    },
    observed_at: bornAt,
    display,
  });
}

describe("book reader diary selection", () => {
  it("lists diary entries oldest → newest by born_at", () => {
    const fold = foldEnvelopes([
      diaryEnv("ex:d-b", 1, "2026-07-08T10:00:00+00:00", { title: "second" }),
      diaryEnv("ex:d-a", 2, "2026-07-07T09:00:00+00:00", { title: "first" }),
      diaryEnv("ex:d-c", 3, "2026-07-09T11:00:00+00:00", { title: "third" }),
    ]);
    const entries = selectDiaryEntries(fold);
    expect(entries.map((e) => e.node.title)).toEqual(["first", "second", "third"]);
  });

  it("marks a redacted entry with no readable door as sealed", () => {
    const fold = foldEnvelopes([
      diaryEnv("ex:d-open", 1, "2026-07-07T09:00:00+00:00", { title: "readable" }),
      diaryEnv("ex:d-seal", 2, "2026-07-08T09:00:00+00:00", { sealed: true }),
    ]);
    const entries = selectDiaryEntries(fold);
    const sealed = entries.find((e) => e.sealed);
    const open = entries.find((e) => !e.sealed);
    expect(sealed).toBeTruthy();
    expect(open?.node.title).toBe("readable");
    // The sealed one carries no entry_id, so the reader cannot open it.
    expect(sealed?.node.entry_id ?? null).toBeNull();
  });

  it("excludes non-diary nodes entirely", () => {
    const fold = foldEnvelopes([
      diaryEnv("ex:d-1", 1, "2026-07-07T09:00:00+00:00", { title: "kept" }),
      env({
        family: "binding",
        seq: 2,
        payload: { record_id: "ex:m-1", scope: "life", owner_id: "e", search_state: "indexed", prompt_state: "active", lifecycle: "formed", source: "remember", reason: null, binding_id: "b2", seq: 2 },
        display: { record_id: "ex:m-1", kind: "memory", title: "a memory" },
      }),
    ]);
    const entries = selectDiaryEntries(fold);
    expect(entries.length).toBe(1);
    expect(entries[0].node.title).toBe("kept");
  });
});

describe("book days: one row per day, folded except the newest (operator 2026-11-08)", () => {
  const mk = (id: string, bornAt: string, opts: { title?: string; sealed?: boolean } = {}) =>
    ({ node: { id, title: opts.title ?? id, entry_id: opts.sealed ? null : `diary_${id}` } as never, bornAt, sealed: Boolean(opts.sealed) }) as BookEntry;
  const entries = [
    mk("a1", "2026-11-04T09:00:00+00:00", { title: "first words of the fourth" }),
    mk("a2", "2026-11-04T13:00:00+00:00"),
    mk("u1", ""),
    mk("b1", "2026-11-05T12:00:00+00:00", { sealed: true }),
    mk("c1", "2026-11-08T11:00:00+00:00"),
    mk("c2", "2026-11-08T12:30:00+00:00"),
  ];
  const days = groupBookDays(entries);

  it("a day's key is its local calendar date; a stamp that is not a date keeps its date part; none is ''", () => {
    const d = new Date("2026-11-05T12:00:00+00:00");
    expect(bookDayKey("2026-11-05T12:00:00+00:00")).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    // The reader's calendar day, not the stamp's own: late on the 5th at -11:00 is the 6th nearly everywhere.
    const late = new Date("2026-11-05T23:30:00-11:00");
    expect(bookDayKey("2026-11-05T23:30:00-11:00")).toBe(`${late.getFullYear()}-${String(late.getMonth() + 1).padStart(2, "0")}-${String(late.getDate()).padStart(2, "0")}`);
    expect(bookDayKey("2026-11-05T23:30:00-11:00")).not.toBe("2026-11-05");
    expect(bookDayKey("2026-11-05 noon-ish")).toBe("2026-11-05");
    expect(bookDayKey("")).toBe("");
  });

  it("groups by day in order, the undated entries in one row of their own", () => {
    expect(days.map((d) => d.entries.map((e) => e.node.id))).toEqual([["a1", "a2"], ["u1"], ["b1"], ["c1", "c2"]]);
    expect(days[1].key).toBe("");
    // An undated entry sorted between two of one day's entries does not split that day.
    const split = groupBookDays([mk("x1", "2026-11-04T09:00:00+00:00"), mk("u", ""), mk("x2", "2026-11-04T10:00:00+00:00")]);
    expect(split.map((d) => d.entries.map((e) => e.node.id))).toEqual([["x1", "x2"], ["u"]]);
  });

  it("the newest dated day is the one open by default; a reader's choice wins either way", () => {
    const newest = newestDayKey(days);
    expect(newest).toBe(days[3].key);
    expect(days.map((d) => bookDayOpen(d.key, {}, newest))).toEqual([false, false, false, true]);
    const choices = withBookDayChoice(withBookDayChoice({}, days[0].key, true), days[3].key, false);
    expect(days.map((d) => bookDayOpen(d.key, choices, newest))).toEqual([true, false, false, false]);
    expect(newestDayKey(groupBookDays([mk("x", ""), mk("y", "")]))).toBe("");
    // Undated entries last: the newest DATED day is still the one open.
    const tail = groupBookDays([mk("d", "2026-11-04T09:00:00+00:00"), mk("z", "")]);
    expect(newestDayKey(tail)).toBe(tail[0].key);
    expect(newestDayKey([])).toBeNull();
  });

  it("rows: every day, and only the unfolded days' entries under them", () => {
    const rows = bookRows(days, {}, newestDayKey(days), (d) => `day ${d.key}`);
    expect(rows.map((r) => [r.key, r.depth, r.expandable, r.expanded ?? null])).toEqual([
      [bookDayRowKey(days[0].key), 0, true, false],
      [bookDayRowKey(""), 0, true, false],
      [bookDayRowKey(days[2].key), 0, true, false],
      [bookDayRowKey(days[3].key), 0, true, true],
      [bookEntryRowKey("c1"), 1, false, null],
      [bookEntryRowKey("c2"), 1, false, null],
    ]);
    expect(rows[4].parentKey).toBe(bookDayRowKey(days[3].key));
    expect(rows[4].entityId).toBe("c1");
    const sealedOpen = bookRows(days, { [days[2].key]: true }, null, () => "");
    expect(sealedOpen.find((r) => r.key === bookEntryRowKey("b1"))?.textValue).toBe("a private entry");
  });

  it("finds the day an entry was written on", () => {
    expect(bookDayOf(days, "a2")).toBe(days[0].key);
    expect(bookDayOf(days, "nope")).toBeNull();
  });

  it("the reader's choices are remembered per Book for the session, and a refusing browser is survived", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    writeBookDayChoices(store, "gw|castor", { "2026-11-04": true, "2026-11-08": false });
    expect(readBookDayChoices(store, "gw|castor")).toEqual({ "2026-11-04": true, "2026-11-08": false });
    expect(readBookDayChoices(store, "gw|nerin")).toEqual({});
    mem.set("abstractentity_book_days_v1:gw|bad", "{not json");
    expect(readBookDayChoices(store, "gw|bad")).toEqual({});
    mem.set("abstractentity_book_days_v1:gw|odd", JSON.stringify({ a: true, b: "yes", c: 1 }));
    expect(readBookDayChoices(store, "gw|odd")).toEqual({ a: true });
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readBookDayChoices(refusing, "gw|castor")).toEqual({});
    expect(() => writeBookDayChoices(refusing, "gw|castor", { a: true })).not.toThrow();
    expect(readBookDayChoices(null, "x")).toEqual({});
  });
});
