/**
 * A record with no served title (operator 2026-11-09, review S2): "title being written…" only when
 * the stream says so (`display.pending.title`), else the raw kind and date — never its id, never a
 * title the app makes. One rule for the hover card, the lit-line tooltip and the ledger.
 */
import { describe, expect, it } from "vitest";

import { ledgerLine } from "./ledger_lines";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { displaySaysTitlePending, TITLE_BEING_WRITTEN, untitledWords } from "./untitled";

function formed(seq: number, id: string, kind: string, display: Record<string, unknown>): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "binding",
    observed_at: "2026-11-09T21:40:12+00:00",
    scope: "life",
    owner_id: "entity:castor",
    trace_id: null,
    turn_id: "t-0003",
    run_id: "visit-castor-1",
    payload: { record_id: id, source: "remember", search_state: "indexed", prompt_state: "inactive" },
    display: { record_id: id, kind, ...display } as ReplayEnvelope["display"],
  } as unknown as ReplayEnvelope;
}

const PENDING = { title: true, summary: true, since: "2026-11-09T21:40:12+00:00", attempts: 0 };

describe("untitledWords", () => {
  it("being written only when the stream says so; else kind · date", () => {
    expect(untitledWords("episode", "2026-11-09T21:40:12+00:00", true)).toBe(TITLE_BEING_WRITTEN);
    expect(untitledWords("episode", "2026-11-09T21:40:12+00:00", false)).toBe("episode · 2026-11-09 21:40");
    expect(untitledWords("", "", false)).toBe("memory");
    expect(displaySaysTitlePending({ pending: PENDING })).toBe(true);
    expect(displaySaysTitlePending({ pending: { title: false, summary: true } })).toBe(false);
    expect(displaySaysTitlePending({ pending: { title: "yes" } })).toBe(false);
    expect(displaySaysTitlePending({ pending: null })).toBe(false);
    expect(displaySaysTitlePending({})).toBe(false);
    expect(displaySaysTitlePending(null)).toBe(false);
  });
});

describe("the ledger's formation line for an untitled record", () => {
  it("says 'title being written…' when the stream says so, never the record id", () => {
    const line = ledgerLine(formed(7, "ex:episode-7", "episode", { title: null, pending: PENDING }));
    expect(line.title).toBe("💬 He lived a moment");
    expect(line.detail).toBe(TITLE_BEING_WRITTEN);
  });

  it("says its raw kind and date when the stream says nothing (authoring gave up, or an older gateway)", () => {
    for (const display of [{ title: "" }, { title: null }, { title: null, pending: null }, { title: null, pending: { title: false, summary: true } }]) {
      const line = ledgerLine(formed(7, "ex:episode-7", "episode", display));
      expect(line.detail).toBe("episode · 2026-11-09 21:40");
      expect(line.detail).not.toContain("ex:episode-7");
      expect(line.detail).not.toBe(TITLE_BEING_WRITTEN);
    }
    expect(ledgerLine(formed(8, "ex:summary-8", "summary", { title: "" })).detail).toBe("summary · 2026-11-09 21:40");
  });

  it("a titled record keeps its own title", () => {
    expect(ledgerLine(formed(9, "ex:episode-9", "episode", { title: "exchange: the first durable visit", pending: null })).detail).toBe("the first durable visit");
  });
});

describe("the fold carries the served pending onto the memory", () => {
  it("set by a block that says so, ended by a title or by a block that says it is no longer pending", () => {
    expect(foldEnvelopes([formed(7, "ex:episode-7", "episode", { title: null, pending: PENDING })]).nodes.get("ex:episode-7")!.title_pending).toBe(true);
    expect(foldEnvelopes([formed(7, "ex:episode-7", "episode", { title: "" })]).nodes.get("ex:episode-7")!.title_pending).not.toBe(true);
    const later = foldEnvelopes([formed(7, "ex:episode-7", "episode", { title: null, pending: PENDING }), formed(9, "ex:episode-7", "episode", { title: "His words" })]).nodes.get("ex:episode-7")!;
    expect(later.title).toBe("His words");
    expect(later.title_pending).toBe(false);
    const cleared = foldEnvelopes([formed(7, "ex:episode-7", "episode", { title: null, pending: PENDING }), formed(9, "ex:episode-7", "episode", { title: null, pending: null })]).nodes.get("ex:episode-7")!;
    expect(cleared.title_pending).toBe(false);
  });
});
