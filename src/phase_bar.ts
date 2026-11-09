/**
 * The phase bar, as pure functions (operator ruling 2026-11-08, root
 * untracked/entity-phases-2026-11-08/TARGET.md; CONTRACT-phases.md v2, 2026-11-09, and
 * CONTRACT-v3-deltas.md: the five-state life cycle): what the top bar shows for one served
 * life_state, what a click asks for, and what a write's answer means. No DOM, so the tests pin
 * every rule.
 *
 * - Five pills, one per state of the life cycle (spec v25 FIVE-STATE-LIFE-CYCLE). `idle`, `visit`,
 *   `work` and `sleep` are indicators (lit when current; a click on visit opens a visit, on sleep
 *   offers "sleep now"; idle and work have no click: idle lights while he is awake with nothing
 *   running, its tooltip the gateway's sentence — the operator's live test 2026-11-09; work lights
 *   while he works, and its tooltip names the current job and since when, and how many jobs are
 *   queued — v3 D1, there is no work switch). `personal` is the one TOGGLE: pressed = allowed, and
 *   it lights as well when it is the current phase. Labels never change (toggles show state, never
 *   verbs; indicators never look like buttons).
 * - What a pill may do, and its tooltip when it may not, come from the served `can` (§1.5), never a
 *   client rule: "sleep now" during a visit or while asleep (§13: only while asleep; once a sleep
 *   has ended, idle included, it is offered again), a toggle while stopped. One exception
 *   the contract asks for (§6.1, §8.3): while stopped the visit pill offers "Resume and visit", two
 *   visible acts, never a silent bypass.
 * - `idle` lights its own indicator (awake, reachable, nothing to do, own time not granted; a
 *   newborn starts there); `stopped` lights nothing and turns the one power button into "Resume".
 * - One power button, apart from the pills: red "Stop" while he runs, "Resume" when stopped. Stop
 *   is the kill switch: never held by a write in flight, a refusal, a failed read or the first
 *   read; only a stopped entity (then Resume) or a gateway without the bar holds it. A stop that
 *   left something outstanding (`complete: false`) keeps a Stop beside Resume, to retry it (§8.7).
 *   v3 D3: Stop also cancels his own time (its confirmation says so before the click, its receipt
 *   after); Resume lands him idle, and own time waits for the operator's grant.
 * - The status line is the gateway's sentence (it carries no clock time) and `since` formatted in
 *   the viewer's time (§8.8), then why he sleeps ("asleep: 24 h since the last sleep", from the
 *   served `sleep.reason`, v3 D2), how many jobs are queued, and "then: own time" / "then: work" /
 *   "then: idle" when the gateway serves where he goes next (`next.phase`); `blocked` is a
 *   warning, with a Retry when the gateway offers that act (`blocked.action == "retry"`, §3.4).
 * - A served sentence wins: the app never adds its own words on top of it (operator 2026-11-09).
 *   What comes after now (`afterLine`) is the gateway's `next.sentence`; only where none is served
 *   does the app say it, by the ruling "own time is a privilege" (TARGET.md): the operator alone
 *   grants or revokes own time, and an interruption returns to it while it is granted.
 * - Every refusal is a sentence: the gateway's message, else the code's (contract §7).
 * - The highest `rev` wins (contract §5), and an answer from before a Stop (a lower `generation`)
 *   never repaints after it: an older read, answer or stream marker never repaints, and a failed
 *   read keeps the newest seen so a late answer cannot repaint over it either.
 */
import { formatExactTime, formatShortDate, timeValueMs } from "@abstractframework/ui-kit";

import { PHASE_BAR_UNSERVED, parsePhaseBar, type PhaseBar, type PhaseCan, type PhaseCanEntry, type PhaseMarker, type PhaseToggles, type PhaseWire, type PhaseWork } from "./phase_bar_source";

export type PhaseSlotKey = "idle" | "visit" | "work" | "personal" | "sleep";
/** Idle first: the state he rests in and returns to (a newborn's, a resumed entity's). */
export const PHASE_SLOT_KEYS: readonly PhaseSlotKey[] = ["idle", "visit", "work", "personal", "sleep"];

/** What a click asks for. */
export type PhaseBarAct = PhaseSlotKey | "stop" | "resume" | "retry";

/** The newest rev and generation a read has seen (the stale rule's floor). */
export interface PhaseSeen {
  rev: number;
  generation: number;
}

/** The bar's read: before the first answer, a gateway without the bar, a failed read, or served.
 * `seen` on an unserved or failed read is the newest rev and generation seen before it (the stale
 * rule outlives a failed read). */
export type PhaseBarRead =
  | { kind: "loading" }
  | { kind: "unserved"; seen?: PhaseSeen }
  | { kind: "failed"; sentence: string; seen?: PhaseSeen }
  | { kind: "served"; bar: PhaseBar };

/** What the bar asks before acting. */
export type PhaseConfirm = "stop" | "sleep" | "resume_visit";

/** The bar's own moment: a toggle, Resume or Retry in flight, a Stop in flight (its own lane: it
 * never waits for the other), whether the last Stop left something outstanding, an inline
 * confirmation open. */
export interface PhaseBarUi {
  busy: PhaseBarAct | null;
  stopping?: boolean;
  stopIncomplete?: boolean;
  confirm: PhaseConfirm | null;
}

export const PHASE_LABELS: Record<PhaseSlotKey, string> = {
  idle: "idle",
  visit: "visit",
  work: "work",
  personal: "personal",
  sleep: "sleep",
};
export const PHASE_GLYPHS: Record<PhaseSlotKey, string> = {
  idle: "○",
  visit: "💬",
  work: "🛠",
  personal: "⏻",
  sleep: "🌙",
};

export interface PhaseSlotView {
  key: PhaseSlotKey;
  /** The phase word, the same in every state. */
  label: string;
  glyph: string;
  /** The current phase. */
  lit: boolean;
  /** The toggle only (personal): own time is allowed. Undefined on indicators. */
  pressed?: boolean;
  disabled: boolean;
  title: string;
  /** A short state word beside the label ("waiting" while a visit waits for him), or "". */
  badge: string;
}

export interface PowerView {
  label: "Stop" | "Resume";
  /** Red: he runs and this stops him. */
  danger: boolean;
  disabled: boolean;
  title: string;
}

export interface PhaseBarView {
  slots: PhaseSlotView[];
  power: PowerView;
  /** A second Stop beside Resume while the last Stop left something outstanding, or null. */
  stopAgain: PowerView | null;
  /** The Retry the gateway offers with `blocked` (`action: "retry"`), or null. */
  retry: { disabled: boolean; title: string } | null;
  /** The one sentence for now ("" while loading). */
  sentence: string;
  /** Since when, in the viewer's time ("since 19:30", "since Nov 7, 23:10"), or "". */
  since: string;
  /** Why he sleeps ("asleep: 24 h since the last sleep"), from the served `sleep.reason`, or "". */
  reason: string;
  /** How many jobs are queued ("2 jobs queued"), or "" when none. */
  queue: string;
  /** Where he goes next ("then: own time"), from the served `next.phase`, or "". */
  then: string;
  /** The sentence's tooltip: since when (exact, viewer-local) and what comes next. */
  sentenceTitle: string;
  /** Why an allowed phase is not running (shown as a warning), or "". */
  blocked: string;
  stopped: boolean;
  /** The bar is served and its controls may act. */
  live: boolean;
}

/** The unlit idle pill: what idle is, said once (the lit pill says the gateway's sentence). */
export const IDLE_NOT_NOW = "Not idle now. He is idle when he is awake and reachable with nothing running: no visit, no job, no own time.";
/** The unlit work pill (v3 D1): no switch, a job starts it. */
export const WORK_IDLE = "Not working now. Work starts when a job is queued for him: a request from you or from an entity allowed to ask him.";
export const PERSONAL_ALLOWED = "Personal time is allowed: he explores his own ideas, sleeps for maintenance when he needs to and wakes by himself.";
export const PERSONAL_NOT_ALLOWED = "Personal time is not allowed: he stays awake and can be visited.";
export const VISIT_OFFER = "Visit him: opens the conversation.";
export const VISIT_SHOW = "Click to see the conversation.";
export const RESUME_AND_VISIT_OFFER = "Click to resume him, then visit.";
export const SLEEP_OFFER = "Sleep now: he rests for his maintenance, then wakes by himself.";
export const STOP_TITLE = "Stop everything at once: any work, any conversation in progress, and his own time, which is cancelled. Nothing starts again until you resume him.";
/** What Stop does, said in its confirmation before the click (v3 D3, operator 2026-11-09). */
export const STOP_CONSEQUENCE = "Stop halts everything now and cancels his own time; after Resume he is idle until you grant own time again.";
export const STOP_AGAIN_TITLE = "Part of the last stop did not finish. Stop again to retry what is left; he stays stopped either way.";
export const RESUME_TITLE = "Resume him: he comes back idle, awake and visitable. His own time starts again only when you grant it.";
export const RETRY_TITLE = "Start his own time again.";
const READING = "Reading his phase…";
/** The app's own lines about own time, only where the gateway serves no `next` (operator ruling
 * 2026-11-09, TARGET.md "Own time is a privilege"). */
export const BACK_AFTER_VISIT = "Back to his own time after the visit.";
export const BACK_AFTER_SLEEP = "Back to his own time when he wakes.";
export const OWN_TIME_OFF = "Own time is off; he stays awake.";

/** What comes after now: the gateway's `next.sentence` when served (it wins, nothing added on
 * top); else the app's line: a visit returns to his own time while personal is granted, and with
 * it revoked he stays awake; a sleep he chose himself returns to his own time while it is granted;
 * idle with own time off says so. "" when there is nothing to say. */
export function afterLine(bar: PhaseBar): string {
  if (bar.next) return bar.next.sentence;
  const granted = bar.toggles.personal;
  if (bar.phase === "visit") return granted ? BACK_AFTER_VISIT : OWN_TIME_OFF;
  if (bar.phase === "sleep" && bar.sleep?.kind === "self" && granted) return BACK_AFTER_SLEEP;
  if (bar.phase === "idle" && !granted) return OWN_TIME_OFF;
  return "";
}

/** Where he goes next, as the gateway serves it (`next.phase`): "then: own time", "then: work",
 * "then: idle"; "" when it serves none. */
export function thenWords(bar: PhaseBar): string {
  const phase = bar.next?.phase;
  if (!phase) return "";
  return `then: ${phase === "personal" ? "own time" : phase}`;
}

/** Since when, in the viewer's time: "since 19:30" today, "since Nov 7, 23:10" another day. */
export function sinceWords(iso: string | null, nowMs: number): string {
  const ms = timeValueMs(iso);
  if (!iso || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return new Date(nowMs).toDateString() === d.toDateString() ? `since ${clock}` : `since ${formatShortDate(ms, nowMs)}, ${clock}`;
}

/** "summon", "work_order" -> "summon", "work order": the served kind, in words. */
const kindWords = (kind: string): string => kind.replace(/_/g, " ");

/** The job he works on now: "Current job: summon, since 18:20." ("" when none runs). */
export function jobLine(work: PhaseWork, nowMs: number): string {
  const job = work.current;
  if (!job) return "";
  const since = sinceWords(job.since, nowMs);
  return `Current job: ${kindWords(job.kind)}${since ? `, ${since}` : ""}.`;
}

/** "1 job queued", "2 jobs queued"; "" when none. */
export function queueWords(work: PhaseWork): string {
  const n = work.jobs_queued;
  return n > 0 ? `${n} ${n === 1 ? "job" : "jobs"} queued` : "";
}

/** Why he sleeps, as served (v3 D2: the threshold that fired): "asleep: 24 h since the last sleep";
 * "" when he is not asleep or no reason is served. */
export function reasonWords(bar: PhaseBar): string {
  const reason = bar.phase === "sleep" ? bar.sleep?.reason?.replace(/\.$/, "") : null;
  return reason ? `asleep: ${reason}` : "";
}

/** "2 jobs queued" -> "2 jobs queued."; "asleep: x" -> "Asleep: x." (a fragment as a tooltip sentence). */
const sentenceOf = (words: string): string => (words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}.` : "");

function slotView(bar: PhaseBar, key: PhaseSlotKey, writing: boolean, offerResume: boolean, nowMs: number): PhaseSlotView {
  const lit = bar.phase === key;
  const base = { key, label: PHASE_LABELS[key], glyph: PHASE_GLYPHS[key], lit };
  switch (key) {
    case "idle":
      // An indicator: nothing to click. Lit (or stopped): the gateway's sentence, then what comes
      // after (the gateway's next, else "Own time is off; he stays awake.").
      return { ...base, disabled: true, title: lit ? [bar.sentence, afterLine(bar)].filter(Boolean).join(" ") : bar.stopped ? bar.sentence : IDLE_NOT_NOW, badge: "" };
    case "visit": {
      const waiting = lit ? (bar.visit?.waiting_for ?? null) : null;
      if (!bar.can.visit.allowed) {
        // Stopped: "Resume and visit", asked first (contract §6.1) — where a Resume is offered.
        const resumeVisit = bar.stopped && offerResume;
        return { ...base, disabled: writing || !resumeVisit, title: resumeVisit ? `${bar.can.visit.sentence} ${RESUME_AND_VISIT_OFFER}` : (bar.can.visit.sentence ?? ""), badge: "" };
      }
      // Lit: the gateway's sentence (it says he is finishing what he was doing while the visit
      // waits), what comes after the visit, and the click.
      return { ...base, disabled: writing, title: lit ? [bar.sentence, afterLine(bar), VISIT_SHOW].filter(Boolean).join(" ") : VISIT_OFFER, badge: waiting ? "waiting" : "" };
    }
    case "work": {
      // An indicator (v3 D1): nothing to click. Lit (or stopped): the gateway's sentence; always
      // the current job (kind, since when) and the queue when the gateway serves them.
      const title = [lit || bar.stopped ? bar.sentence : WORK_IDLE, jobLine(bar.work, nowMs), sentenceOf(queueWords(bar.work))].filter(Boolean).join(" ");
      return { ...base, disabled: true, title, badge: "" };
    }
    case "personal": {
      const can = bar.can.toggle_personal;
      const allowedWords = bar.toggles.personal ? PERSONAL_ALLOWED : PERSONAL_NOT_ALLOWED;
      // Lit: the gateway's sentence. During an interruption: what happens to his own time after it.
      const interrupted = bar.phase === "visit" || bar.phase === "work" || bar.phase === "sleep";
      const title = can.allowed ? [allowedWords, lit ? bar.sentence : interrupted ? afterLine(bar) : ""].filter(Boolean).join(" ") : (can.sentence ?? "");
      return { ...base, pressed: bar.toggles.personal, disabled: writing || !can.allowed, title, badge: "" };
    }
    case "sleep": {
      if (lit) return { ...base, disabled: true, title: [bar.sentence, sentenceOf(reasonWords(bar)), afterLine(bar)].filter(Boolean).join(" "), badge: "" };
      const can = bar.can.sleep_now;
      return { ...base, disabled: writing || !can.allowed, title: can.allowed ? SLEEP_OFFER : (can.sentence ?? ""), badge: "" };
    }
  }
}

export interface PhaseBarViewOptions {
  /** Now, for `since` (tests pass a fixed clock). */
  nowMs?: number;
  /** The bar offers Resume (the entity page; a roster tile does not): only then does the stopped
   * visit pill offer "Resume and visit". */
  resume?: boolean;
}

/** The whole bar for one read and the bar's own moment. */
export function phaseBarView(read: PhaseBarRead, ui: PhaseBarUi, opts: PhaseBarViewOptions = {}): PhaseBarView {
  const nowMs = opts.nowMs ?? Date.now();
  const offerResume = opts.resume !== false;
  if (read.kind !== "served") {
    const sentence = read.kind === "unserved" ? PHASE_BAR_UNSERVED : read.kind === "failed" ? read.sentence : "";
    const title = read.kind === "loading" ? READING : sentence;
    // The kill switch does not wait for the first read or a good one: only a gateway without the
    // bar holds it (its lifecycle route is not there).
    const power: PowerView = read.kind === "unserved" ? { label: "Stop", danger: true, disabled: true, title } : { label: "Stop", danger: true, disabled: false, title: STOP_TITLE };
    return {
      slots: PHASE_SLOT_KEYS.map((key) => ({
        key,
        label: PHASE_LABELS[key],
        glyph: PHASE_GLYPHS[key],
        lit: false,
        pressed: key === "personal" ? false : undefined,
        disabled: true,
        title,
        badge: "",
      })),
      power,
      stopAgain: null,
      retry: null,
      sentence,
      since: "",
      reason: "",
      queue: "",
      then: "",
      sentenceTitle: "",
      blocked: "",
      stopped: false,
      live: false,
    };
  }
  const { bar } = read;
  // While an act (a Stop included) is in flight no pill acts.
  const writing = ui.busy !== null || ui.stopping === true;
  const slots = PHASE_SLOT_KEYS.map((key) => slotView(bar, key, writing, offerResume, nowMs));
  const power: PowerView = bar.stopped
    ? { label: "Resume", danger: false, disabled: writing, title: RESUME_TITLE }
    : // The kill switch: never held by a write in flight (a Stop pressed again sends again).
      { label: "Stop", danger: true, disabled: false, title: STOP_TITLE };
  const stopAgain: PowerView | null = bar.stopped && ui.stopIncomplete === true ? { label: "Stop", danger: true, disabled: false, title: STOP_AGAIN_TITLE } : null;
  const retry = bar.blocked?.action === "retry" && !bar.stopped ? { disabled: writing, title: RETRY_TITLE } : null;
  const exact = bar.since ? `Since ${formatExactTime(bar.since)}.` : "";
  return {
    slots,
    power,
    stopAgain,
    retry,
    sentence: bar.sentence,
    since: sinceWords(bar.since, nowMs),
    reason: reasonWords(bar),
    queue: queueWords(bar.work),
    then: thenWords(bar),
    sentenceTitle: [exact, afterLine(bar)].filter(Boolean).join(" "),
    blocked: bar.blocked?.sentence ?? "",
    stopped: bar.stopped,
    live: true,
  };
}

/** The read a life_state answer gives the bar. */
export function phaseBarRead(wire: PhaseWire): PhaseBarRead {
  if (wire.status === 404 && !wire.code) return { kind: "unserved" };
  if (wire.status === 405) return { kind: "unserved" };
  if (wire.status === 401 || wire.status === 403) return { kind: "failed", sentence: "The gateway did not accept this sign-in for his phase." };
  if (wire.status < 200 || wire.status >= 300) return { kind: "failed", sentence: `Could not read his phase: ${messageOf(wire) || `HTTP ${wire.status}`}` };
  const bar = parsePhaseBar(wire.body);
  return bar ? { kind: "served", bar } : { kind: "unserved" };
}

/** The newest rev and generation the read has seen: its bar's, or what an unserved or failed read
 * kept; zero before the first answer. */
export function phaseSeen(read: PhaseBarRead): PhaseSeen {
  if (read.kind === "served") return { rev: read.bar.rev, generation: read.bar.generation };
  if (read.kind === "loading") return { rev: 0, generation: 0 };
  return read.seen ?? { rev: 0, generation: 0 };
}

/** Stale: older than the newest seen, by rev or by the lifecycle fence (an answer from before a
 * Stop). */
export function isStalePhase(incoming: PhaseSeen, seen: PhaseSeen): boolean {
  return incoming.rev < seen.rev || incoming.generation < seen.generation;
}

/** The highest rev wins (contract §5): `incoming` replaces the read unless the read has already
 * seen a newer bar (a late toggle answer never repaints over the Stop that overtook it). */
export function adoptPhaseBar(read: PhaseBarRead, incoming: PhaseBar): PhaseBarRead {
  if (isStalePhase(incoming, phaseSeen(read))) return read;
  return { kind: "served", bar: incoming };
}

/** Any read answer: a served bar by the stale rule; an unserved or failed read replaces the view
 * but keeps the newest rev and generation seen. */
export function adoptPhaseRead(read: PhaseBarRead, next: PhaseBarRead): PhaseBarRead {
  if (next.kind === "served") return adoptPhaseBar(read, next.bar);
  if (next.kind === "loading") return next;
  const a = phaseSeen(read);
  const b = next.seen ?? { rev: 0, generation: 0 };
  const seen = { rev: Math.max(a.rev, b.rev), generation: Math.max(a.generation, b.generation) };
  return seen.rev > 0 || seen.generation > 0 ? { ...next, seen } : next;
}

/** Until the re-read: nothing may act on a moment the marker changed (phase or stop). */
function heldCan(sentence: string): PhaseCan {
  const held = { allowed: false, sentence };
  return { visit: held, sleep_now: held, toggle_personal: held };
}

/** A stream marker with a higher rev repaints phase, toggles, stop, since and sentence at once; the
 * sub-objects of another phase are dropped until the re-read brings them, and so is `can` when the
 * phase or the stop changed (the controls hold for that moment). Null = nothing to paint (an older
 * or equal rev, a marker from before a Stop, or no served bar yet: the caller re-reads). */
export function adoptPhaseMarker(read: PhaseBarRead, marker: PhaseMarker): PhaseBarRead | null {
  if (read.kind !== "served" || marker.rev <= read.bar.rev || marker.generation < read.bar.generation) return null;
  const old = read.bar;
  const same = old.phase === marker.phase;
  return {
    kind: "served",
    bar: {
      ...old,
      rev: marker.rev,
      generation: marker.generation,
      phase: marker.phase,
      stopped: marker.stopped,
      toggles: marker.toggles,
      since: marker.since,
      sentence: marker.sentence,
      next: null,
      blocked: null,
      can: same && old.stopped === marker.stopped ? old.can : heldCan(READING),
      visit: same ? old.visit : null,
      // The queue keeps its count until the re-read; the current job is that phase's fact.
      work: same ? old.work : { jobs_queued: old.work.jobs_queued, current: null },
      sleep: same ? old.sleep : null,
    },
  };
}

/** What one click asks the app to do. */
export type PhaseActPlan =
  /** The visit is open: show the conversation. */
  | { kind: "show_visit" }
  /** No visit: open the conversation and knock (the Chat tab's button; the visit door answers). */
  | { kind: "open_visit" }
  /** Allow or stop allowing own time (the one toggle; the gateway says what it means now). */
  | { kind: "toggle"; key: keyof PhaseToggles; on: boolean }
  /** Ask first, in the bar. */
  | { kind: "confirm"; confirm: PhaseConfirm }
  | { kind: "resume" }
  | { kind: "retry" }
  /** Stop again, at once: he is already stopped and the last stop left something outstanding. */
  | { kind: "stop" }
  /** Not now, and why. */
  | { kind: "refused"; sentence: string }
  | { kind: "none" };

export function phaseActPlan(read: PhaseBarRead, act: PhaseBarAct): PhaseActPlan {
  // The kill switch before the first read or after a failed one: the gateway answers a stop of a
  // stopped entity with `already: true`, so asking is always safe. Only a gateway without the bar
  // (no lifecycle route) has no Stop.
  if (act === "stop" && (read.kind === "loading" || read.kind === "failed")) return { kind: "confirm", confirm: "stop" };
  if (read.kind !== "served") return { kind: "none" };
  const { bar } = read;
  const refused = (entry: PhaseCanEntry): PhaseActPlan => ({ kind: "refused", sentence: entry.sentence ?? "" });
  switch (act) {
    case "resume":
      return bar.stopped ? { kind: "resume" } : { kind: "none" };
    case "stop":
      // While stopped, Stop again retries what the last stop left (the gateway answers `already`
      // and retries it); nothing more to ask.
      return bar.stopped ? { kind: "stop" } : { kind: "confirm", confirm: "stop" };
    case "retry":
      return bar.blocked?.action === "retry" && !bar.stopped ? { kind: "retry" } : { kind: "none" };
    case "visit":
      if (!bar.can.visit.allowed) return bar.stopped ? { kind: "confirm", confirm: "resume_visit" } : refused(bar.can.visit);
      return bar.phase === "visit" ? { kind: "show_visit" } : { kind: "open_visit" };
    case "idle":
      // An indicator: idle is where he rests, never a request.
      return { kind: "none" };
    case "work":
      // An indicator: there is no work switch (v3 D1).
      return { kind: "none" };
    case "personal": {
      const can = bar.can.toggle_personal;
      return can.allowed ? { kind: "toggle", key: "personal", on: !bar.toggles.personal } : refused(can);
    }
    case "sleep":
      if (bar.phase === "sleep") return { kind: "none" };
      return bar.can.sleep_now.allowed ? { kind: "confirm", confirm: "sleep" } : refused(bar.can.sleep_now);
  }
}

/** The contract's sentences (§1.5, §6, §7) for an answer that carries a code but no words. */
export const REFUSAL_SENTENCES: Record<string, string> = {
  stopped_use_resume: "Stopped. Resume him first, then choose what he may do.",
  in_visit: "He is in a visit; end it to let him sleep.",
  already_asleep: "He is already resting; a sleep cannot follow a sleep.",
  entity_archived: "This entity is archived; restore it from the roster first.",
  unknown_field: "There is no work switch: work starts when a job is queued.",
  invalid_body: "The request body is not valid JSON.",
  invalid_toggles: "Say whether own time is allowed: personal, true or false.",
  invalid_action: "The action is stop, resume or retry.",
  entity_not_found: "There is no entity by this name.",
};
/** admin_required's own words are machine words ("Admin principal required."): always this one. */
export const ADMIN_REQUIRED = "Only an admin can grant his own time, stop or resume him.";

function messageOf(wire: PhaseWire): string {
  const b = wire.body;
  if (!b) return "";
  const d = b.detail;
  if (typeof d === "string" && d.trim()) return d.trim();
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const m = (d as Record<string, unknown>).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return typeof b.message === "string" ? b.message.trim() : "";
}

/** What a write's answer means: the bar it carries (the answer's GET shape, or a refusal's
 * `detail.life_state`), the one sentence to show, and whether a stop left something outstanding
 * (`complete: false`: press Stop again to retry it). A stop's receipt is its items' words: each
 * item that failed (its sentence, else which one) and each item the gateway words (v3 D3: "Own
 * time was revoked."). */
export interface PhaseWriteOutcome {
  ok: boolean;
  bar: PhaseBar | null;
  sentence: string | null;
  incomplete: boolean;
}

export function phaseWriteOutcome(wire: PhaseWire): PhaseWriteOutcome {
  if (wire.status >= 200 && wire.status < 300) {
    const bar = parsePhaseBar(wire.body);
    const items = Array.isArray(wire.body?.items) ? (wire.body!.items as unknown[]) : [];
    const receipt = items
      .filter((i): i is Record<string, unknown> => Boolean(i) && typeof i === "object")
      .map((i) => {
        const said = typeof i.sentence === "string" ? i.sentence.trim() : "";
        return said || (i.outcome === "failed" ? `One part of the stop did not finish (${String(i.code ?? i.item ?? "unknown")}).` : "");
      })
      .filter(Boolean);
    // A stop says what its items say (a part that failed, own time revoked); a toggle or a retry
    // says what happens next: the gateway's words ("When the visit closes, his own time
    // resumes."), else the app's ("Own time is off; he stays awake.").
    return { ok: true, bar, sentence: receipt.length ? receipt.join(" ") : (bar ? afterLine(bar) || null : null), incomplete: wire.body?.complete === false };
  }
  const detail = wire.body && typeof wire.body.detail === "object" && !Array.isArray(wire.body.detail) ? (wire.body.detail as Record<string, unknown>) : null;
  const carried = parsePhaseBar(detail?.life_state);
  if (wire.status === 401) return { ok: false, bar: carried, sentence: "Sign in again: the gateway did not accept this sign-in.", incomplete: false };
  if (wire.code === "admin_required" || (wire.status === 403 && !messageOf(wire))) return { ok: false, bar: carried, sentence: ADMIN_REQUIRED, incomplete: false };
  // A 404 without a code is a missing route, not a missing entity.
  if ((wire.status === 404 || wire.status === 405) && !wire.code) return { ok: false, bar: null, sentence: PHASE_BAR_UNSERVED, incomplete: false };
  const coded = wire.code ? REFUSAL_SENTENCES[wire.code] : undefined;
  return { ok: false, bar: carried, sentence: messageOf(wire) || coded || `The gateway refused (HTTP ${wire.status}).`, incomplete: false };
}
