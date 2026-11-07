/**
 * The live ledger fold (operator report 2026-11-07, nerin's personal time):
 * the ledger froze at its first load while the timeline kept counting, and
 * every tick was announced as "a day of his own begins". The envelope
 * shapes below are the live journal's: recall events carry a turn_id but no
 * run_id; the bindings a tick forms carry both.
 */

import { describe, expect, it } from "vitest";

import { attachLiveFollow, followAfterScroll } from "./ledger_panel";
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
const recall = (seq: number, turn: string, participants: string[] = ["entity:nerin"]) =>
  env(seq, "trace", null, null, { trace_id: `tr${seq}`, need: { cue_text: "…", turn_id: turn, participants }, selected: [], candidates: [] });
const visitRecall = (seq: number, turn: string) => recall(seq, turn, ["person:admin", "entity:nerin"]);
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

  it("a window that starts mid-tick reads own time from the run stamp", () => {
    expect(titles(journal().slice(4))).toEqual(["64 — a day of his own begins —", "64 — tick 1 —", "87 — tick 2 —"]);
  });

  it("the reflection closes the day and the next day opens at its turn 1", () => {
    const reflect = env(585, "binding", OWN, "t-reflect-owntime-20261107T115925", { record_id: "ex:summary-1", source: "remember" }, { kind: "summary", title: "session reflection" });
    // The runtime writes several reflection turns; the day closes once.
    const more = ["t-reflect-interest-0", "t-reflect-interest-1", "t-reflect"].map((t, i) =>
      env(585.5 + i / 10, "binding", OWN, t, { record_id: `ex:interest-${i}`, source: "remember" }, { kind: "interest", title: "interest" }),
    );
    const dream = env(587, "binding", null, null, { record_id: "ex:dream-1", source: "remember" }, { kind: "dream", title: "Dream" });
    const day2 = [
      recall(600, "t-0001"),
      env(640, "binding", "chat-owntime-20261108T060000", "t-0001", { record_id: "ex:episode-640", source: "remember" }, { kind: "episode", title: "exchange: morning" }),
      env(660, "binding", "chat-owntime-20261108T060000", "t-reflect", { record_id: "ex:summary-2", source: "remember" }, { kind: "summary", title: "reflection" }),
    ];
    expect(titles([...journal(), reflect, ...more, dream, ...day2]).slice(3)).toEqual([
      "585 — he closes the day —",
      "600 — a day of his own begins —",
      "600 — tick 1 —",
      "660 — he closes the day —",
    ]);
  });

  it("a visit's turns are not ticks", () => {
    const visit = [
      host(13.0004, "summon", "460c9a9a-visit"),
      visitRecall(14, "t-0001"),
      listed(15, "t-0001"),
      visitRecall(22, "t-0002"),
      env(51, "valence", "460c9a9a-visit", "t-reflect-feel-460c9a9a-0", { kind: "appraisal", sign: 1, magnitude: 2 }),
    ];
    expect(titles(visit)).toEqual([]);
    // ...and a summon after personal time ends it.
    expect(titles([...journal(), host(170, "summon", "visit-run-2"), visitRecall(171, "t-0001")])).toHaveLength(3);
  });

  it("older journals: a summon without a run still ends his own time", () => {
    const reflect = env(1368, "binding", OWN, "t-reflect", { record_id: "ex:summary-1", source: "remember" }, { kind: "summary", title: "reflection" });
    const visit = [host(1370, "summon"), visitRecall(1374, "t-0001"), listed(1375, "t-0001")];
    expect(titles([...journal(), reflect, ...visit]).slice(3)).toEqual(["1368 — he closes the day —"]);
  });

  it("lives with few recalls: a visit's turn-1 events after the close never open a day", () => {
    const reflect = env(1700, "binding", OWN, "t-reflect", { record_id: "ex:summary-1", source: "remember" }, { kind: "summary", title: "reflection" });
    const visit = [listed(1765, "t-0001"), listed(1766, "t-0002"), env(1780, "binding", "chat-chat-20260709-ab12", "t-0001", { record_id: "ex:episode-1780", source: "remember" }, { kind: "episode", title: "exchange: hello" })];
    const day = [listed(1849, "t-0001"), env(1850, "binding", "chat-owntime-20260709T120000", "t-0001", { record_id: "ex:episode-1850", source: "remember" }, { kind: "episode", title: "exchange: alone" })];
    expect(titles([...journal(), reflect, ...visit, ...day]).slice(3)).toEqual([
      "1700 — he closes the day —",
      "1850 — a day of his own begins —",
      "1850 — tick 1 —",
    ]);
  });

  it("after a day that stopped without reflecting, a visit's turn-1 events open nothing", () => {
    const visit = [listed(170, "t-0001"), env(183, "binding", "chat-chat-20260708-cd34", "t-0001", { record_id: "ex:episode-183", source: "remember" }, { kind: "episode", title: "exchange: hi" })];
    expect(titles([...journal(), ...visit])).toHaveLength(3);
  });

  it("a recall with no participants recorded says nothing about who is there", () => {
    const quiet = journal().map((e) => (e.seq === 87 ? recall(87, "t-0002", []) : e));
    expect(titles(quiet)).toContain("87 — tick 2 —");
  });

  it("a day the loop opens after a visit starts at its first solitary recall", () => {
    const visit = [host(170, "summon", "visit-run-2"), visitRecall(171, "t-0001"), env(180, "host", "visit-run-2", null, { kind: "session_closed" })];
    const nextDay = [recall(200, "t-0001"), listed(201, "t-0001"), env(240, "binding", "chat-owntime-20261108T060000", "t-0001", { record_id: "ex:episode-240", source: "remember" }, { kind: "episode", title: "exchange: morning" })];
    expect(titles([...journal(), ...visit, ...nextDay]).slice(3)).toEqual(["200 — a day of his own begins —", "200 — tick 1 —"]);
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
    const midDay = journal().slice(7); // a life that opens at tick 2, where the old fold ended
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

  it("wired to a list: lines landing keep it attached, a scroll up detaches it", () => {
    const { el, scroll } = fakeList();
    const refs = { stick: { current: false }, lastTop: { current: 0 } };
    attachLiveFollow(el, refs, () => {}, FakeObserver);
    expect(el.scrollTop).toBe(el.scrollHeight - el.clientHeight);
    el.scrollHeight += 900; // lines landed; no scroll happened
    scroll(el.scrollTop);
    expect(refs.stick.current).toBe(true);
    scroll(el.scrollTop - 300);
    expect(refs.stick.current).toBe(false);
  });

  it("wired to a list: revealing the tab leaves a reader who scrolled up where they were", () => {
    const { el, scroll } = fakeList();
    const refs = { stick: { current: true }, lastTop: { current: 0 } };
    attachLiveFollow(el, refs, () => {}, FakeObserver);
    scroll(el.scrollTop - 600);
    const kept = el.scrollTop;
    el.scrollHeight += 1000;
    FakeObserver.resize(el);
    expect(el.scrollTop).toBe(kept);
  });

  it("wired to a list: revealing the hidden tab lands on the newest line", () => {
    const { el } = fakeList();
    el.clientHeight = 0; // display:none: scrolling is a no-op
    const refs = { stick: { current: true }, lastTop: { current: 0 } };
    attachLiveFollow(el, refs, () => {}, FakeObserver);
    el.scrollTop = 0;
    el.scrollHeight = 5000;
    el.clientHeight = 800;
    FakeObserver.resize(el);
    expect(el.scrollTop).toBe(4200);
  });
});

/** A scroll container whose scrollTop clamps like a browser's. */
function fakeList() {
  let top = 0;
  const handlers: Array<() => void> = [];
  const el = {
    scrollHeight: 2000,
    clientHeight: 500,
    get scrollTop() {
      return top;
    },
    set scrollTop(v: number) {
      top = Math.max(0, Math.min(v, Math.max(0, this.scrollHeight - this.clientHeight)));
    },
    addEventListener: (_t: string, h: () => void) => handlers.push(h),
    removeEventListener: () => {},
  };
  const scroll = (to: number) => {
    el.scrollTop = to;
    for (const h of handlers) h();
  };
  return { el: el as unknown as HTMLElement, scroll };
}

/** Fires only for observed elements, like the real one. */
class FakeObserver {
  static live: FakeObserver[] = [];
  private targets = new Set<unknown>();
  constructor(private cb: () => void) {
    FakeObserver.live.push(this);
  }
  observe(t: unknown) {
    this.targets.add(t);
  }
  disconnect() {
    this.targets.clear();
  }
  unobserve() {}
  static resize(t: unknown) {
    for (const o of FakeObserver.live) if (o.targets.has(t)) o.cb();
  }
}

describe("ledger times", () => {
  it("rows read as UTC clock times; the numbers live in the hover", async () => {
    const { clockUtc, rowHint, turnLabel } = await import("./ledger_lines");
    expect(clockUtc("2026-11-07T12:05:07.665849+00:00")).toBe("12:05");
    expect(clockUtc("2026-11-07T14:05:07+02:00", true)).toBe("12:05:07");
    expect(clockUtc("")).toBe("");
    expect(turnLabel("t-0003")).toBe("tick 3");
    expect(turnLabel("t-reflect-owntime-20261107T115925")).toBe("reflection");
    expect(rowHint(2178, 2518, "t-0001", "2026-11-07T14:07:12+00:00")).toBe("events #2178–2518 · tick 1 · 14:07:12 UTC");
    expect(rowHint(2647, null, null, "2026-11-07T14:07:12+00:00")).toBe("event #2647 · 14:07:12 UTC");
  });

  it("a tick line says when it started", () => {
    const tick = titles(journal()).length;
    expect(tick).toBe(3);
    const lines = foldLedgerLines(null, journal()).lines.filter((l) => l.line.title === "— tick 2 —");
    expect(lines[0].line.detail).toBe("12:00 UTC");
  });
});
