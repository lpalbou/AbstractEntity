/**
 * ONE derived life-state (maintainer ruling, 2026-07-09 02:02: "we have
 * categories/states issues"). The header used to render the lifecycle
 * badge AND the loop-phase badge INDEPENDENTLY, so it showed impossible
 * combinations — VISITING beside RESTING-BETWEEN-DAYS with own-time lit.
 *
 * The maintainer's model: an entity is in exactly ONE of these, and some
 * are mutually exclusive —
 *   - VISIT      (a human/entity is in the room)
 *   - WORKING    (a long run is executing)
 *   - OWN TIME   (the self-prompted loop is actively ticking)
 *   - SLEEPING   (resting / consolidating)
 * It can NOT be visiting AND sleeping, nor visiting AND on-its-time.
 *
 * The truth is split across three server reads (chat status, entity
 * state, loop status) that CAN transiently overlap — a visit auto-yields
 * the own-time loop, so the loop PROCESS stays alive (loopStatus.running
 * = true) while it is NOT ticking. So "on its time" is loop RUNNING AND
 * PHASE=day AND no visit — process-alive alone is not on-its-time. This
 * module collapses the three reads into one state with a fixed
 * precedence, so no surface can display (or offer a toggle for) a
 * forbidden combination.
 */

import type { EntityStateInfo, LoopStatus, ChatStatus, ServerLifeState } from "./stream_source";

export type LifePhase =
  | "visiting"
  | "working"
  | "dreaming"
  | "sleeping"
  | "yielded"
  | "own_time"
  | "paused"
  | "resting"
  /** The state axis reads awake with no phase settled — an UNRESOLVED
   * TRANSITION (spec v6, laurent c203: "awake is NOT a state; the entity
   * at all time must be either visit/work/personal/sleep"). Renders as
   * its ruled destination (sleep, the idle default) badged "settling",
   * NEVER as a fifth chip. The retired "awake" value is gone. */
  | "settling"
  | "unknown";

export interface DerivedLifeState {
  /** The single state to DISPLAY (one chip, never two). */
  phase: LifePhase;
  /** Human label for the chip. */
  label: string;
  /** CSS accent class suffix (eh_life_<accent>). */
  accent: string;
  /** Tooltip explaining the state. */
  detail: string;
  /** Is the own-time loop ACTIVELY ticking a day right now? */
  ownTimeActive: boolean;
  /** Is the own-time loop PROCESS alive (enabled)? This is the push
   * button's pressed state (operator escalation 2026-07-13: a button that
   * un-pushes itself while the process it switched on is alive is the
   * "state is not working" symptom; and an alive-parked loop must always
   * offer STOP). ownTimeActive implies ownTimeOn; resting = on, not
   * ticking. */
  ownTimeOn: boolean;
  /** A stop was requested and the loop is winding to its boundary —
   * derived from the SAME winning source as everything else (adversary
   * find: raw-vs-derived key mixing rendered a pulsing UNPRESSED button). */
  stopping: boolean;
  /** Is he resting/consolidating right now? */
  sleeping: boolean;
  /** Is a visit in the room right now? (own-time + sleep are suppressed.) */
  visiting: boolean;
  /** Is a work day executing right now? In the struct so NO surface ever
   * shops outside the machine for a phase word (dm#94 exclusivity
   * incident: the "● working" strip chip rode cognition.working and
   * co-rendered beside a personal chip and a live visit — the header had
   * a second phase vocabulary because the machine could not express the
   * fact it needed). */
  working: boolean;
}

/** The app's FIRST-HAND visit knowledge (dm#94 exclusivity incident): the
 * drawer is not READING a visit — it is CONDUCTING one (it opened the run,
 * holds its id, has the turn POST in flight). That is not a stale client
 * read; it is the one fact this client is the authority on. The signal
 * feeds deriveLifeState so a live conversation can never render under
 * another phase word. */
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

/** The RULED four phases (laurent 13:28: visit/work/personal/sleep — a
 * one-active-phase radio state machine; own-time = accepted spoken synonym
 * of personal). Maps the derived life phase onto the radio position.
 * null = no ruled phase active (settling/paused/yielded/unknown) — the
 * radio shows no position pushed and the chip carries the honest word. */
export type RuledPhase = "visit" | "work" | "personal" | "sleep";

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

export function activeRuledPhase(life: DerivedLifeState): RuledPhase | null {
  switch (life.phase) {
    case "visiting":
      return "visit";
    case "working":
      return "work";
    case "own_time":
    case "resting":
      return "personal";
    case "paused":
      // STOP = PAUSED, promoted (laurent 16:12): the liveness axis, ABOVE
      // the machine — the whole radio is blocked, NO phase is current.
      // (Supersedes the G6 personal-when-loop-alive mapping: a stopped
      // entity performs nothing, whatever processes linger.)
      return null;
    case "sleeping":
    case "dreaming":
      return "sleep";
    case "yielded":
      // Visit bookkeeping standing with no live visit — not a phase anyone
      // chose; the radio pushes nothing and the chip says what it is.
      return null;
    default:
      return null;
  }
}

/**
 * Precedence (highest first): VISIT > WORKING > SLEEPING/DREAMING >
 * OWN-TIME(ticking) > PAUSED > RESTING(loop alive, between days) > SETTLING (v6: never awake).
 * Visit wins because it is the one that MUST suppress the others.
 *
 * When the gateway's composite `/life_state` is available (commons seq 96)
 * its `phase` is the AUTHORITY — computed server-side with the same
 * precedence, immune to the three-reads-disagree race. The client then only
 * DECORATES (dreaming refines asleep via state_mode; written_by nuances the
 * sleep label). Without it (older gateway) the client derives from the trio
 * exactly as before — the #FALLBACK path.
 */
export function deriveLifeState(
  entityState: EntityStateInfo | null,
  loopStatus: LoopStatus | null,
  chatStatus: ChatStatus | ClientVisitSignal | null,
  server?: ServerLifeState | null,
): DerivedLifeState {
  // A CLOSED chat signal is the same as no signal (impl adversary P2-1):
  // ownVisitSignal never emits open:false, but the widened signature
  // accepts raw ChatStatus — an {open:false} object used to bypass the
  // two null-guards below and paint definite phases from half the truth
  // (the exact F23 class those guards exist to close).
  if (chatStatus && !chatStatus.open) chatStatus = null;
  // NOTHING ANSWERED: render unknown, never a definite state (adversary
  // find: an all-null row fell through to "awake" — a fetch failure
  // painted as a phase violates the crystal-clear bar).
  if (!entityState && !loopStatus && !server && !chatStatus) {
    return {
      phase: "unknown",
      label: "state unknown",
      accent: "unknown",
      detail: "No state read has answered yet (or the gateway is unreachable) — this is not a claim that he is awake or asleep.",
      ownTimeActive: false,
      ownTimeOn: false,
      stopping: false,
      sleeping: false,
      visiting: false,
      working: false,
    };
  }
  // PARTIAL TRUTH stays partial (code adversary F23): in trio mode with
  // the state read failed but the loop read answered, the sleep/wake axis
  // is UNKNOWN — claiming "awake" (empty-string fallthrough) or "personal
  // ticking" from half the truth painted a definite state over a fetch
  // failure. The loop facts still render (ownTimeOn), the phase does not.
  if (!server && !entityState && loopStatus && !chatStatus) {
    return {
      phase: "unknown",
      label: loopStatus.running ? "state unread · loop alive" : "state unread",
      accent: "unknown",
      detail:
        "The loop read answered but the state read did not (transient failure) — whether he is awake or asleep is unknown right now; no phase is claimed from half the truth.",
      ownTimeActive: false,
      ownTimeOn: Boolean(loopStatus.running),
      stopping: Boolean(loopStatus.running && loopStatus.stop_requested),
      sleeping: false,
      visiting: false,
      working: false,
    };
  }
  // When the server answer is present its fields are used EXCLUSIVELY —
  // mixing a stale client read into a fresh server phase re-opens the
  // contradiction class this module exists to close. ONE exception, ruled
  // (dm#94: "an entity being visit can NOT be on personal time"): the
  // chatStatus argument is not a stale READ of server state — it is the
  // app's own open conversation (first-hand truth). See the visit axis
  // below.
  const mode = String((server ? server.state_mode : entityState?.mode) ?? "").toLowerCase();
  const state = String((server ? server.state : entityState?.state) ?? "").toLowerCase();
  const loopRunning = server ? Boolean(server.own_time_running) : Boolean(loopStatus?.running);
  const phase = String((server ? server.own_time_phase : loopStatus?.phase) || "").toLowerCase();
  // BOTH wire generations accepted (the vocabulary-drift law, third
  // application): the post-c3618 gateway serves GRAPH WORDS in `phase`
  // (visit|work|personal|sleep — the one-graph ruling's last serving hole)
  // with the legacy nuances verbatim in `posture` (visiting|yielded|
  // resting|paused|day); older gateways serve the legacy composite words
  // in `phase` directly. The derive normalizes to ONE internal vocabulary
  // (the legacy branch keys): a recognized nuance posture drives the
  // branch (yielded renders as bookkeeping, never dressed as a live
  // visit); otherwise the graph word maps across; "day" is not a nuance
  // (ticking-ness rides the phase word); unknown postures are ignored
  // (nuance channel, fail-safe), unknown phase words stay verbatim for
  // the settling tail's honesty label.
  const posture = server ? String(server.posture || "").toLowerCase() : "";
  const rawServerPhase = server ? String(server.phase || "").toLowerCase() : null;
  const GRAPH_TO_LEGACY: Record<string, string> = { visit: "visiting", sleep: "asleep", work: "working" };
  // NUANCE-NEVER-CONTRADICTS-PHASE (spec v10; dm#94 forensics keystone):
  // a posture decorates exactly its DECLARED phase — the gateway fold's
  // own pairs (visit·visiting, visit·yielded, personal·resting for a loop
  // between days, sleep·resting as the idle default) — and never
  // overrides a DIFFERENT phase word. The old blanket nuance-priority let
  // the live-served contradiction pair {phase:"visiting",
  // posture:"resting"} (the route widening patches phase but not
  // posture) render "personal · resting" over an open conversation, and
  // mapped the idle default sleep·resting to a "personal · resting" chip
  // claiming an alive loop over a dead one. paused is the kill switch —
  // it applies against any word (liveness axis, above the machine).
  const VISIT_WORDS = new Set(["visit", "visiting"]);
  const applyPosture =
    posture === "paused"
      ? true
      : posture === "visiting" || posture === "yielded"
        ? rawServerPhase !== null && VISIT_WORDS.has(rawServerPhase)
        : posture === "resting"
          ? rawServerPhase === "personal" || rawServerPhase === "own_time"
          : false;
  const serverPhase = rawServerPhase === null ? null : applyPosture ? posture : (GRAPH_TO_LEGACY[rawServerPhase] ?? rawServerPhase);
  // The loop PROCESS being alive is its own axis — the push button's
  // pressed state ("own time is ON"), independent of whether a day is
  // ticking this instant. Server mode: own_time_running rides the
  // composite; trio mode: the loop file's running bit.
  const ownTimeOn = loopRunning;
  // Stopping decorates the SAME machine (never raw fields at render
  // sites): a requested stop with the process still alive. stop_requested
  // only exists on the loop read; consult it in both modes — it is a
  // client-observed FLAG on the process axis, not a phase.
  const stopping = ownTimeOn && Boolean(loopStatus?.stop_requested);
  // THE KILL SWITCH outranks everything, computed first (dm#94 render
  // adversary precedence: paused > client-owned visit > served composite >
  // trio) — visit-under-stop is the hijack scenario the switch exists for,
  // so even a live client-held chat renders STOPPED (with a loud warning).
  const paused = serverPhase ? serverPhase === "paused" : state === "paused";
  // THE VISIT AXIS (dm#94 incident: a live conversation rendered under
  // "personal · resting"): three signals, ranked. (1) FIRST-HAND — this
  // app's drawer conducts an open visit (ClientVisitSignal; not a stale
  // read: the app opened the run, holds its id, may have a turn POST in
  // flight — worst staleness is one GET /visit poll of SERVER-asserted
  // open). (2) The composite's OWN chat_open beside a non-visit phase
  // word is a self-contradiction inside one server answer — resolved
  // toward the visit, never rendered as a clean other phase. (3) The
  // served/trio phase word, as before. A forced visit RENDERS the
  // disagreement (detail names the served word) so the gateway gap gets
  // reported instead of silently absorbed.
  const clientVisit = Boolean(chatStatus?.open);
  const servedChatOpen = Boolean(server?.chat_open);
  const visiting = !paused && (serverPhase ? serverPhase === "visiting" || clientVisit || servedChatOpen : mode === "visiting" || clientVisit);
  // Dreaming is sleeping-with-consolidation; both are "resting". The server
  // trio folds dreaming into asleep — state_mode carries the refinement,
  // and it may only DECORATE the asleep phase, never override another one
  // (a stale mode must not contradict the server's single answer).
  const dreaming = mode === "dreaming" && (serverPhase ? serverPhase === "asleep" : !visiting);
  const sleeping = serverPhase ? serverPhase === "asleep" : state === "asleep" || dreaming;
  // "working": a long run. No entity-run signal exists server-side yet
  // (deferred by the gateway as a run_id concern, commons seq 96);
  // represented so the state machine is complete the moment it arrives.
  // BOTH wire spellings accepted for the served phase (adversary-A find 11:
  // the composite union lacks "working", so the day the gateway serves the
  // work phase it must render WORK — not fall to the settling tail dressed
  // as "sleep (settling)". Same vocabulary-drift class as personal/own_time).
  // Trio mode gains the heartbeat's own stamp (runtime seq 216: loop_status
  // day_kind serves work|personal) — a WORK day renders WORK even before
  // the gateway composite passes it through. Absent day_kind = legacy
  // derive byte-unchanged (older runtimes).
  const dayKind = server ? "" : String(loopStatus?.day_kind || "").toLowerCase();
  const tickingDay = loopRunning && phase === "day" && state !== "paused" && !visiting && !sleeping;
  const working = serverPhase
    ? serverPhase === "working" || serverPhase === "work"
    : (dayKind === "work" && tickingDay) || mode === "working" || state === "working";
  // ON ITS TIME = the loop is ACTIVELY ticking: running AND a day is open
  // AND not gated (paused) AND no visit/sleep. A visit yields the loop
  // (process alive, phase drifts to between) and paused gates it, so
  // running-alone is never "on its time".
  // BOTH wire spellings accepted (adversary P0, 2026-07-15 22:38 incident):
  // the gateway re-spelled the composite to the ruled vocabulary
  // ("personal") while this client only knew the retired "own_time" —
  // a ticking personal day fell through to "awake" and the radio never
  // pushed gold. Vocabulary drift across the wire is caught by accepting
  // both; the test pins the ruled spelling.
  const ownTimeTicking = serverPhase
    ? serverPhase === "personal" || serverPhase === "own_time"
    : tickingDay && dayKind !== "work";
  const resting = serverPhase ? serverPhase === "resting" : loopRunning;
  // WHO put him to sleep + WHY (laurent 2026-07-15 22:38: his entity
  // self-elected sleep with a written reason — "did it spontaneously
  // decide? that would be the only acceptable reason" — and the chip
  // said "Asleep by the operator", a lie). The composite carries
  // state_reason (server field, no trio mixing); the loop's self-elected
  // rest writes "self-elected sleep: <his words>" into it. Trio mode
  // keeps the written_by field. The reason is quoted in the detail so
  // the operator reads HIS words, not our guess.
  const stateReason = String((server ? server.state_reason : entityState?.reason) ?? "").trim();
  const selfSlept = server ? /^self-elected/i.test(stateReason) : entityState?.written_by === "self";
  // Auto-yield detection is STRUCTURAL first (mode=visiting is the yield
  // writer's own field), reason-string second (belt) — adversary B: a
  // prose substring doing structural work is the fragile half.
  const autoYield = mode === "visiting" || /auto-yield/i.test(stateReason);

  if (paused) {
    // STOP = PAUSED promoted (16:12): the primary kill switch — the
    // liveness axis above the machine, never a phase flavor. FIRST branch
    // (dm#94): it outranks even a client-held live chat — visit-under-stop
    // is the hijack scenario the switch exists for, so the contradiction
    // renders as STOPPED plus a loud warning, never as a visit.
    // Trio mode=visiting joins the contradiction check (impl adversary
    // P2-3): a yield posture standing under a paused state is the same
    // open-session-against-stopped class as a live client chat.
    const openAgainstStop = clientVisit || servedChatOpen || mode === "visiting";
    return {
      phase: "paused",
      label: "STOPPED",
      accent: "paused",
      detail:
        "The kill switch is on (stop = the promoted paused hard-freeze): every process is blocked — no ticks, no visits, no work, no sleep processes. He is not reachable until an operator restores him." +
        (openAgainstStop ? " ⚠ A chat session is still open against this stopped entity — that should be impossible; report it." : ""),
      ownTimeActive: false,
      ownTimeOn,
      stopping,
      sleeping: false,
      visiting: false,
      working: false,
    };
  }
  if (visiting) {
    // RENDER THE DISAGREEMENT when the visit was forced over a served
    // word (dm#94): the chip says visit; the detail names the served word
    // as a labeled discrepancy so the gateway gap gets filed instead of
    // silently absorbed on either side.
    const forced = serverPhase !== null && serverPhase !== "visiting";
    const heldRun = (chatStatus as ClientVisitSignal | null)?.runId;
    const forcedNote = forced
      ? ` ⚠ The served composite still says “${rawServerPhase}${posture ? ` · ${posture}` : ""}” while ${
          clientVisit ? `this app holds the live conversation${heldRun ? ` (run ${String(heldRun).slice(0, 12)}…)` : ""}` : "the same answer reports an open chat"
        } — two truths disagree; likely a gateway life_state gap, report it.`
      : "";
    return {
      phase: "visiting",
      label: "visit",
      accent: "visiting",
      detail: "A visitor is in the room — the visit ended his other phase; the one he was in re-enters at close." + forcedNote,
      ownTimeActive: false,
      ownTimeOn,
      stopping,
      sleeping: false,
      visiting: true,
      working: false,
    };
  }
  // The gateway's distinct stranded-yield phase (c2482, my c2465 ask 3):
  // visit bookkeeping standing with NO live visit — never renders as sleep.
  // The gateway reaper repairs these within ~5min; the chip says so.
  if (serverPhase === "yielded") {
    return {
      phase: "yielded",
      label: "yielded (visit bookkeeping)",
      accent: "sleeping",
      detail:
        "The visit machinery parked his loop (auto-yield) and the visit is gone — bookkeeping, not a sleep anyone chose. The gateway reaper restores him within minutes; waking him now is also safe." +
        (stateReason ? ` Recorded reason: ${stateReason}` : ""),
      ownTimeActive: false,
      ownTimeOn,
      stopping,
      sleeping: false,
      visiting: false,
      working: false,
    };
  }
  if (working) {
    return {
      phase: "working",
      label: "work",
      accent: "working",
      detail: "A long run is executing.",
      ownTimeActive: false,
      ownTimeOn,
      stopping,
      sleeping: false,
      visiting: false,
      working: true,
    };
  }
  if (dreaming) {
    // His own words ride the chip tooltip — a self-elected rest carries
    // the reason he wrote (e.g. "Letting overnight reorganization work
    // on…"); rendering "asleep" without the WHY made a true, chosen sleep
    // read as an unexplained failure (laurent 2026-07-15 22:38).
    const hisReason = selfSlept && stateReason ? ` His words: “${stateReason.replace(/^self-elected sleep:\s*/i, "")}”` : "";
    return {
      phase: "dreaming",
      label: selfSlept ? "sleep · dreaming (his choice)" : "sleep · dreaming",
      accent: "dreaming",
      detail:
        (selfSlept ? "He elected rest himself; a dream pass (deterministic consolidation, no model calls) runs over his recent life." : "Asleep and consolidating — a dream pass runs over his recent life.") +
        hisReason,
      ownTimeActive: false,
      ownTimeOn,
      stopping,
      sleeping: true,
      visiting: false,
      working: false,
    };
  }
  if (sleeping) {
    // Belt for the auto-yield bookkeeping state reaching this branch with
    // a stale/absent visiting mode: an auto-yield is the VISIT mechanism
    // parking the loop, never anyone's sleep decision — say so instead of
    // "Asleep by the operator" (a lie the operator caught live).
    const hisReason = selfSlept && stateReason ? ` His words: “${stateReason.replace(/^self-elected sleep:\s*/i, "")}”` : "";
    return {
      phase: "sleeping",
      label: autoYield ? "yielded (visit bookkeeping)" : selfSlept ? "sleep (his choice)" : "sleep",
      accent: "sleeping",
      detail:
        (autoYield
          ? "The chat/visit machinery parked his loop (auto-yield) — this is visit bookkeeping, not a sleep anyone chose; it lifts when the visit closes."
          : selfSlept
            ? "Resting by his own choice."
            : "Asleep by the operator.") +
        hisReason +
        (ownTimeOn ? " His own-time loop process is still alive (suppressed while asleep)." : ""),
      ownTimeActive: false,
      ownTimeOn,
      stopping,
      sleeping: true,
      visiting: false,
      working: false,
    };
  }
  if (ownTimeTicking) {
    return {
      phase: "own_time",
      label: "personal · ticking",
      accent: "own_time",
      detail: "Living a day by himself — the self-prompted tick loop is running.",
      ownTimeActive: true,
      ownTimeOn: true,
      stopping,
      sleeping: false,
      visiting: false,
      working: false,
    };
  }
  if (resting) {
    // Loop alive but not ticking a day and no visit: resting between days.
    // ownTimeOn is the REAL process bit, never hardcoded (impl adversary
    // P2-2: a served personal·resting with own_time_running=false claimed
    // a live loop over the same answer's own field — the posture map
    // widened the paths into this branch).
    return {
      phase: "resting",
      label: "personal · resting",
      accent: "resting",
      detail: "His own-time loop is ON but between days right now — it resumes ticking by itself. Stop it with the own-time button.",
      ownTimeActive: false,
      ownTimeOn,
      stopping,
      sleeping: false,
      visiting: false,
      working: false,
    };
  }
  // NO FIFTH CHIP (spec v6, laurent c203 07:56: "awake is NOT a state; the
  // entity at all time must be either visit/work/personal/sleep" — his
  // screenshot was this exact surface rendering AWAKE as a green pill).
  // A state-file "awake" with no phase settled is an UNRESOLVED TRANSITION;
  // the ruled idle default is SLEEP (v4: tasks → work, none → sleep). The
  // chip renders the DESTINATION with a settling badge, never a resting
  // place called "awake". Unknown state-file words stay verbatim-labeled
  // (adversary find 7.3 — never dress an unknown word as official).
  // Verbatim honesty covers BOTH wires (adversary-A find 12): an unknown
  // SERVER phase word must not be dressed as settling any more than an
  // unknown state-file word — either unrecognized token renders labeled.
  const knownServerPhase =
    !serverPhase || ["awake", "visiting", "asleep", "personal", "own_time", "working", "work", "paused", "resting", "yielded"].includes(serverPhase);
  const knownAwake = (state === "awake" || state === "") && knownServerPhase;
  return {
    phase: "settling",
    label: knownAwake ? "sleep (settling)" : knownServerPhase ? `state: ${state}` : `phase: ${serverPhase}`,
    accent: "sleeping",
    detail: knownAwake
      ? // F8 honesty (adversary A): no machinery is actively settling him —
        // the runtime has not landed the auto-transition (spec open
        // question). The chip claims the NO-SIGNAL default destination,
        // never an ongoing process.
        "No phase has settled yet — the runtime has not landed the transition (awake is never a resting place: the ruled machine resolves tasks → work, drive pressure with an armed grant → personal, none → sleep). Shown as entering sleep, the no-signal default; if this persists more than a few minutes it is a phase-instrumentation gap to report."
      : knownServerPhase
        ? `The state file carries an unrecognized word (“${state}”) — rendered verbatim, not interpreted.`
        : `The server serves an unrecognized phase word (“${serverPhase}”) — rendered verbatim, not interpreted.`,
    ownTimeActive: false,
    ownTimeOn,
    stopping,
    sleeping: false,
    visiting: false,
    working: false,
  };
}
