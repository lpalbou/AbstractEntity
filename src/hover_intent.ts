/**
 * HOVER INTENT (operator 2026-11-09: "the node tooltip and the hover
 * selection/highlight must wait 150 ms of the pointer resting on the node
 * before showing; moving across nodes shows nothing; leaving before 150 ms
 * cancels; click stays immediate; same 150 ms for the lit-line tooltip").
 *
 * One rest timer for what the pointer is over (a memory, a lit line — the
 * caller's string key). Over the same thing again: the timer keeps running
 * (resting inside a memory is still resting on it). Over something else, or
 * over nothing: the pending one is forgotten and, for a new target, a new
 * timer starts. Only a target the pointer stayed on for the whole delay is
 * handed to `onRest`. Clicks never go through here.
 */

export const HOVER_INTENT_MS = 150;

export interface HoverIntent {
  /** The pointer is over `target` now (null: over nothing). */
  over(target: string | null): void;
  /** Forget the pending target (the pointer left, a drag began). */
  cancel(): void;
  /** The target waiting for its rest, or null. */
  pending(): string | null;
}

export interface HoverIntentTimers {
  set(fn: () => void, ms: number): number;
  clear(id: number): void;
}

const windowTimers: HoverIntentTimers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
};

export function hoverIntent(onRest: (target: string) => void, delayMs: number = HOVER_INTENT_MS, timers: HoverIntentTimers = windowTimers): HoverIntent {
  let waiting: string | null = null;
  let timer: number | null = null;
  const stop = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
    waiting = null;
  };
  return {
    over(target) {
      if (target !== null && target === waiting) return;
      stop();
      if (target === null) return;
      waiting = target;
      timer = timers.set(() => {
        timer = null;
        const rested = waiting;
        waiting = null;
        if (rested !== null) onRest(rested);
      }, delayMs);
    },
    cancel: stop,
    pending: () => waiting,
  };
}
