/**
 * The live ledger fold (operator report 2026-11-07, nerin's personal time):
 * the ledger froze at its first load while the timeline kept counting, and
 * every tick was announced as "a day of his own begins". The envelope
 * shapes below are the live journal's: recall events carry a turn_id but no
 * run_id; the bindings a tick forms carry both.
 */

import { describe, expect, it } from "vitest";

import { followAfterScroll } from "./ledger_panel";
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
/** The recall that opens a turn: its turn rides need.turn_id, not the envelope. */
const recall = (seq: number, turn: string) =>
  env(seq, "trace", null, null, { trace_id: `tr${seq}`, need: { cue_text: "your own time continues", turn_id: turn }, selected: [], candidates: [] });
const host = (seq: number, kind: string, run: string | null = null) => env(seq, "host", run, null, { kind });
const titles = (envs: ReplayEnvelope[]) =>
  foldLedgerLines(null, envs)
    .lines.filter((l) => l.line.family === "boundary")
    .map((l) => `${l.line.seq} ${l.line.title}`);
const episode = (seq: number, turn: string, title: string) =>
  env(seq, "binding", OWN, turn, { record_id: `ex:episode-${seq}`, source: "remember", search_state: "indexed", prompt_state: "inactive" }, { kind: "episode", title });
const diary = (seq: number, turn: string, gist: string) =>
  env(seq, "binding", OWN, turn, { record_id: `ex:diary-${seq}`, source: "remember", search_state: "indexed", prompt_state: "inactive" }, { diary: true, kind: "diary", title: gist, gist });

/** A visit's closing marker, then two ticks of personal time (nerin's shape). */
function journal(): ReplayEnvelope[] {
  return [
    env(51.0001, "host", "460c9a9a-visit", null, { kind: "session_closed", session_id: "visit-nerin-991a6590" }),
    host(51.0004, "personal_started"),
    recall(52, "t-0001"),
    listed(53, "t-0001"),
    diary(64, "t-0001", "Began the promised world-news survey"),
    listed(70, "t-0001"),
    episode(86, "t-0001", "exchange: The BBC's live results page says"),
    recall(87, "t-0002"),
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
    expect(rebuilt.lines.map((l) => l.line.title)).toEqual(foldLedgerLines(null, inserted).lines.map((l) => l.line.title));
  });

  it("a day opens once and each tick is marked at the recall that opens it", () => {
    expect(titles(journal())).toEqual(["52 — a day of his own begins —", "52 — tick 1 —", "87 — tick 2 —"]);
  });

  it("the reflection closes the day and the next day opens at its turn 1", () => {
    const reflect = env(585, "binding", OWN, "t-reflect-owntime-20261107T115925", { record_id: "ex:summary-1", source: "remember" }, { kind: "summary", title: "session reflection" });
    const dream = env(587, "binding", null, null, { record_id: "ex:dream-1", source: "remember" }, { kind: "dream", title: "Dream" });
    const day2 = [recall(600, "t-0001"), env(640, "binding", "chat-owntime-20261108T060000", "t-0001", { record_id: "ex:episode-640", source: "remember" }, { kind: "episode", title: "exchange: morning" })];
    expect(titles([...journal(), reflect, dream, ...day2]).slice(3)).toEqual([
      "585 — he closes the day —",
      "600 — a day of his own begins —",
      "600 — tick 1 —",
    ]);
  });

  it("a visit's turns are not ticks", () => {
    const visit = [
      host(13.0004, "summon", "460c9a9a-visit"),
      recall(14, "t-0001"),
      listed(15, "t-0001"),
      recall(22, "t-0002"),
      env(51, "valence", "460c9a9a-visit", "t-reflect-feel-460c9a9a-0", { kind: "appraisal", sign: 1, magnitude: 2 }),
    ];
    expect(titles(visit)).toEqual([]);
    // ...and a summon after personal time ends it.
    expect(titles([...journal(), host(170, "summon", "visit-run-2"), recall(171, "t-0003")])).toHaveLength(3);
  });

  it("another life with the same seqs is folded from scratch", () => {
    const fold = foldLedgerLines(null, journal());
    const other = journal().map((e) => (e.family === "binding" ? { ...e, display: { kind: "episode", title: "exchange: someone else" } } : e));
    const refolded = foldLedgerLines(fold, other);
    expect(refolded).not.toBe(fold);
    expect(refolded.lines.filter((l) => l.line.detail.includes("someone else"))).toHaveLength(3);
  });

  it("a rebuild starts the day/tick rhythm afresh", () => {
    const fold = foldLedgerLines(null, journal());
    const midDay = journal().slice(2); // a life that opens mid personal time
    expect(foldLedgerLines(fold, midDay).lines.map((l) => l.line.title)).toEqual(foldLedgerLines(null, midDay).lines.map((l) => l.line.title));
  });

  it("boundaries do not depend on how the envelopes arrived", () => {
    const all = journal();
    let fold = foldLedgerLines(null, []);
    for (let i = 1; i <= all.length; i++) fold = foldLedgerLines(fold, all.slice(0, i));
    const titles = (f: typeof fold) => f.lines.map((l) => `${l.index} ${l.line.title}`);
    expect(titles(fold)).toEqual(titles(foldLedgerLines(null, all)));
  });
});

describe("live follow", () => {
  it("lines landing below do not detach it; our own jump down does not either", () => {
    expect(followAfterScroll(true, { gap: 900, top: 400, lastTop: 400 })).toBe(true);
    expect(followAfterScroll(true, { gap: 300, top: 1200, lastTop: 400 })).toBe(true);
  });

  it("only a scroll up detaches it, and reaching the bottom re-attaches it", () => {
    expect(followAfterScroll(true, { gap: 600, top: 300, lastTop: 900 })).toBe(false);
    expect(followAfterScroll(false, { gap: 600, top: 700, lastTop: 300 })).toBe(false);
    expect(followAfterScroll(false, { gap: 40, top: 860, lastTop: 700 })).toBe(true);
  });
});
