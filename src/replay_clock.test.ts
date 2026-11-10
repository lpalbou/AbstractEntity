/** Replay speed and the playback clock (operator 2026-11-07: "50x is not
 * enough … optimize also the way this would be replayed after 200x"). */

import { describe, expect, it } from "vitest";

import {
  advanceClock,
  BASE_EPS,
  commitDue,
  createPlayhead,
  HIGH_SPEED_COMMIT_MS,
  markCommit,
  MAX_FRAME_MS,
  minCommitGapMs,
  observeFrame,
  playFrame,
  SETTLE_FRAMES,
  SPEEDS,
  startClock,
  startPacer,
  startPlay,
  type CommitPacer,
} from "./replay_clock";

const FRAME = 1000 / 60;

/** A pacer that has seen `frames` quiet 60 Hz frames ending at `end`. */
function quietPacer(frames: number, end = frames * FRAME): CommitPacer {
  let p = startPacer();
  for (let i = 0; i <= frames; i++) p = observeFrame(p, end - (frames - i) * FRAME);
  return p;
}

/**
 * Drive playFrame the way requestAnimationFrame does, against a page whose
 * commit costs `costMs` of main thread. The cost lands `lag` frames after
 * the commit is asked for (React renders after the frame; the fold index
 * used to land one render later) and holds that frame back by the cost.
 * `frame` is the page's steady frame (the graph canvas draws every frame:
 * a big graph or a busy machine takes two display frames or more), from
 * `slowFrom` ms on (before it, `fastFrame`: a 120 Hz display while the
 * graph is still small).
 */
function simulate(opts: { speed: number; costMs: number; seconds: number; lag?: number; start?: number; maxIndex?: number; frame?: number; fastFrame?: number; slowFrom?: number }) {
  const { speed, costMs, seconds, lag = 1, start = 0, maxIndex = 10_000_000, frame = FRAME, fastFrame = frame, slowFrom = 0 } = opts;
  let t = 0;
  let state = startPlay(start, t);
  const commits: Array<{ at: number; index: number }> = [];
  const pendingCost: number[] = [];
  let busy = 0;
  let frames = 0;
  let head = start;
  while (t < seconds * 1000) {
    const owed = pendingCost.shift() ?? 0;
    busy += owed;
    t += (t < slowFrom ? fastFrame : frame) + owed;
    const f = playFrame(state, t, speed, maxIndex);
    frames++;
    state = f.state;
    head = f.head;
    if (f.commit !== null) {
      commits.push({ at: t, index: f.commit });
      while (pendingCost.length < lag) pendingCost.push(0);
      pendingCost[lag - 1] += costMs;
    }
    if (f.done) break;
  }
  return { commits, busyShare: busy / t, frames, head, elapsed: t };
}

describe("speeds", () => {
  it("offers 1x to 1000x, in order", () => {
    expect(SPEEDS).toEqual([1, 2, 5, 10, 25, 50, 100, 200, 500, 1000]);
  });
});

describe("the head advances by elapsed time × speed", () => {
  it("one second at 1000x is 2,500 events, at 1x 2.5", () => {
    expect(advanceClock(startClock(10, 0), 1000, BASE_EPS * 1000, 1e9).pos).toBe(2510);
    expect(advanceClock(startClock(10, 0), 1000, BASE_EPS * 1, 1e9).pos).toBe(12.5);
  });

  it("frame by frame adds up to the same rate", () => {
    let c = startClock(0, 0);
    for (let i = 1; i <= 60; i++) c = advanceClock(c, i * FRAME, BASE_EPS * 200, 1e9);
    expect(c.pos).toBeCloseTo(500, 6);
  });

  it("stops at the last envelope", () => {
    expect(advanceClock(startClock(90, 0), 1000, 2500, 99).pos).toBe(99);
  });

  it("a long gap (a hidden tab) advances at most one second, time going back advances nothing", () => {
    expect(advanceClock(startClock(0, 0), 60_000, BASE_EPS, 1e9).pos).toBe((MAX_FRAME_MS / 1000) * BASE_EPS);
    expect(advanceClock(startClock(5, 100), 50, 2500, 1e9).pos).toBe(5);
  });
});

describe("the page follows at a paced rate", () => {
  it("quiet frames are not busy; a held frame is busy by its excess", () => {
    const quiet = quietPacer(30);
    expect(quiet.busyMs).toBe(0);
    expect(quiet.frameMs).toBeCloseTo(FRAME, 6);
    const held = observeFrame(quiet, quiet.lastFrameAt! + 50);
    expect(held.busyMs).toBeCloseTo(50 - FRAME, 6);
  });

  it("learns a faster display's cadence", () => {
    let p = startPacer();
    for (let i = 0; i <= 20; i++) p = observeFrame(p, i * (1000 / 120));
    expect(p.frameMs).toBeCloseTo(1000 / 120, 1);
    expect(p.busyMs).toBe(0);
  });

  it("the first commit is immediate and learns nothing; later ones learn the busy time", () => {
    let p = quietPacer(10);
    p = { ...p, busyMs: 500 }; // whatever happened before play
    expect(commitDue(p, p.lastFrameAt!, 50)).toBe(true);
    p = markCommit(p, 0);
    expect(p.costMs).toBe(0);
    expect(p.busyMs).toBe(0);
    p = markCommit({ ...p, busyMs: 80 }, 200);
    expect(p.costMs).toBeGreaterThan(0);
    expect(p.costMs).toBeLessThan(80);
  });

  it("waits twice the commit cost, and from 200x at least 100 ms", () => {
    const p: CommitPacer = { ...startPacer(), lastCommitAt: 1000, costMs: 80 };
    expect(minCommitGapMs(p, 50)).toBe(160);
    expect(commitDue(p, 1100, 50)).toBe(false);
    expect(commitDue(p, 1160, 50)).toBe(true);
    const cheap: CommitPacer = { ...startPacer(), lastCommitAt: 1000 };
    expect(commitDue(cheap, 1000 + FRAME, 100)).toBe(true);
    expect(commitDue(cheap, 1000 + FRAME, 200)).toBe(false);
    expect(commitDue(cheap, 1000 + HIGH_SPEED_COMMIT_MS, 200)).toBe(true);
  });

  it("work still landing since the last commit holds the next one back", () => {
    const p: CommitPacer = { ...startPacer(), lastCommitAt: 1000, costMs: 10, busyMs: 120 };
    expect(commitDue(p, 1200, 50)).toBe(false);
    expect(commitDue(p, 1240, 50)).toBe(true);
  });
});

describe("one playback frame", () => {
  it("at 1x with a cheap page, every event is shown in turn", () => {
    const { commits } = simulate({ speed: 1, costMs: 0, seconds: 10, start: 100 });
    expect(commits.length).toBe(25);
    commits.forEach((c, i) => expect(c.index).toBe(101 + i));
  });

  it.each([50, 200, 1000])("at %ix the head keeps the rate while an 80 ms page takes at most about half the main thread", (speed) => {
    const sim = simulate({ speed, costMs: 80, seconds: 10 });
    const rate = sim.head / (sim.elapsed / 1000);
    expect(rate).toBeGreaterThan(BASE_EPS * speed * 0.98);
    expect(rate).toBeLessThan(BASE_EPS * speed * 1.02);
    expect(sim.busyShare).toBeLessThan(0.55);
    // the frames in between stay quiet: the time panel moves at frame rate
    expect(sim.frames / (sim.elapsed / 1000)).toBeGreaterThan(25);
  });

  it("the pacing holds when the cost lands frames after the commit (the page renders after the frame)", () => {
    const sim = simulate({ speed: 200, costMs: 120, seconds: 10, lag: 3 });
    expect(sim.busyShare).toBeLessThan(0.55);
  });

  // THE FREEZE (operator 2026-11-10, 297 moments at 100x: "it starts
  // playing and freezes … pushing pause will update the graph"): frames
  // that take two display frames whether or not a commit lands in them
  // were counted as the last commit's cost and never let the next one be
  // due. The page must keep following the head.
  it.each([
    ["every frame draws a big graph (two 60 Hz frames each)", { frame: 2 * FRAME }],
    ["a busy machine (three 60 Hz frames each)", { frame: 3 * FRAME }],
    ["a 120 Hz display that drops to 60 Hz once the graph grows", { fastFrame: 1000 / 120, frame: FRAME, slowFrom: 1500 }],
  ])("at 100x the page keeps following the head when %s", (_label, shape) => {
    const sim = simulate({ speed: 100, costMs: 80, seconds: 10, lag: 2, ...shape });
    const late = sim.commits.filter((c) => c.at > 2000);
    expect(late.length).toBeGreaterThan(10);
    let longest = 0;
    for (let i = 1; i < sim.commits.length; i++) longest = Math.max(longest, sim.commits[i].at - sim.commits[i - 1].at);
    expect(longest).toBeLessThan(600);
    const last = sim.commits[sim.commits.length - 1];
    expect(sim.elapsed - last.at).toBeLessThan(600);
    expect(sim.head - last.index).toBeLessThan(BASE_EPS * 100 * 0.6);
    // still paced: rendering takes about half the main thread at most
    expect(sim.busyShare).toBeLessThan(0.55);
  });

  it("at 1x on a page whose frames take two display frames, every event is still shown in turn", () => {
    const sim = simulate({ speed: 1, costMs: 30, seconds: 10, frame: 2 * FRAME, start: 100 });
    expect(sim.commits.length).toBe(25);
    sim.commits.forEach((c, i) => expect(c.index).toBe(101 + i));
  });

  it("at 5x on a page whose frames take two display frames, the page stays within a few events of the head", () => {
    const sim = simulate({ speed: 5, costMs: 30, seconds: 10, frame: 2 * FRAME, start: 100 });
    expect(sim.commits.length).toBeGreaterThan(60);
    for (let i = 1; i < sim.commits.length; i++) expect(sim.commits[i].index - sim.commits[i - 1].index).toBeLessThanOrEqual(3);
    expect(sim.head - sim.commits[sim.commits.length - 1].index).toBeLessThanOrEqual(3);
  });

  it("a steady frame is learned only from frames no commit can be landing in", () => {
    let p = quietPacer(30);
    p = markCommit(p, p.lastFrameAt!);
    let at = p.lastFrameAt!;
    for (let i = 0; i < SETTLE_FRAMES; i++) p = observeFrame(p, (at += 120));
    expect(p.frameMs).toBeCloseTo(FRAME, 6);
    expect(p.busyMs).toBeCloseTo(SETTLE_FRAMES * (120 - FRAME), 6);
    // past them, a long frame moves it at most to twice itself
    const next = observeFrame(p, at + 500);
    expect(next.frameMs).toBeLessThanOrEqual(FRAME + 0.3 * FRAME + 1e-9);
  });

  it("coming back to a hidden tab holds the page back two seconds at most, not twice the time away", () => {
    let s = startPlay(0, 0);
    for (let i = 1; i <= 30; i++) s = playFrame(s, i * FRAME, 100, 1e9).state;
    const back = 30 * FRAME + 120_000; // two minutes hidden
    let at = back;
    let f = playFrame(s, at, 100, 1e9);
    s = f.state;
    let committedAt: number | null = f.commit !== null ? at : null;
    while (committedAt === null && at < back + 10_000) {
      at += FRAME;
      f = playFrame(s, at, 100, 1e9);
      s = f.state;
      if (f.commit !== null) committedAt = at;
    }
    expect(committedAt).not.toBeNull();
    expect(committedAt! - back).toBeLessThanOrEqual(2 * MAX_FRAME_MS + FRAME);
  });

  it("from 200x a cheap page still follows at most 10 times a second", () => {
    const sim = simulate({ speed: 500, costMs: 0, seconds: 5 });
    for (let i = 1; i < sim.commits.length; i++) {
      expect(sim.commits[i].at - sim.commits[i - 1].at).toBeGreaterThanOrEqual(HIGH_SPEED_COMMIT_MS - 1e-9);
    }
    expect(sim.commits.length).toBeGreaterThan(40);
  });

  it("reaching the last envelope commits it and ends playback", () => {
    const sim = simulate({ speed: 1000, costMs: 30, seconds: 60, start: 0, maxIndex: 3000 });
    const last = sim.commits[sim.commits.length - 1];
    expect(last.index).toBe(3000);
    expect(sim.head).toBe(3000);
    expect(sim.elapsed).toBeLessThan(1400); // 3,000 events at 2,500/s, not the full minute
  });

  it("playing at the end, or an empty life, ends on the first frame", () => {
    const atEnd = playFrame(startPlay(40, 0), FRAME, 5, 40);
    expect(atEnd).toMatchObject({ done: true, commit: 40, head: 40 });
    const empty = playFrame(startPlay(-1, 0), FRAME, 5, -1);
    expect(empty).toMatchObject({ done: true, commit: -1, head: -1 });
  });

  it("no commit while the head has not reached a new envelope", () => {
    const f = playFrame(startPlay(7, 0), 100, 1, 1000); // 0.25 events in
    expect(f).toMatchObject({ head: 7, commit: null, done: false });
  });
});

describe("the play head store", () => {
  it("notifies on change only, and stops after unsubscribe", () => {
    const h = createPlayhead();
    let heard = 0;
    const off = h.subscribe(() => heard++);
    expect(h.get()).toBeNull();
    h.set(3);
    h.set(3);
    h.set(4);
    expect(h.get()).toBe(4);
    expect(heard).toBe(2);
    off();
    h.set(null);
    expect(heard).toBe(2);
    expect(h.get()).toBeNull();
  });
});
