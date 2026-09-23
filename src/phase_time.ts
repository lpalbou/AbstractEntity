/**
 * Phase-time accounting (operator 2026-07-15): how a life divided its time
 * across the ruled phases — visit / work / personal / sleep — plus the
 * honest remainder (UNTRACKED — span the phase markers do not cover).
 *
 * PURE + testable. It reconstructs phase INTERVALS from the host-marker
 * stream (the `sessions` array of the fold: summon/session_closed,
 * sleep/wake, personal_started/stop) and sums their durations. Overlaps
 * resolve by the SAME priority the one-derived-state machine uses
 * (visit suppresses sleep + personal — maintainer 2026-07-09): visit >
 * sleep > personal; unbracketed span is UNTRACKED (v4: idle is sleep by
 * design, but the runtime doesn't emit continuous markers, so the
 * instrumentation cannot attribute it).
 *
 * HONESTY, on the diagram's face:
 * - Only what the markers record is counted. Home-direct lives write no
 *   host markers → nothing to divide (the caller shows the honest empty).
 * - WORK has no phase markers yet (entry doors unbuilt) → its slice is
 *   always 0 until the runtime ships them; the row still renders so the
 *   absence is visible, not hidden.
 * - The span is first-marker → last-marker (or `now` when live), so the
 *   percentages are "of his observed life", not wall-clock since birth.
 */

import type { SessionMarker } from "./stream_fold";

/** The four RULED phases + the "untracked" bucket. "untracked" is NOT a
 * phase (v4 ruling, laurent 2026-07-15: the machine has no awake-idle
 * node — idle IS sleep). It is the honest name for span the phase markers
 * don't cover: per the ruled machine those spans were sleep or work, but
 * the runtime doesn't yet emit continuous phase markers, so the
 * instrumentation cannot attribute them. Shown as a coverage gap, never a
 * phase. */
export type LifePhase = "visit" | "work" | "personal" | "sleep" | "untracked";

/** Marker kinds that OPEN / CLOSE each timed phase. Work is intentionally
 * absent (no entry-door markers exist yet — the runtime lane). */
const PHASE_OPEN: Record<string, LifePhase> = {
  summon: "visit",
  sleep: "sleep",
  personal_started: "personal",
};
const PHASE_CLOSE: Record<string, LifePhase> = {
  session_closed: "visit",
  wake: "sleep",
  personal_stop_requested: "personal",
  personal_grant_revoked: "personal",
};

/** Priority for overlap resolution (higher wins the interval). Mirrors
 * deriveLifeState's suppression order. */
const PRIORITY: Record<LifePhase, number> = { visit: 3, sleep: 2, personal: 1, work: 1, untracked: 0 };

export interface PhaseTimeSlice {
  phase: LifePhase;
  ms: number;
  fraction: number; // 0..1 of the observed span
}

export interface PhaseTimeReport {
  slices: PhaseTimeSlice[];
  /** Total observed span in ms (first marker → last marker or now). */
  spanMs: number;
  /** Count of phase-boundary markers seen (0 = home-direct / no markers). */
  markerCount: number;
  /** True when there is enough to draw a meaningful division. */
  hasData: boolean;
}

const ORDER: LifePhase[] = ["visit", "work", "personal", "sleep", "untracked"];

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Compute the phase-time division from the fold's host markers.
 * `nowMs` (default Date.now()) closes the still-open interval when live.
 */
export function computePhaseTime(sessions: SessionMarker[], nowMs: number = Date.now()): PhaseTimeReport {
  // Only markers that open/close a phase, with a usable timestamp, in time
  // order (seq is the tiebreak — same-ms markers keep stream order).
  const events = sessions
    .filter((s) => (PHASE_OPEN[s.kind] || PHASE_CLOSE[s.kind]) && Number.isFinite(ms(s.observed_at)))
    .map((s) => ({ at: ms(s.observed_at), seq: s.seq, open: PHASE_OPEN[s.kind] ?? null, close: PHASE_CLOSE[s.kind] ?? null }))
    .sort((a, b) => (a.at === b.at ? a.seq - b.seq : a.at - b.at));

  const totals: Record<LifePhase, number> = { visit: 0, work: 0, personal: 0, sleep: 0, untracked: 0 };
  if (events.length < 2) {
    return { slices: emptySlices(), spanMs: 0, markerCount: events.length, hasData: false };
  }

  // Open-interval flags; at any moment the ACTIVE phase is the highest-
  // priority open flag, else untracked (NOT a phase — a coverage gap).
  const open: Record<string, boolean> = { visit: false, sleep: false, personal: false };
  const active = (): LifePhase => {
    let best: LifePhase = "untracked";
    for (const ph of ["visit", "sleep", "personal"] as LifePhase[]) {
      if (open[ph] && PRIORITY[ph] > PRIORITY[best]) best = ph;
    }
    return best;
  };

  const spanStart = events[0].at;
  const spanEnd = Math.max(events[events.length - 1].at, nowMs);
  let cursor = spanStart;

  for (const ev of events) {
    // Accrue time in the phase that was active up to this event.
    const dt = ev.at - cursor;
    if (dt > 0) totals[active()] += dt;
    cursor = ev.at;
    if (ev.open) open[ev.open] = true;
    if (ev.close) open[ev.close] = false;
  }
  // Tail: from the last marker to now (the current phase is still running).
  const tail = spanEnd - cursor;
  if (tail > 0) totals[active()] += tail;

  const spanMs = Math.max(1, spanEnd - spanStart);
  const slices: PhaseTimeSlice[] = ORDER.map((phase) => ({ phase, ms: totals[phase], fraction: totals[phase] / spanMs }));

  return { slices, spanMs, markerCount: events.length, hasData: true };
}

function emptySlices(): PhaseTimeSlice[] {
  return ORDER.map((phase) => ({ phase, ms: 0, fraction: 0 }));
}

/** Human duration for a slice ("2d 4h", "3h", "12m", "<1m"). */
export function humanDuration(msValue: number): string {
  if (msValue < 60_000) return "<1m";
  const mins = Math.floor(msValue / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

export const PHASE_LABELS: Record<LifePhase, string> = {
  visit: "visits",
  work: "work",
  personal: "personal",
  sleep: "sleep",
  untracked: "untracked",
};
