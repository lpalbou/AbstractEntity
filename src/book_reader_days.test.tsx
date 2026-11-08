/**
 * The Book folds by day (operator 2026-11-08): each day is a row of the
 * kit's DisclosureList, every day folded except the newest; a folded day
 * shows its date, its count and the first entry's words; an entry asked
 * for from the ledger, a diary mark or "Show in Book" unfolds its day and
 * is marked. Opening the Book or moving through it reads nothing — an
 * entry is read only when it is opened (its click, Enter or a double
 * click). Rendered with react-dom/server (no DOM in the tests); the
 * interaction wiring is pinned on the source.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BookReader, bookDate } from "./book_reader";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";

let seq = 0;
function diaryEnv(recordId: string, bornAt: string, opts: { title?: string; sealed?: boolean } = {}): ReplayEnvelope {
  seq += 1;
  const display: Record<string, unknown> = opts.sealed
    ? { record_id: recordId, kind: "diary", redacted: "diary" }
    : { record_id: recordId, kind: "diary", diary: true, entry_id: `diary_${recordId}`, title: opts.title ?? "an entry" };
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "binding",
    observed_at: bornAt,
    scope: "life",
    owner_id: "entity:castor",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload: { record_id: recordId, scope: "life", owner_id: "entity:castor", search_state: "indexed", prompt_state: "active", lifecycle: "formed", source: "election", reason: null, observed_at: bornAt, binding_id: `b-${recordId}`, seq },
    display,
  } as unknown as ReplayEnvelope;
}

const FOLD = foldEnvelopes([
  diaryEnv("ex:diary-a1", "2026-11-04T09:00:00+00:00", { title: "The harbour archive opens at nine" }),
  diaryEnv("ex:diary-a2", "2026-11-04T13:00:00+00:00", { title: "the evening table's gap" }),
  diaryEnv("ex:diary-b1", "2026-11-05T12:00:00+00:00", { sealed: true }),
  diaryEnv("ex:diary-b2", "2026-11-05T13:00:00+00:00", { title: "landing pages verify existence, not claims" }),
  diaryEnv("ex:diary-c1", "2026-11-08T11:00:00+00:00", { title: "the mirrors held overnight" }),
  diaryEnv("ex:diary-c2", "2026-11-08T12:30:00+00:00", { title: "ask about the new season" }),
]);
const SOURCE = { baseUrl: "http://gw", entity: "castor" };
const day = (iso: string) => bookDate(iso).day;
const dayRows = (html: string) => [...html.matchAll(/<li[^>]*aria-level="1"[^>]*aria-expanded="(true|false)"[^>]*>(.*?)<\/li>/g)].map((m) => ({ open: m[1] === "true", html: m[2] }));
const entryIds = (html: string) => [...html.matchAll(/data-entry="([^"]+)"/g)].map((m) => m[1]);

afterEach(() => vi.restoreAllMocks());

describe("BookReader by day", () => {
  it("every day folded except the newest; a folded day shows its date, count and first words", () => {
    const html = renderToStaticMarkup(<BookReader fold={FOLD} verbatimSource={SOURCE} />);
    expect(html).toContain('role="tree"');
    expect(html).toContain('aria-label="His book, by day"');
    const days = dayRows(html);
    expect(days.map((d) => d.open)).toEqual([false, false, true]);
    expect(days[0].html).toContain(`>${day("2026-11-04T09:00:00+00:00")}<`);
    expect(days[0].html).toContain(">2 entries<");
    expect(days[0].html).toContain('class="book_day_first"');
    expect(days[0].html).toContain("The harbour archive opens at nine");
    // A sealed first entry is named by the act only.
    expect(days[1].html).toContain("a private entry");
    // The open day shows no first-words line; its entries follow.
    expect(days[2].html).not.toContain("book_day_first");
    expect(entryIds(html)).toEqual(["ex:diary-c1", "ex:diary-c2"]);
    expect(html).not.toContain("the evening table");
  });

  it("an entry asked for unfolds its day and is marked, the newest day staying as it is", () => {
    const html = renderToStaticMarkup(<BookReader fold={FOLD} verbatimSource={SOURCE} focus={{ id: "ex:diary-a2", nonce: 1 }} />);
    expect(dayRows(html).map((d) => d.open)).toEqual([true, false, true]);
    expect(entryIds(html)).toEqual(["ex:diary-a1", "ex:diary-a2", "ex:diary-c1", "ex:diary-c2"]);
    const selected = [...html.matchAll(/<li[^>]*aria-selected="true"[^>]*>(.*?)<\/li>/g)].map((m) => m[1]);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toContain('data-entry="ex:diary-a2"');
  });

  it("rendering the Book, folded or focused, reads nothing", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.reject(new Error("no read")));
    renderToStaticMarkup(<BookReader fold={FOLD} verbatimSource={SOURCE} />);
    renderToStaticMarkup(<BookReader fold={FOLD} verbatimSource={SOURCE} focus={{ id: "ex:diary-b2", nonce: 2 }} />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("empty: the sentence, no tree", () => {
    const html = renderToStaticMarkup(<BookReader fold={foldEnvelopes([])} verbatimSource={SOURCE} />);
    expect(html).toContain("Nothing in the book yet");
    expect(html).not.toContain('role="tree"');
  });
});

describe("wiring: the kit's disclosure list; reading stays its own act", () => {
  const src = fs.readFileSync(path.join(__dirname, "book_reader.tsx"), "utf8");

  it("the days are the kit's DisclosureList rows (no bespoke widget)", () => {
    expect(src).toContain('import { DisclosureList, type DisclosureListHandle, type DisclosureSelection } from "@abstractframework/ui-kit";');
    expect(src).toContain("<DisclosureList<BookRowData>");
    expect(src).not.toMatch(/aria-expanded=/);
  });

  it("moving through the list only marks a row; an entry opens on its click or activation", () => {
    expect(src).toContain("onSelect={setSelection}");
    expect(src).toContain("onActivate={(_sel, row) => activate(row as BookRow)}");
    // setOpen(node) only in activate and in an entry's own click.
    expect(src.match(/setOpen\((?:d\.entry\.node|e\.node)\)/g)).toHaveLength(2);
    expect(src).toContain("onClick={(ev) => !fromLink(ev) && can && setOpen(e.node)}");
  });

  it("the focused entry is scrolled into view through the kit's handle, and the choices persist per session", () => {
    expect(src).toContain('listRef.current?.scrollToRow(bookEntryRowKey(focusRow), "center")');
    expect(src).toContain("writeBookDayChoices(bookSessionStore(), choiceScope, choices)");
  });
});
