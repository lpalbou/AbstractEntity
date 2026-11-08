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
    // ...and their lines know they are a visit's (the hover says "turn", not "tick").
    expect(foldLedgerLines(null, visit).lines.every((l) => l.own === false)).toBe(true);
    expect(foldLedgerLines(null, journal()).lines.filter((l) => l.line.seq === 86)[0].own).toBe(true);
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
    expect(followAfterScroll(true, { gap: 900, top: 400, lastTop: 400, userUp: false })).toBe(true);
    expect(followAfterScroll(true, { gap: 300, top: 1200, lastTop: 400, userUp: false })).toBe(true);
  });

  it("only the reader's scroll up detaches it, and reaching the bottom re-attaches it", () => {
    expect(followAfterScroll(true, { gap: 600, top: 300, lastTop: 900, userUp: true })).toBe(false);
    // the list shrank above the reader (a weave collapsed, the window slid): not theirs
    expect(followAfterScroll(true, { gap: 600, top: 300, lastTop: 900, userUp: false })).toBe(true);
    expect(followAfterScroll(false, { gap: 600, top: 700, lastTop: 300, userUp: false })).toBe(false);
    expect(followAfterScroll(false, { gap: 40, top: 860, lastTop: 700, userUp: false })).toBe(true);
  });

  it("wired to a list: lines landing keep it attached, a wheel up detaches it", () => {
    const { el, scroll, wheelUp } = fakeList();
    const refs = { stick: { current: false }, lastTop: { current: 0 } };
    attachLiveFollow(el, refs, () => {}, FakeObserver);
    expect(el.scrollTop).toBe(el.scrollHeight - el.clientHeight);
    el.scrollHeight += 900; // lines landed; no scroll happened
    scroll(el.scrollTop);
    expect(refs.stick.current).toBe(true);
    wheelUp(300);
    expect(refs.stick.current).toBe(false);
  });

  it("wired to a list: the list collapsing above a reader at the bottom keeps the follow and stays at the bottom (operator 2026-11-08)", () => {
    const { el, shrinkAbove } = fakeList();
    const refs = { stick: { current: true }, lastTop: { current: 0 } };
    attachLiveFollow(el, refs, () => {}, FakeObserver);
    shrinkAbove(700); // 4 recall lines became one weave row
    expect(refs.stick.current).toBe(true);
    expect(el.scrollTop).toBe(el.scrollHeight - el.clientHeight);
  });

  it("wired to a list: a gesture only counts within its window; keys and the scrollbar count, a wheel down does not", () => {
    let t = 1000;
    const mk = () => {
      const f = fakeList();
      const refs = { stick: { current: true }, lastTop: { current: 0 } };
      attachLiveFollow(f.el, refs, () => {}, FakeObserver, null, () => t);
      return { ...f, refs };
    };
    // wheel up long ago, then a clamp: not theirs
    const a = mk();
    a.gesture("wheel", { deltaY: -100 });
    t += 2000;
    a.scroll(a.el.scrollTop - 200);
    expect(a.refs.stick.current).toBe(true);
    // ArrowUp then scroll up: theirs
    const b = mk();
    b.gesture("keydown", { key: "ArrowUp" });
    b.scroll(b.el.scrollTop - 200);
    expect(b.refs.stick.current).toBe(false);
    // ArrowDown then a clamp up: not theirs
    const c = mk();
    c.gesture("keydown", { key: "ArrowDown" });
    c.scroll(c.el.scrollTop - 200);
    expect(c.refs.stick.current).toBe(true);
    // scrollbar press (right of the client box) then scroll up: theirs
    const d = mk();
    d.gesture("mousedown", { offsetX: 405 });
    d.scroll(d.el.scrollTop - 200);
    expect(d.refs.stick.current).toBe(false);
    // a macOS overlay scrollbar sits INSIDE the client box: a press on the right-edge strip counts
    const d2 = mk();
    d2.gesture("mousedown", { offsetX: 390 });
    d2.scroll(d2.el.scrollTop - 200);
    expect(d2.refs.stick.current).toBe(false);
    // a press in the body of the list is not a scrollbar press
    const d3 = mk();
    d3.gesture("mousedown", { offsetX: 200 });
    d3.scroll(d3.el.scrollTop - 200);
    expect(d3.refs.stick.current).toBe(true);
    // Shift+Space pages up; plain Space pages down
    const k1 = mk();
    k1.gesture("keydown", { key: " ", shiftKey: true });
    k1.scroll(k1.el.scrollTop - 200);
    expect(k1.refs.stick.current).toBe(false);
    const k2 = mk();
    k2.gesture("keydown", { key: " ", shiftKey: false });
    k2.scroll(k2.el.scrollTop - 200);
    expect(k2.refs.stick.current).toBe(true);
    // a finger dragging down (content up): theirs
    const e = mk();
    e.gesture("touchstart", { touches: [{ clientY: 100 }] });
    e.gesture("touchmove", { touches: [{ clientY: 160 }] });
    e.scroll(e.el.scrollTop - 200);
    expect(e.refs.stick.current).toBe(false);
  });

  it("wired to a list: revealing the tab leaves a reader who scrolled up where they were", () => {
    const { el, wheelUp } = fakeList();
    const refs = { stick: { current: true }, lastTop: { current: 0 } };
    attachLiveFollow(el, refs, () => {}, FakeObserver);
    wheelUp(600);
    const kept = el.scrollTop;
    el.scrollHeight += 1000;
    FakeObserver.resize(el);
    expect(el.scrollTop).toBe(kept);
  });

  it("wired to a list: content growing after a landing (Markdown rendering, a line growing in place) keeps the bottom in view", () => {
    const { el } = fakeList();
    const content = {} as Element;
    const refs = { stick: { current: true }, lastTop: { current: 0 } };
    attachLiveFollow(el, refs, () => {}, FakeObserver, content);
    el.scrollHeight += 700; // rows rendered their words a beat after the count moved
    FakeObserver.resize(content);
    expect(el.scrollTop).toBe(el.scrollHeight - el.clientHeight);
  });

  it("wired to a list: content growing does not move a reader who scrolled up", () => {
    const { el, wheelUp } = fakeList();
    const content = {} as Element;
    const refs = { stick: { current: true }, lastTop: { current: 0 } };
    attachLiveFollow(el, refs, () => {}, FakeObserver, content);
    wheelUp(400);
    const kept = el.scrollTop;
    el.scrollHeight += 700;
    FakeObserver.resize(content);
    expect(el.scrollTop).toBe(kept);
  });

  it("the end of the catch-up stream is a baseline, never a landing; only later lines flash", async () => {
    const { landingStep } = await import("./ledger_panel");
    // streaming in: no baseline, nothing flashes
    expect(landingStep(null, 30, true)).toEqual({ settled: null, flashAfter: null });
    expect(landingStep(null, 600, true)).toEqual({ settled: null, flashAfter: null });
    // the commit that clears loading: baseline only
    expect(landingStep(null, 600, false)).toEqual({ settled: 600, flashAfter: null });
    // a live landing after that: flash the lines past 600
    expect(landingStep(600, 603, false)).toEqual({ settled: 603, flashAfter: 600 });
    // nothing new: no flash
    expect(landingStep(603, 603, false)).toEqual({ settled: 603, flashAfter: null });
    // loading again (a catch-up fetch): the baseline resets, nothing flashes until it clears
    expect(landingStep(603, 650, true)).toEqual({ settled: null, flashAfter: null });
    expect(landingStep(null, 650, false)).toEqual({ settled: 650, flashAfter: null });
  });

  it("only the lines past the newest seen index count as landed, oldest first", async () => {
    const { landedIndices } = await import("./ledger_panel");
    const lines = [{ index: 3 }, { index: 7 }, { index: 9 }, { index: 12 }];
    expect(landedIndices(lines, 7)).toEqual([9, 12]);
    expect(landedIndices(lines, 12)).toEqual([]);
    expect(landedIndices([], 0)).toEqual([]);
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

/** A scroll container whose scrollTop clamps like a browser's. `scroll(to)`
 * moves it and fires the scroll event; `gesture(type, ev)` fires a reader's
 * input event; `shrinkAbove(px)` is the list collapsing above the reader
 * (the browser clamps scrollTop and fires scroll, no gesture). */
function fakeList() {
  let top = 0;
  const handlers = new Map<string, Array<(e?: unknown) => void>>();
  const fire = (type: string, e?: unknown) => (handlers.get(type) ?? []).forEach((h) => h(e));
  const el = {
    scrollHeight: 2000,
    clientHeight: 500,
    clientWidth: 400,
    get scrollTop() {
      return top;
    },
    set scrollTop(v: number) {
      top = Math.max(0, Math.min(v, Math.max(0, this.scrollHeight - this.clientHeight)));
    },
    addEventListener: (t: string, h: (e?: unknown) => void) => handlers.set(t, [...(handlers.get(t) ?? []), h]),
    removeEventListener: () => {},
  };
  const scroll = (to: number) => {
    el.scrollTop = to;
    fire("scroll");
  };
  const gesture = (type: string, e: unknown) => fire(type, e);
  const shrinkAbove = (px: number) => {
    el.scrollHeight -= px;
    el.scrollTop = top; // clamps
    fire("scroll");
  };
  // a reader scrolling up: wheel, then the scroll it causes
  const wheelUp = (by: number) => {
    gesture("wheel", { deltaY: -120 });
    scroll(el.scrollTop - by);
  };
  return { el: el as unknown as HTMLElement, scroll, gesture, shrinkAbove, wheelUp };
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
    const { clockUtc, dayLabelUtc, dayUtc, rowHint, turnLabel } = await import("./ledger_lines");
    expect(dayUtc("2026-11-07T23:59:59-02:00")).toBe("2026-11-08");
    expect(dayLabelUtc("2026-07-24T17:01:24+00:00")).toBe("Fri 24 Jul 2026");
    expect(clockUtc("2026-11-07T12:05:07.665849+00:00")).toBe("12:05");
    expect(clockUtc("2026-11-07T14:05:07+02:00", true)).toBe("12:05:07");
    expect(clockUtc("")).toBe("");
    expect(clockUtc("2026-11-07T12:05:07")).toBe("12:05"); // no zone: UTC, never local time
    expect(clockUtc("2026-11-07 12:05:07+00:00")).toBe("12:05"); // space-separated form
    expect(clockUtc("2026-11-07")).toBe("");
    expect(clockUtc("12")).toBe("");
    expect(turnLabel("t-0003")).toBe("tick 3");
    expect(turnLabel("t-0003", false)).toBe("turn 3");
    expect(turnLabel("t-reflect-owntime-20261107T115925")).toBe("reflection");
    expect(rowHint(2178, 2518, "t-0001", "2026-11-07T14:07:12+00:00")).toBe("Sat 7 Nov 2026, 14:07:12 UTC · tick 1 · events #2178–2518");
    expect(rowHint(15, null, "t-0001", "2026-11-07T11:53:38+00:00", false)).toBe("Sat 7 Nov 2026, 11:53:38 UTC · turn 1 · event #15");
    expect(rowHint(2647, null, null, "2026-11-07T14:07:12+00:00")).toBe("Sat 7 Nov 2026, 14:07:12 UTC · event #2647");
  });

  it("a tick line says when it started", () => {
    const tick = titles(journal()).length;
    expect(tick).toBe(3);
    const lines = foldLedgerLines(null, journal()).lines.filter((l) => l.line.title === "— tick 2 —");
    expect(lines[0].line.detail).toBe("12:00 UTC");
  });
});
