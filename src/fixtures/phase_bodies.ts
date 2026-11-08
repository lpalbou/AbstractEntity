/**
 * GET /life_state bodies as CONTRACT-phases.md v1 §1.4 gives them (one per phase, the new fields
 * plus the always-present nulls), for the phase bar's tests. `phaseBody(phase, overrides)`.
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

export const PHASE_EXAMPLES: Record<ServedPhase, Record<string, unknown>> = {
  visit: {
    rev: 43,
    phase: "visit",
    stopped: false,
    toggles: { work: true, personal: true },
    since: "2026-11-08T18:15:02.000+00:00",
    sentence: "In a visit with Laurent since 19:15.",
    next: { phase: "personal", sentence: "When the visit closes, his own time resumes." },
    blocked: null,
    visit: { lane: "visit", run_id: "run_7f2c", chat_id: null, session_id: "sess_19a", participants: ["person:laurent"], since: "2026-11-08T18:15:02.000+00:00" },
    work: null,
    sleep: null,
  },
  work: {
    rev: 44,
    phase: "work",
    stopped: false,
    toggles: { work: true, personal: false },
    since: "2026-11-08T18:20:00.000+00:00",
    sentence: "Working on a request from an agent since 19:20.",
    next: { phase: "idle", sentence: "When this work ends, he stays awake and reachable." },
    blocked: null,
    visit: null,
    work: { kind: "summon", run_id: "run_a11", since: "2026-11-08T18:20:00.000+00:00" },
    sleep: null,
  },
  personal: {
    rev: 45,
    phase: "personal",
    stopped: false,
    toggles: { work: true, personal: true },
    since: "2026-11-08T18:30:00.000+00:00",
    sentence: "On his own time since 19:30.",
    next: null,
    blocked: null,
    visit: null,
    work: null,
    sleep: null,
  },
  sleep: {
    rev: 46,
    phase: "sleep",
    stopped: false,
    toggles: { work: true, personal: true },
    since: "2026-11-08T18:02:00.000+00:00",
    sentence: "Resting for maintenance since 19:02; wakes when done.",
    next: { phase: "personal", sentence: "When maintenance is done he wakes and his own time resumes." },
    blocked: null,
    visit: null,
    work: null,
    sleep: { kind: "operator", reason: "maintenance requested", since: "2026-11-08T18:02:00.000+00:00", ends: "when maintenance is done" },
  },
  stopped: {
    rev: 47,
    phase: "stopped",
    stopped: true,
    toggles: { work: true, personal: true },
    since: "2026-11-08T18:40:00.000+00:00",
    sentence: "Stopped since 19:40. Nothing runs until you resume him.",
    next: null,
    blocked: null,
    visit: null,
    work: null,
    sleep: null,
  },
  idle: {
    rev: 48,
    phase: "idle",
    stopped: false,
    toggles: { work: true, personal: false },
    since: "2026-11-08T18:41:00.000+00:00",
    sentence: "Awake and reachable since 19:41; nothing of his own is running.",
    next: null,
    blocked: null,
    visit: null,
    work: null,
    sleep: null,
  },
};

export function phaseBody(phase: ServedPhase, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...BASE, ...structuredClone(PHASE_EXAMPLES[phase]), ...overrides };
}
