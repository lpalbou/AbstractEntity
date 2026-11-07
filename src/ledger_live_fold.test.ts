/**
 * The live ledger fold (operator report 2026-11-07, nerin's personal time):
 * the ledger froze at its first load while the timeline kept counting, and
 * every tick was announced as "a day of his own begins". The envelope
 * shapes below are the live journal's: recall events carry a turn_id but no
 * run_id; the bindings a tick forms carry both.
 */

import { describe, expect, it } from "vitest";

import { foldLedgerLines } from "./ledger_lines";
import type { ReplayEnvelope } from "./stream_types";

const OWN = "chat-owntime-20261107T115925";

function env(seq: number, family: string, run: string | null, turn: string | null, payload: Record<string, unknown>, display: Record<string, unknown> = {}): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family,
    observed_at: "2026-11-07T12:00:00+00:00",
    scope: "life",
    owner_id: "entity:nerin",
    trace_id: null,
    turn_id: turn,
    run_id: run,
    payload,
    display,
  } as ReplayEnvelope;
}

const listed = (seq: number, turn: string) => env(seq, "event", null, turn, { kind: "listed", record_id: `r${seq}` });
const episode = (seq: number, turn: string, title: string) =>
  env(seq, "binding", OWN, turn, { record_id: `ex:episode-${seq}`, source: "remember", search_state: "indexed", prompt_state: "inactive" }, { kind: "episode", title });
const diary = (seq: number, turn: string, gist: string) =>
  env(seq, "binding", OWN, turn, { record_id: `ex:diary-${seq}`, source: "remember", search_state: "indexed", prompt_state: "inactive" }, { diary: true, kind: "diary", title: gist, gist });

/** A visit's closing marker, then two ticks of personal time. */
function journal(): ReplayEnvelope[] {
  return [
    env(51.0001, "host", "460c9a9a-visit", null, { kind: "session_closed", session_id: "visit-nerin-991a6590" }),
    listed(53, "t-0001"),
    diary(64, "t-0001", "Began the promised world-news survey"),
    listed(70, "t-0001"),
    episode(86, "t-0001", "exchange: The BBC's live results page says"),
    listed(100, "t-0002"),
    episode(160, "t-0002", "exchange: The next layer of the picture is clearer"),
  ];
}

describe("live ledger fold", () => {
  it("a landed envelope yields a NEW lines array that carries its line", () => {
    const all = journal();
    const first = foldLedgerLines(null, all.slice(0, 4));
    const next = foldLedgerLines(first, all);
    expect(next.lines).not.toBe(first.lines);
    expect(next.lines.map((l) => l.line.title)).toContain("💬 He lived a moment");
    // The earlier array is untouched: memos keyed on it stay coherent.
    expect(first.lines.some((l) => l.line.seq === 160)).toBe(false);
  });

  it("an unchanged input returns the same fold", () => {
    const all = journal();
    const fold = foldLedgerLines(null, all);
    expect(foldLedgerLines(fold, all)).toBe(fold);
  });

  it("a mid-array insert rebuilds with correct envelope indices", () => {
    const all = journal();
    const fold = foldLedgerLines(null, all);
    const marker = env(64.0001, "host", null, null, { kind: "diary_read", entry_id: "diary_x", reason: "operator review (detail)" });
    const inserted = [...all.slice(0, 3), marker, ...all.slice(3)];
    const rebuilt = foldLedgerLines(fold, inserted);
    for (const { line, index } of rebuilt.lines) expect(inserted[index].seq).toBe(line.seq);
    expect(rebuilt.lines.filter((l) => l.line.seq === 64.0001)).toHaveLength(1);
  });

  it("one day boundary per own-time run and one tick boundary per turn", () => {
    const boundaries = foldLedgerLines(null, journal())
      .lines.filter((l) => l.line.family === "boundary")
      .map((l) => `${l.line.seq} ${l.line.title}`);
    expect(boundaries).toEqual(["64 — a day of his own begins —", "64 — tick 1 —", "160 — tick 2 —"]);
  });

  it("boundaries do not depend on how the envelopes arrived", () => {
    const all = journal();
    let fold = foldLedgerLines(null, []);
    for (let i = 1; i <= all.length; i++) fold = foldLedgerLines(fold, all.slice(0, i));
    const titles = (f: typeof fold) => f.lines.map((l) => `${l.index} ${l.line.title}`);
    expect(titles(fold)).toEqual(titles(foldLedgerLines(null, all)));
  });
});
