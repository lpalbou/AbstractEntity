/**
 * What remains of the client-side life-state machine (2026-11-08): the phase itself is served
 * whole by `GET /life_state` and drawn by the phase bar (phase_bar.ts, CONTRACT-phases.md), so the
 * old client derive over /state, /loop and /life_state (and its radio mapping) is gone. Two pure
 * folds stay: the drawer's first-hand visit signal (it CONDUCTS a visit, dm#94) and the day-gate's
 * cause line.
 */

/** The app's FIRST-HAND visit knowledge (dm#94 exclusivity incident): the
 * drawer is not READING a visit — it is CONDUCTING one (it opened the run,
 * holds its id, has the turn POST in flight). That is not a stale client
 * read; it is the one fact this client is the authority on. The entity page
 * counts it with the served phase, so a live conversation can never render
 * under another phase word. */
export interface ClientVisitSignal {
  open: boolean;
  /** The open visit's run id, when known. */
  runId?: string | null;
  /** A turn POST is in flight RIGHT NOW — not stale by any definition. */
  midTurn?: boolean;
  /** THIS app's drawer holds the session (stored run id corroborated by
   * the latest GET /visit poll). False = the poll says A visit is open
   * but another door conducts it — still server-asserted truth. */
  owned?: boolean;
}

/** Fold the drawer's three facts (the GET /visit poll, the held run id,
 * the busy state) into the visit signal — a pure function so the forcing
 * rule is pinnable without a component harness. Rules (render adversary
 * pin 7): mid-turn forces even when the poll is older than the turn; a
 * poll-asserted open visit forces (worst staleness = one poll period of
 * SERVER-asserted open — the drawer clears runId the moment the poll says
 * closed); a closed poll never forces, regardless of any held run id. */
export function ownVisitSignal(
  status: { open?: boolean; run_id?: string | null } | null | undefined,
  runId: string | null | undefined,
  busy?: string | null,
): ClientVisitSignal | null {
  if (busy === "turn") return { open: true, runId: runId ?? null, midTurn: true, owned: true };
  if (status?.open) {
    const sid = status.run_id == null || status.run_id === "" ? null : String(status.run_id);
    return { open: true, runId: sid, midTurn: false, owned: Boolean(runId && sid && sid === runId) };
  }
  return null;
}

/** WHY the day-gate chose what it chose (DRIVES-ARE-DRIVERS v7/v8; wire
 * shape = loop_status.day_cause, runtime room seq 269). One fold from the
 * machine's words to the operator's line — plain words, never a duty
 * frame; unknown kinds render verbatim-labeled (the honesty pattern).
 * Returns null when absent (pre-gate runtimes — absence is not a claim). */
export function dayCauseLine(cause: { kind?: string; detail?: string } | null | undefined): { text: string; warn: boolean } | null {
  if (!cause || typeof cause !== "object") return null;
  const kind = String(cause.kind || "").toLowerCase();
  const detail = String(cause.detail || "").trim();
  if (!kind) return null;
  const tail = detail ? ` — ${detail}` : "";
  switch (kind) {
    case "work_order":
      return { text: `work day: a task stands${tail}`, warn: false };
    case "drives":
      return { text: `personal day arose from his desk${tail}`, warn: false };
    case "settled_desk":
      return { text: `settled desk — sleeping until something stands${tail}`, warn: false };
    case "no_grant":
      return { text: `no personal grant — sleeping with his desk as wake reasons${tail}`, warn: false };
    case "granted_unused":
      // v9 sleep-preemption rule (c): the grant was given to be USED — the
      // gate opened a personal day because <2h of granted time was spent
      // (runtime's use-floor leg, room seq 291).
      return { text: `personal day — the grant stood unused${tail}`, warn: false };
    case "grant_degraded":
      // The loud-degrade lane (adversary B F7): an engine read failed —
      // the day fell back; the operator must SEE it, never a quiet line.
      return { text: `#FALLBACK day-gate degrade${tail}`, warn: true };
    default:
      return { text: `day cause: ${kind}${tail}`, warn: false };
  }
}
