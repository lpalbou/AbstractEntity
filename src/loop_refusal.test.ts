/**
 * B2 (laurent 04:58, hypnos): the own-time button did nothing on repeated
 * clicks. Two halves, both pinned:
 *
 * 1. Structured /loop refusals ({reason_code, message, loop}) parse into
 *    words + adoptable live status — never JSON armor in a note.
 * 2. The click acts on the RENDERED state (deriveLifeState.ownTimeActive),
 *    never raw process-aliveness: a loop process alive under an
 *    operator-sleep must present as NOT own-time, so a click means START
 *    (wake), not a silent stop. This is the exact hypnos shape (loop pid
 *    alive 1h+ holding the lease, state=asleep written by web controls).
 */
import { describe, expect, it } from "vitest";

import { activeRuledPhase, deriveLifeState } from "./entity_state";
import { parseLoopRefusal } from "./stream_source";

describe("parseLoopRefusal (B2 structured refusals)", () => {
  it("parses reason_code + message + live loop status", () => {
    const err = new Error(
      JSON.stringify({
        detail: {
          reason_code: "already_running",
          message: "entity:hypnos's own time is already running (pid 14902, phase day)",
          loop: { running: true, phase: "day", pid: 14902 },
        },
      }),
    );
    const refusal = parseLoopRefusal(err);
    expect(refusal?.reason_code).toBe("already_running");
    expect(refusal?.message).toMatch(/already running/);
    expect(refusal?.loop?.running).toBe(true);
  });

  it("returns null for plain-text and non-refusal JSON errors", () => {
    expect(parseLoopRefusal(new Error("HTTP 500"))).toBeNull();
    expect(parseLoopRefusal(new Error('{"detail":"a visit is open"}'))).toBeNull();
  });

  it("falls back to the reason_code when message is missing", () => {
    const err = new Error(JSON.stringify({ detail: { reason_code: "paused" } }));
    expect(parseLoopRefusal(err)?.message).toBe("paused");
  });
});

describe("the three-axis state model (state wave, laurent 12:32)", () => {
  it("hypnos shape: loop alive + operator-asleep = PUSHED-suppressed (ownTimeOn true, not ticking)", () => {
    const life = deriveLifeState(
      { state: "asleep", reason: "operator", written_by: "operator" },
      { running: true, phase: "day", pid: 14902 },
      null,
      null,
    );
    // The button renders PRESSED (own time is ON — the process axis) with
    // the suppressed tint; a click on a pressed button means STOP. The old
    // model rendered this unpressed, which made an alive loop unstoppable
    // and clicks silently act on the wrong axis — the 10:20 incident.
    expect(life.ownTimeOn).toBe(true);
    expect(life.ownTimeActive).toBe(false);
    expect(life.sleeping).toBe(true);
  });

  it("loop alive between days = PUSHED-resting (on, not ticking; stop reachable)", () => {
    const life = deriveLifeState({ state: "awake" }, { running: true, phase: "between" }, null, null);
    expect(life.ownTimeOn).toBe(true);
    expect(life.ownTimeActive).toBe(false);
    expect(life.phase).toBe("resting");
    expect(life.label).toBe("personal · resting");
  });

  it("loop alive, day open, awake = PUSHED-active (ticking)", () => {
    const life = deriveLifeState({ state: "awake" }, { running: true, phase: "day" }, null, null);
    expect(life.ownTimeOn).toBe(true);
    expect(life.ownTimeActive).toBe(true);
  });

  it("loop dead = unpressed", () => {
    const life = deriveLifeState({ state: "awake" }, { running: false }, null, null);
    expect(life.ownTimeOn).toBe(false);
    expect(life.ownTimeActive).toBe(false);
  });

  it("stopping derives from the ONE machine (never raw fields at render sites)", () => {
    const life = deriveLifeState({ state: "awake" }, { running: true, phase: "day", stop_requested: true }, null, null);
    expect(life.stopping).toBe(true);
    const dead = deriveLifeState({ state: "awake" }, { running: false, stop_requested: true }, null, null);
    expect(dead.stopping).toBe(false); // a dead loop is not "stopping"
  });

  it("nothing answered renders UNKNOWN, never a definite phase", () => {
    const life = deriveLifeState(null, null, null, null);
    expect(life.phase).toBe("unknown");
    expect(life.label).toBe("state unknown");
    expect(life.ownTimeOn).toBe(false);
  });

  it("HALF the truth stays partial: loop answered, state read failed (F23)", () => {
    const life = deriveLifeState(null, { running: true, phase: "day" }, null, null);
    expect(life.phase).toBe("unknown"); // never "own_time" from half a read
    expect(life.label).toBe("state unread · loop alive");
    expect(life.ownTimeOn).toBe(true); // the loop FACT still renders
    const dead = deriveLifeState(null, { running: false }, null, null);
    expect(dead.label).toBe("state unread");
  });

  it("the radio maps the ruled four phases; awake-idle/unknown push nothing", () => {
    // laurent 13:28: visit/work/personal/sleep — one active phase.
    expect(activeRuledPhase(deriveLifeState({ state: "awake", mode: "visiting" }, null, null, null))).toBe("visit");
    expect(activeRuledPhase(deriveLifeState({ state: "awake" }, { running: true, phase: "day" }, null, null))).toBe("personal");
    expect(activeRuledPhase(deriveLifeState({ state: "awake" }, { running: true, phase: "between" }, null, null))).toBe("personal");
    // STOP = PAUSED promoted (laurent 16:12): the kill switch blocks the
    // whole machine — the radio pushes NOTHING under paused, loop process
    // alive or not (supersedes the earlier personal-when-loop-alive pin).
    expect(activeRuledPhase(deriveLifeState({ state: "paused" }, { running: true, phase: "day" }, null, null))).toBeNull();
    expect(activeRuledPhase(deriveLifeState({ state: "paused" }, { running: false }, null, null))).toBeNull();
    expect(deriveLifeState({ state: "paused" }, { running: false }, null, null).label).toBe("STOPPED");
    expect(activeRuledPhase(deriveLifeState({ state: "asleep" }, null, null, null))).toBe("sleep");
    expect(activeRuledPhase(deriveLifeState({ state: "awake" }, { running: false }, null, null))).toBeNull();
    expect(activeRuledPhase(deriveLifeState(null, null, null, null))).toBeNull();
  });

  it("written_by decorates only when the trio is the winning source", () => {
    // Under SERVER authority a stale client written_by must not relabel.
    const life = deriveLifeState(
      { state: "asleep", written_by: "self" },
      null,
      null,
      { phase: "asleep", state: "asleep", state_mode: "", own_time_running: false, own_time_phase: "" },
    );
    expect(life.label).toBe("sleep");
    // Trio mode: the nuance renders.
    const trio = deriveLifeState({ state: "asleep", written_by: "self" }, null, null, null);
    expect(trio.label).toBe("sleep (his choice)");
  });
});
