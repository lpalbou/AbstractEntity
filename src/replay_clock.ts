/**
 * Replay playback clock (operator 2026-11-07: "50x is not enough, we should
 * have 100x, 200x, 500x and 1000x. optimize also the way this would be
 * replayed after 200x").
 *
 * What the old loop did, measured on nerin's life (54k events, dev server):
 * it already advanced by elapsed time, so the RATE held at every speed, but
 * it committed the position to React on every animation frame, and each
 * commit re-rendered the whole page twice (the position, then the fold
 * index) — ledger rows, Book, Health, Detail, the fold's memos. From 50x up
 * the page ran at 14-17 fps with three quarters of the main thread blocked
 * (1600 and 400 px alike), and a click on pause waited behind the next
 * commit.
 *
 * Now there are two clocks:
 * - the HEAD advances every animation frame by elapsed time × speed
 *   (`advanceClock`) and only the time panel follows it frame by frame
 *   (`createPlayhead`, a tiny store the panel subscribes to);
 * - the PAGE (fold, graph, ledger, Detail, side panels) is committed at a
 *   paced rate (`commitDue`): never sooner than twice the main-thread time
 *   the last commits took, so rendering keeps to about half of the main
 *   thread at any speed; from 200x it also follows at most 10 times a
 *   second (2,500 events a second cannot be read row by row, and batching
 *   them costs the fold nothing — it is incremental).
 *
 * What a commit costs is measured against the page's OWN steady frame,
 * not the display's (operator 2026-11-10, 297 moments at 100x: "it starts
 * playing and freezes … pushing pause will update the graph"). The graph
 * canvas draws every frame, so on a big graph, a 120 Hz display or a busy
 * machine a frame between commits takes two display frames or more. The
 * pacer used to count every frame held past one and a half display frames
 * as the last commit's cost, and that sum only reset on the next commit: it
 * grew by half the elapsed time or more, `commitDue` (elapsed ≥ twice the
 * busy time) was never true again, and the head ran on while the page
 * stayed where it was until a pause committed it. Now the pacer learns the
 * steady frame from the frames no commit can be landing in, and only the
 * excess over it is a commit's cost: frames that cost the same with or
 * without a commit add nothing, so the wait is bounded.
 *
 * `playFrame` is the whole per-frame decision; entity_view.tsx only wires
 * it to requestAnimationFrame and React state. Everything here is pure
 * except the store.
 */

/** The speeds the time panel offers. */
export const SPEEDS: readonly number[] = [1, 2, 5, 10, 25, 50, 100, 200, 500, 1000];

/** Playback baseline: envelopes per second at 1x. */
export const BASE_EPS = 2.5;

/** One frame never advances more than this much time: a hidden tab gets no
 * animation frames, and coming back must not jump through the life. */
export const MAX_FRAME_MS = 1000;

/** From this speed the page follows the head at a capped rate. */
export const HIGH_SPEED = 200;

/** The cap from HIGH_SPEED on: at most one page update per this many ms. */
export const HIGH_SPEED_COMMIT_MS = 100;

/** Rendering may take at most 1 / COMMIT_DUTY of the time between commits. */
export const COMMIT_DUTY = 2;

export interface PlayClock {
  /** Fractional envelope position (the integer part is the index). */
  pos: number;
  /** Timestamp of the last frame (rAF time, ms). */
  at: number;
}

export function startClock(index: number, now: number): PlayClock {
  return { pos: index, at: now };
}

/** The head after one frame: elapsed × events per second, clamped to the
 * last envelope. A frame that comes back in time advances nothing. */
export function advanceClock(clock: PlayClock, now: number, eventsPerSecond: number, maxIndex: number): PlayClock {
  const elapsed = Math.min(MAX_FRAME_MS, Math.max(0, now - clock.at));
  return { pos: Math.min(maxIndex, clock.pos + (elapsed / 1000) * eventsPerSecond), at: now };
}

/** The envelope index the head is on. */
export function headIndex(clock: PlayClock): number {
  return Math.floor(clock.pos);
}

export interface CommitPacer {
  /** When the page was last committed (ms). */
  lastCommitAt: number;
  /** Main-thread time one page commit takes, learned (EWMA, ms). */
  costMs: number;
  /** Main-thread time taken since the last commit beyond the page's steady
   * frame (ms). */
  busyMs: number;
  /** The page's steady frame interval: what a frame takes when no commit
   * lands in it (the display's cadence, or longer when every frame draws a
   * big graph). Learned from the frames past SETTLE_FRAMES after a commit
   * (EWMA, ms); starts at 60 Hz. */
  frameMs: number;
  /** The previous frame's timestamp, or null before the first frame. */
  lastFrameAt: number | null;
  /** Frames observed since the last commit. */
  sinceCommit: number;
}

/** A page commit lands within this many frames after it is asked for
 * (React renders after the frame; the fold index may land one render
 * later): those frames never teach the steady frame. */
export const SETTLE_FRAMES = 3;

export function startPacer(): CommitPacer {
  return { lastCommitAt: Number.NEGATIVE_INFINITY, costMs: 0, busyMs: 0, frameMs: 1000 / 60, lastFrameAt: null, sinceCommit: SETTLE_FRAMES + 1 };
}

const EWMA = 0.3;
/** Shorter gaps than this are not a display cadence (no 250 Hz screens). */
const MIN_FRAME_MS = 4;

/** Learn from the gap since the previous frame. A frame held past one and
 * a half steady frames was held by main-thread work (a page commit lands
 * one or more frames after it is asked for, and may render twice), so the
 * excess over the steady frame counts as busy time. A frame no commit can
 * be landing in teaches the steady frame; one held far past it moves it at
 * most to twice itself (a late commit or a pause of the tab is not the
 * page's cadence). Call once per animation frame. */
export function observeFrame(p: CommitPacer, now: number): CommitPacer {
  const sinceCommit = p.sinceCommit + 1;
  if (p.lastFrameAt === null) return { ...p, lastFrameAt: now, sinceCommit };
  // A gap past MAX_FRAME_MS is a hidden tab or a sleeping machine, not the
  // page's work: it counts as one second at most (the head does the same).
  const gap = Math.min(MAX_FRAME_MS, Math.max(0, now - p.lastFrameAt));
  const busy = gap > 1.5 * p.frameMs ? gap - p.frameMs : 0;
  const steady = sinceCommit > SETTLE_FRAMES && gap >= MIN_FRAME_MS;
  const frameMs = steady ? p.frameMs + EWMA * (Math.min(gap, 2 * p.frameMs) - p.frameMs) : p.frameMs;
  return { ...p, frameMs, busyMs: p.busyMs + busy, lastFrameAt: now, sinceCommit };
}

/** The shortest gap between two page commits at this speed. */
export function minCommitGapMs(p: CommitPacer, speed: number): number {
  const floor = speed >= HIGH_SPEED ? HIGH_SPEED_COMMIT_MS : 0;
  return Math.max(floor, COMMIT_DUTY * Math.max(p.costMs, p.busyMs));
}

/** Whether the page may follow the head on this frame. */
export function commitDue(p: CommitPacer, now: number, speed: number): boolean {
  return now - p.lastCommitAt >= minCommitGapMs(p, speed);
}

/** Record that this frame commits the page: the busy time since the last
 * commit was that commit's cost (the time before the first one is not). */
export function markCommit(p: CommitPacer, now: number): CommitPacer {
  const first = !Number.isFinite(p.lastCommitAt);
  return { ...p, costMs: first ? p.costMs : p.costMs + EWMA * (p.busyMs - p.costMs), busyMs: 0, lastCommitAt: now, sinceCommit: 0 };
}

export interface PlayState {
  clock: PlayClock;
  pacer: CommitPacer;
  /** The index the page was last committed at. */
  committed: number;
}

export function startPlay(index: number, now: number): PlayState {
  return { clock: startClock(index, now), pacer: startPacer(), committed: index };
}

export interface PlayFrame {
  state: PlayState;
  /** Where the time panel draws the head this frame. */
  head: number;
  /** Commit the page at this index this frame, or null. */
  commit: number | null;
  /** The head reached the last envelope: playback ends here. */
  done: boolean;
}

/** One animation frame of playback. */
export function playFrame(s: PlayState, now: number, speed: number, maxIndex: number): PlayFrame {
  const clock = advanceClock(s.clock, now, BASE_EPS * speed, maxIndex);
  let pacer = observeFrame(s.pacer, now);
  const head = Math.min(maxIndex, headIndex(clock));
  if (head >= maxIndex) {
    return { state: { clock, pacer: markCommit(pacer, now), committed: maxIndex }, head: maxIndex, commit: maxIndex, done: true };
  }
  if (head !== s.committed && commitDue(pacer, now, speed)) {
    pacer = markCommit(pacer, now);
    return { state: { clock, pacer, committed: head }, head, commit: head, done: false };
  }
  return { state: { clock, pacer, committed: s.committed }, head, commit: null, done: false };
}

/** The head the time panel draws while playing: null when nothing plays
 * (the panel then shows the committed position). Set once per frame by the
 * playback loop; subscribers hear only changes. */
export interface Playhead {
  get(): number | null;
  set(index: number | null): void;
  subscribe(listener: () => void): () => void;
}

export function createPlayhead(): Playhead {
  let value: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(index) {
      if (index === value) return;
      value = index;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
