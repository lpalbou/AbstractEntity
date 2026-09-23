import { describe, it, expect } from "vitest";

import { dayCauseLine, deriveLifeState, ownVisitSignal } from "./entity_state";
import type { EntityStateInfo, LoopStatus, ChatStatus, ServerLifeState } from "./stream_source";

const state = (s: Partial<EntityStateInfo>): EntityStateInfo => ({ state: "awake", ...s });
const loop = (l: Partial<LoopStatus>): LoopStatus => ({ phase: "stopped", running: false, ...l });
const chat = (c: Partial<ChatStatus>): ChatStatus => ({ open: false, ...c });
const server = (s: Partial<ServerLifeState>): ServerLifeState => ({ phase: "awake", ...s });

describe("deriveLifeState — the maintainer's mutually-exclusive state machine (2026-07-09)", () => {
  it("VISIT suppresses own-time even when the loop process is alive (auto-yield)", () => {
    // The bug: a visit auto-yields the loop, so running stays true; the
    // old UI showed VISITING + own-time-pressed at once.
    const life = deriveLifeState(state({ mode: "visiting" }), loop({ running: true, phase: "day" }), null);
    expect(life.phase).toBe("visiting");
    expect(life.ownTimeActive).toBe(false);
    expect(life.sleeping).toBe(false);
  });

  it("VISIT suppresses sleeping (cannot visit and sleep)", () => {
    const life = deriveLifeState(state({ state: "asleep", mode: "visiting" }), loop({}), null);
    expect(life.phase).toBe("visiting");
    expect(life.sleeping).toBe(false);
  });

  it("a chat open (no mode set) is still a visit", () => {
    const life = deriveLifeState(state({}), loop({ running: true, phase: "day" }), chat({ open: true }));
    expect(life.phase).toBe("visiting");
    expect(life.ownTimeActive).toBe(false);
  });

  it("ON ITS TIME requires running AND phase=day AND no visit", () => {
    const life = deriveLifeState(state({ state: "awake" }), loop({ running: true, phase: "day" }), null);
    expect(life.phase).toBe("own_time");
    expect(life.ownTimeActive).toBe(true);
  });

  it("a loop alive but between days is RESTING, not on-its-time", () => {
    const life = deriveLifeState(state({ state: "awake" }), loop({ running: true, phase: "between" }), null);
    expect(life.phase).toBe("resting");
    expect(life.ownTimeActive).toBe(false);
  });

  it("dreaming is a distinct sleeping sub-state, never own-time", () => {
    const life = deriveLifeState(state({ state: "asleep", mode: "dreaming" }), loop({ running: true, phase: "day" }), null);
    expect(life.phase).toBe("dreaming");
    expect(life.sleeping).toBe(true);
    expect(life.ownTimeActive).toBe(false);
  });

  it("operator sleep vs self sleep is labeled from written_by (ruled four-phase words)", () => {
    expect(deriveLifeState(state({ state: "asleep", written_by: "self" }), loop({}), null).label).toBe("sleep (his choice)");
    expect(deriveLifeState(state({ state: "asleep", written_by: "operator" }), loop({}), null).label).toBe("sleep");
  });

  it("paused is its own state, not own-time", () => {
    const life = deriveLifeState(state({ state: "paused" }), loop({ running: true, phase: "day" }), null);
    expect(life.phase).toBe("paused");
    expect(life.ownTimeActive).toBe(false);
  });

  it("SERVER phase is the authority when /life_state is available (commons seq 96)", () => {
    // The gateway computed "visiting"; the stale client trio disagrees
    // (asleep + loop ticking). The server answer wins — no re-derivation.
    const life = deriveLifeState(
      state({ state: "asleep" }),
      loop({ running: true, phase: "day" }),
      null,
      server({ phase: "visiting", chat_open: true, state: "awake", own_time_running: true, own_time_phase: "between" }),
    );
    expect(life.phase).toBe("visiting");
    expect(life.ownTimeActive).toBe(false);
    expect(life.sleeping).toBe(false);
  });

  it("server asleep + state_mode=dreaming decorates as dreaming (still sleeping-class)", () => {
    const life = deriveLifeState(null, null, null, server({ phase: "asleep", state: "asleep", state_mode: "dreaming" }));
    expect(life.phase).toBe("dreaming");
    expect(life.sleeping).toBe(true);
    expect(life.ownTimeActive).toBe(false);
  });

  it("a stale dreaming mode never overrides a non-asleep server phase", () => {
    const life = deriveLifeState(null, null, null, server({ phase: "own_time", state: "awake", state_mode: "dreaming", own_time_running: true, own_time_phase: "day" }));
    expect(life.phase).toBe("own_time");
    expect(life.ownTimeActive).toBe(true);
    expect(life.sleeping).toBe(false);
  });

  it("server phases map one-to-one and stay mutually exclusive", () => {
    const phases: Array<[string, string]> = [
      ["visiting", "visiting"],
      ["paused", "paused"],
      ["asleep", "sleeping"],
      // BOTH wire spellings (P0 regression 2026-07-15 22:38: the gateway
      // re-spelled the composite to the ruled "personal" while the client
      // only knew the retired "own_time" — a ticking personal day fell
      // through to "awake" and the radio never pushed gold).
      ["personal", "own_time"],
      ["own_time", "own_time"],
      ["resting", "resting"],
      // v6 (laurent c203): awake is NEVER a phase/resting place — a server
      // "awake" renders as the settling transition toward the idle default.
      ["awake", "settling"],
    ];
    for (const [serverPhase, expected] of phases) {
      const life = deriveLifeState(null, null, null, server({ phase: serverPhase }));
      expect(life.phase).toBe(expected);
      const active = [life.visiting, life.sleeping, life.ownTimeActive].filter(Boolean).length;
      expect(active).toBeLessThanOrEqual(1);
    }
  });

  it("ruled-spelling personal ticks render pushed (ownTimeActive)", () => {
    const life = deriveLifeState(null, null, null, server({ phase: "personal", state: "awake", own_time_running: true, own_time_phase: "day" }));
    expect(life.phase).toBe("own_time");
    expect(life.ownTimeActive).toBe(true);
  });

  it("v6 pixel pin (laurent c203): a served awake renders LABEL 'sleep (settling)', accent sleeping — never the word awake", () => {
    // Adversary-A find 19: the phase mapping was pinned but the LABEL was
    // not — a relabel back to "awake" keeping phase="settling" passed the
    // suite. This pins the exact screenshotted pixel.
    const life = deriveLifeState(null, null, null, server({ phase: "awake", state: "awake" }));
    expect(life.label).toBe("sleep (settling)");
    expect(life.accent).toBe("sleeping");
    expect(life.label.toLowerCase()).not.toContain("awake");
  });

  it("trio-mode settling carries the same pixel: state awake + dead loop renders 'sleep (settling)'", () => {
    const life = deriveLifeState({ state: "awake", mode: "", reason: null }, { running: false }, null, null);
    expect(life.phase).toBe("settling");
    expect(life.label).toBe("sleep (settling)");
    expect(life.accent).toBe("sleeping");
  });

  it("an unrecognized STATE word stays verbatim-labeled through the v6 rewrite", () => {
    const life = deriveLifeState({ state: "zzz", mode: "", reason: null }, { running: false }, null, null);
    expect(life.phase).toBe("settling");
    expect(life.label).toBe("state: zzz");
  });

  it("a served work phase renders WORK, never dressed as settling (vocabulary-drift guard)", () => {
    for (const word of ["working", "work"]) {
      const life = deriveLifeState(null, null, null, server({ phase: word, state: "awake" }));
      expect(life.phase).toBe("working");
    }
  });

  it("dayCauseLine folds the gate's wire words to operator lines; degrade warns; unknown kinds verbatim-labeled; absent = null", () => {
    expect(dayCauseLine({ kind: "drives", detail: "3 alive of 71 standing" })).toEqual({
      text: "personal day arose from his desk — 3 alive of 71 standing",
      warn: false,
    });
    expect(dayCauseLine({ kind: "work_order", detail: "work_order.md" })?.text).toContain("a task stands");
    expect(dayCauseLine({ kind: "settled_desk" })?.text).toContain("settled desk");
    expect(dayCauseLine({ kind: "grant_degraded", detail: "drive_pressure read failed" })).toEqual({
      text: "#FALLBACK day-gate degrade — drive_pressure read failed",
      warn: true,
    });
    expect(dayCauseLine({ kind: "granted_unused", detail: "0.3h of granted personal time used; the 2h floor stands" })?.text).toContain("the grant stood unused");
    expect(dayCauseLine({ kind: "future_kind" })?.text).toBe("day cause: future_kind");
    expect(dayCauseLine(undefined)).toBeNull();
    expect(dayCauseLine({})).toBeNull();
  });

  it("trio mode prefers the heartbeat's day_kind stamp: a work day renders WORK, personal stays personal, absent = legacy", () => {
    // runtime seq 216: loop_status.day_kind serves work|personal from the
    // heartbeat — pre-staged consumer half (agora dm#4 item 1).
    const work = deriveLifeState(state({ state: "awake" }), loop({ running: true, phase: "day", day_kind: "work" }), null, null);
    expect(work.phase).toBe("working");
    const personal = deriveLifeState(state({ state: "awake" }), loop({ running: true, phase: "day", day_kind: "personal" }), null, null);
    expect(personal.phase).toBe("own_time");
    const legacy = deriveLifeState(state({ state: "awake" }), loop({ running: true, phase: "day" }), null, null);
    expect(legacy.phase).toBe("own_time");
  });

  it("the post-c3618 wire generation (graph words + posture nuances) maps to the same renders", () => {
    // The gateway's one-graph fold: phase serves visit|work|personal|sleep,
    // legacy nuances ride `posture`. Both generations must render alike.
    const cases: Array<[Partial<ServerLifeState>, string]> = [
      [{ phase: "visit", state: "asleep", state_mode: "visiting" }, "visiting"],
      [{ phase: "sleep", state: "asleep" }, "sleeping"],
      [{ phase: "work", state: "awake" }, "working"],
      [{ phase: "personal", state: "awake" }, "own_time"],
      // Nuance postures drive the branch: a yield renders as bookkeeping
      // even though the graph phase says visit (the honest render).
      [{ phase: "visit", posture: "yielded", state: "asleep", state_mode: "visiting" }, "yielded"],
      [{ phase: "personal", posture: "resting", state: "awake" }, "resting"],
      [{ phase: "sleep", posture: "paused", state: "paused" }, "paused"],
      // Unknown posture words are nuance-channel noise — fail-safe to the
      // graph word, never to the settling tail.
      [{ phase: "sleep", posture: "hibernating", state: "asleep" }, "sleeping"],
    ];
    for (const [srv, expected] of cases) {
      const life = deriveLifeState(null, null, null, server(srv));
      expect(life.phase, JSON.stringify(srv)).toBe(expected);
    }
  });

  it("an unrecognized SERVER phase word is verbatim-labeled, never dressed as settling", () => {
    const life = deriveLifeState(null, null, null, server({ phase: "hibernating", state: "awake" }));
    expect(life.phase).toBe("settling");
    expect(life.label).toContain("hibernating");
    expect(life.label).not.toBe("sleep (settling)");
  });

  it('the gateway\'s distinct "yielded" phase renders as bookkeeping with no radio position', () => {
    const life = deriveLifeState(null, null, null, server({ phase: "yielded", state: "asleep", state_mode: "visiting", state_reason: "in conversation with person:admin (auto-yield)" }));
    expect(life.phase).toBe("yielded");
    expect(life.sleeping).toBe(false);
    expect(life.visiting).toBe(false);
    expect(life.label).toContain("bookkeeping");
  });

  it("a stranded auto-yield (server asleep + mode visiting) renders as visit bookkeeping, never a chosen sleep", () => {
    const life = deriveLifeState(
      null,
      null,
      null,
      server({ phase: "asleep", state: "asleep", state_mode: "visiting", state_reason: "in conversation with person:admin (auto-yield)" }),
    );
    expect(life.phase).toBe("sleeping");
    expect(life.label).toContain("yielded");
    expect(life.detail).toContain("visit bookkeeping");
    expect(life.detail).not.toContain("Asleep by the operator");
  });

  it("a self-elected sleep quotes HIS words, never 'by the operator'", () => {
    const life = deriveLifeState(
      null,
      null,
      null,
      server({ phase: "asleep", state: "asleep", state_mode: "dreaming", state_reason: "self-elected sleep: Letting overnight reorganization work on the gap." }),
    );
    expect(life.phase).toBe("dreaming");
    expect(life.label).toContain("his choice");
    expect(life.detail).toContain("Letting overnight reorganization");
    expect(life.detail).not.toContain("Asleep by the operator");
  });

  it("a null server (older gateway) falls back to client derivation unchanged", () => {
    const life = deriveLifeState(state({ state: "awake" }), loop({ running: true, phase: "day" }), null, null);
    expect(life.phase).toBe("own_time");
    expect(life.ownTimeActive).toBe(true);
  });

  it("no two states are ever simultaneously active — the FULL axis sweep (server × posture × chat × trio)", () => {
    // dm#94 render adversary P1-6: the old sweep iterated trio inputs only
    // with chat hardcoded null — it exhaustively proved the one
    // configuration that could not produce the incident. This sweep
    // crosses BOTH wire generations, every posture nuance, and the visit
    // axis; per combination it asserts the flag QUADRUPLE (working joined)
    // and the ruled implication: an open chat on a non-stopped entity
    // ALWAYS renders visit.
    const modes = [undefined, "visiting", "dreaming"];
    const states = ["awake", "asleep", "paused"];
    const phases = ["stopped", "between", "day"];
    const serverWords = [null, "visiting", "visit", "personal", "own_time", "resting", "sleep", "asleep", "work", "working", "paused", "yielded", "awake"];
    const postures = ["", "visiting", "yielded", "resting", "paused", "day"];
    const chats = [null, { open: false }, { open: true }];
    for (const sw of serverWords)
      for (const posture of sw === null ? [""] : postures)
        for (const c of chats)
          for (const m of modes)
            for (const s of states)
              for (const running of [false, true]) {
                const srv = sw === null ? null : server({ phase: sw, posture, state: s, own_time_running: running });
                const life = deriveLifeState(
                  state({ state: s, mode: m as string | undefined }),
                  loop({ running, phase: phases[(m ? 1 : 0) + (running ? 1 : 0)] }),
                  c,
                  srv,
                );
                const ctx = JSON.stringify({ sw, posture, c, m, s, running });
                const active = [life.visiting, life.sleeping, life.ownTimeActive, life.working].filter(Boolean).length;
                expect(active, ctx).toBeLessThanOrEqual(1);
                if (life.visiting) {
                  expect(life.sleeping, ctx).toBe(false);
                  expect(life.ownTimeActive, ctx).toBe(false);
                  expect(life.working, ctx).toBe(false);
                }
                // THE RULING (laurent dm#94): a live conversation can never
                // render under another phase word — only the kill switch
                // outranks it.
                if (c?.open && life.phase !== "paused") {
                  expect(life.visiting, ctx).toBe(true);
                  expect(life.phase, ctx).toBe("visiting");
                }
                // v6 label sweep (adversary A find 13.4): no combination may
                // ever surface the word "awake" as the chip label.
                expect(life.label, ctx).not.toMatch(/\bawake\b/i);
              }
  });
});

describe("dm#94 — the exclusivity incident (a live visit rendered under PERSONAL·RESTING)", () => {
  it("THE INCIDENT, verbatim: served personal·resting + this app's open chat → VISIT, with the disagreement rendered", () => {
    const life = deriveLifeState(
      state({ state: "awake" }),
      loop({ running: true, phase: "between" }),
      { open: true, runId: "visit-0791d2e6", midTurn: true, owned: true },
      server({ phase: "personal", posture: "resting", state: "awake", own_time_running: true }),
    );
    expect(life.phase).toBe("visiting");
    expect(life.visiting).toBe(true);
    expect(life.label).toBe("visit");
    // Render honesty: the detail names the served word as a labeled
    // discrepancy so the gateway gap gets filed, never silently absorbed.
    expect(life.detail).toContain("personal");
    expect(life.detail).toContain("disagree");
  });

  it("a client-held open chat beats EVERY non-paused served word (both wire generations)", () => {
    const words = ["personal", "own_time", "resting", "sleep", "asleep", "work", "working", "awake", "yielded", "visit", "visiting"];
    for (const w of words) {
      const life = deriveLifeState(null, null, { open: true }, server({ phase: w, state: "awake" }));
      expect(life.phase, w).toBe("visiting");
      expect(life.visiting, w).toBe(true);
    }
  });

  it("PAUSED outranks even the client-held chat — visit-under-stop renders STOPPED with the loud warning", () => {
    const srv = deriveLifeState(null, null, { open: true }, server({ phase: "paused", state: "paused" }));
    expect(srv.phase).toBe("paused");
    expect(srv.visiting).toBe(false);
    expect(srv.detail).toContain("open against this stopped entity");
    const trio = deriveLifeState(state({ state: "paused" }), loop({}), chat({ open: true }), null);
    expect(trio.phase).toBe("paused");
    expect(trio.visiting).toBe(false);
  });

  it("the composite's OWN chat_open beside a non-visit word is a self-contradiction — resolved toward the visit, never a clean personal", () => {
    const life = deriveLifeState(null, null, null, server({ phase: "personal", posture: "resting", chat_open: true, state: "awake" }));
    expect(life.phase).toBe("visiting");
    expect(life.detail).toContain("disagree");
  });

  it("trio kill switch outranks a stale visiting mode (mode=visiting + state=paused → STOPPED)", () => {
    const life = deriveLifeState(state({ state: "paused", mode: "visiting" }), loop({ running: true, phase: "day" }), null);
    expect(life.phase).toBe("paused");
    expect(life.visiting).toBe(false);
  });

  it("the working flag joins the machine: served work → working=true; trio work day → working=true; personal/visit → false", () => {
    expect(deriveLifeState(null, null, null, server({ phase: "work", state: "awake" })).working).toBe(true);
    expect(deriveLifeState(state({ state: "awake" }), loop({ running: true, phase: "day", day_kind: "work" }), null).working).toBe(true);
    expect(deriveLifeState(null, null, null, server({ phase: "personal", state: "awake" })).working).toBe(false);
    expect(deriveLifeState(null, null, { open: true }, server({ phase: "work", state: "awake" })).working).toBe(false);
  });

  it("the LIVE-SERVED contradiction pair {phase:'visiting', posture:'resting'} renders VISIT (forensics keystone D2/D3)", () => {
    // Reproduced live on the wire during the incident: the route widening
    // patches phase='visiting' over the fold but leaves posture='resting'
    // standing; the old blanket nuance-priority let the rest word outrank
    // the visit word. NUANCE-NEVER-CONTRADICTS-PHASE (spec v10): a posture
    // decorates its declared phase only.
    const life = deriveLifeState(null, null, null, server({ phase: "visiting", posture: "resting", state: "awake" }));
    expect(life.phase).toBe("visiting");
    expect(life.visiting).toBe(true);
  });

  it("the idle default {phase:'sleep', posture:'resting'} with a DEAD loop renders sleep, never 'personal · resting' (forensics D1)", () => {
    // The fold's own idle default (no process, no visit, not paused). The
    // old normalizer promoted the resting posture to the branch key and
    // painted an alive personal loop over a corpse.
    const life = deriveLifeState(null, null, null, server({ phase: "sleep", posture: "resting", state: "awake", own_time_running: false }));
    expect(life.phase).toBe("sleeping");
    expect(life.label).not.toContain("personal");
    expect(life.ownTimeOn).toBe(false);
  });

  it("postures apply ONLY to their declared phase: yielded needs a visit word, resting needs a personal word", () => {
    // visit·yielded = the fold's own bookkeeping pair (kept).
    expect(deriveLifeState(null, null, null, server({ phase: "visit", posture: "yielded", state: "asleep", state_mode: "visiting" })).phase).toBe("yielded");
    // sleep·yielded is not a fold-minted pair — the graph word stands.
    expect(deriveLifeState(null, null, null, server({ phase: "sleep", posture: "yielded", state: "asleep" })).phase).toBe("sleeping");
    // work·resting: the rest nuance never rewrites a work day.
    expect(deriveLifeState(null, null, null, server({ phase: "work", posture: "resting", state: "awake" })).phase).toBe("working");
  });

  it("ownVisitSignal — the pure forcing rule (render adversary pin 7)", () => {
    // Mid-turn forces even when the poll is older than the turn.
    expect(ownVisitSignal(null, "r1", "turn")).toEqual({ open: true, runId: "r1", midTurn: true, owned: true });
    // A poll-asserted open visit forces; owned iff the held id matches.
    expect(ownVisitSignal({ open: true, run_id: "r1" }, "r1", "idle")).toEqual({ open: true, runId: "r1", midTurn: false, owned: true });
    expect(ownVisitSignal({ open: true, run_id: "r2" }, "r1", "idle")?.owned).toBe(false);
    expect(ownVisitSignal({ open: true, run_id: "r2" }, null, "idle")?.open).toBe(true);
    // A closed poll never forces — regardless of any held run id (the
    // reaper closed it; a stale id must not paint a dead visit live).
    expect(ownVisitSignal({ open: false }, "r1", "idle")).toBeNull();
    expect(ownVisitSignal(null, "r1", "idle")).toBeNull();
    // Opening/closing busy states are NOT mid-turn (impl adversary P2-8):
    // "opening" with no server-asserted open yet does not force (the open
    // may still be refused); "closing" with the poll still open DOES ride
    // the poll (server-asserted until the close lands).
    expect(ownVisitSignal(null, null, "opening")).toBeNull();
    expect(ownVisitSignal({ open: true, run_id: "r1" }, "r1", "closing")?.open).toBe(true);
    expect(ownVisitSignal({ open: false }, "r1", "closing")).toBeNull();
  });

  it("a CLOSED ChatStatus object normalizes to null at entry — never bypasses the half-truth guards (impl adversary P2-1)", () => {
    // All-null + {open:false} used to fall through both null-guards and
    // render definite phases from half the truth (the F23 class).
    const allNull = deriveLifeState(null, null, { open: false }, null);
    expect(allNull.phase).toBe("unknown");
    const loopOnly = deriveLifeState(null, loop({ running: true, phase: "day" }), { open: false }, null);
    expect(loopOnly.phase).toBe("unknown");
    expect(loopOnly.label).toContain("state unread");
  });

  it("resting honors the composite's own process bit (impl adversary P2-2)", () => {
    const life = deriveLifeState(null, null, null, server({ phase: "personal", posture: "resting", state: "awake", own_time_running: false }));
    expect(life.phase).toBe("resting");
    expect(life.ownTimeOn).toBe(false);
  });

  it("trio paused + visiting mode renders STOPPED with the contradiction named (impl adversary P2-3)", () => {
    const life = deriveLifeState(state({ state: "paused", mode: "visiting" }), loop({}), null);
    expect(life.phase).toBe("paused");
    expect(life.detail).toContain("open against this stopped entity");
  });
});
