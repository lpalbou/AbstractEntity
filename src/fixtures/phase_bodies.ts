/**
 * GET /life_state bodies as CONTRACT-phases.md v2 §1.6 gives them, moved to the v3 deltas
 * (CONTRACT-v3-deltas.md: `toggles` = {personal} only, no `can.toggle_work`, `work` = the job queue
 * {jobs_queued, current} in every phase; a newborn is idle) — one per phase, the new fields plus
 * the always-present nulls; `can` all-allowed where the contract shows none — for the phase bar's
 * tests. `phaseBody(phase, overrides)`.
 */
import type { ServedPhase } from "../phase_bar_source";

const BASE = {
  entity_id: "castor",
  name: "castor",
  personal_expires_at: null,
  posture: "day",
  chat_open: false,
  chat_id: null,
  state: "awake",
  state_mode: "",
  state_reason: "",
  own_time_running: false,
  own_time_phase: "",
  visit_run_id: null,
  warnings: [],
};

const ALLOWED = { allowed: true, sentence: null };
export const CAN_ALL = { visit: ALLOWED, sleep_now: ALLOWED, toggle_personal: ALLOWED };
/** v3 D1: the queue, empty. */
export const NO_JOBS = { jobs_queued: 0, current: null };
export const IN_VISIT = "He is in a visit; end it to let him sleep.";
export const ALREADY_ASLEEP = "He is already resting; a sleep cannot follow a sleep.";
export const STOPPED_VISIT = "Stopped. Resume to visit.";
export const STOPPED_SLEEP = "Stopped. Resume him first.";
export const STOPPED_TOGGLE = "Stopped. Resume him first, then choose what he may do.";
/** v3 D3: the stop's receipt row (the personal grant revoked by the kill switch). */
export const OWN_TIME_REVOKED = "Own time was revoked.";
export const REVOKED_ITEM = { item: "personal", id: null, outcome: "revoked", code: null, sentence: OWN_TIME_REVOKED };

export const PHASE_EXAMPLES: Record<ServedPhase, Record<string, unknown>> = {
  visit: {
    rev: 43,
    generation: 7,
    phase: "visit",
    stopped: false,
    toggles: { personal: true },
    since: "2026-11-08T18:15:02.000+00:00",
    sentence: "In a visit with Laurent.",
    next: { phase: "personal", sentence: "When the visit closes, his own time resumes." },
    blocked: null,
    can: { ...CAN_ALL, sleep_now: { allowed: false, sentence: IN_VISIT } },
    visit: { lane: "visit", run_id: "run_7f2c", chat_id: null, session_id: "sess_19a", participants: ["person:laurent"], since: "2026-11-08T18:15:02.000+00:00", waiting_for: null },
    work: NO_JOBS,
    sleep: null,
  },
  work: {
    rev: 44,
    generation: 7,
    phase: "work",
    stopped: false,
    toggles: { personal: true },
    since: "2026-11-08T18:20:00.000+00:00",
    sentence: "Working on a request from an agent.",
    next: { phase: "personal", sentence: "When his jobs are done, his own time resumes." },
    blocked: null,
    can: CAN_ALL,
    visit: null,
    work: { jobs_queued: 2, current: { kind: "summon", run_id: "run_a11", since: "2026-11-08T18:20:00.000+00:00" } },
    sleep: null,
  },
  personal: {
    rev: 45,
    generation: 7,
    phase: "personal",
    stopped: false,
    toggles: { personal: true },
    since: "2026-11-08T18:30:00.000+00:00",
    sentence: "On his own time.",
    next: null,
    blocked: null,
    can: CAN_ALL,
    visit: null,
    work: NO_JOBS,
    sleep: null,
  },
  sleep: {
    rev: 46,
    generation: 7,
    phase: "sleep",
    stopped: false,
    toggles: { personal: true },
    since: "2026-11-08T18:02:00.000+00:00",
    sentence: "Resting for maintenance; wakes when done.",
    next: { phase: "personal", sentence: "When maintenance is done he wakes and his own time resumes." },
    blocked: null,
    can: { ...CAN_ALL, sleep_now: { allowed: false, sentence: ALREADY_ASLEEP } },
    visit: null,
    work: NO_JOBS,
    sleep: { kind: "operator", reason: "maintenance requested", since: "2026-11-08T18:02:00.000+00:00", ends: "when maintenance is done" },
  },
  stopped: {
    rev: 47,
    generation: 8,
    phase: "stopped",
    stopped: true,
    // v3 D3: Stop revoked his own time.
    toggles: { personal: false },
    since: "2026-11-08T18:40:00.000+00:00",
    sentence: "Stopped. Nothing runs until you resume him.",
    next: null,
    blocked: null,
    can: {
      visit: { allowed: false, sentence: STOPPED_VISIT },
      sleep_now: { allowed: false, sentence: STOPPED_SLEEP },
      toggle_personal: { allowed: false, sentence: STOPPED_TOGGLE },
    },
    visit: null,
    work: NO_JOBS,
    sleep: null,
  },
  idle: {
    rev: 48,
    generation: 8,
    phase: "idle",
    stopped: false,
    toggles: { personal: false },
    since: "2026-11-08T18:41:00.000+00:00",
    sentence: "Awake and reachable; nothing of his own is running.",
    next: null,
    blocked: null,
    can: CAN_ALL,
    visit: null,
    work: NO_JOBS,
    sleep: null,
  },
};

/** §1.6's last example: own time stopped unexpectedly, with the Retry the gateway offers. */
export const LOOP_CRASHED = {
  rev: 49,
  toggles: { personal: true },
  sentence: "Awake and reachable; his own time stopped unexpectedly.",
  blocked: { code: "loop_crashed", sentence: "His own time stopped unexpectedly. Retry to start it again.", action: "retry" },
};

export function phaseBody(phase: ServedPhase, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...BASE, ...structuredClone(PHASE_EXAMPLES[phase]), ...overrides };
}
