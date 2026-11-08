/**
 * The phase bar, as pure functions (operator ruling 2026-11-08, root
 * untracked/entity-phases-2026-11-08/TARGET.md; CONTRACT-phases.md v1): what the top bar shows for
 * one served life_state, what a click asks for, and what a write's answer means. No DOM, so the
 * tests pin every rule.
 *
 * - Four pills. `visit` and `sleep` are indicators (lit when current; a click opens a visit /
 *   offers "sleep now"). `work` and `personal` are TOGGLES: pressed = allowed, and they light as
 *   well when they are the current phase. Labels never change (toggles show state, never verbs).
 * - `idle` lights nothing (awake, reachable, nothing of his own running); `stopped` lights nothing
 *   either, holds every pill (contract §8.3) and turns the one power button into "Resume".
 * - One power button, apart from the pills: red "Stop" while he runs, "Resume" when stopped.
 * - The status line is the gateway's own sentence for now (it carries the time); `since` is its
 *   exact viewer-local time in the tooltip, `next` the tooltip's second line, `blocked` a warning.
 * - Every refusal is a sentence: the gateway's message, else the code's (contract §7).
 * - The highest `rev` wins (contract §5): an older read, answer or stream marker never repaints.
 */
import { formatExactTime } from "@abstractframework/ui-kit";

import { PHASE_BAR_UNSERVED, parsePhaseBar, type PhaseBar, type PhaseMarker, type PhaseToggles, type PhaseWire } from "./phase_bar_source";

export type PhaseSlotKey = "visit" | "work" | "personal" | "sleep";
export const PHASE_SLOT_KEYS: readonly PhaseSlotKey[] = ["visit", "work", "personal", "sleep"];

/** What a click asks for. */
export type PhaseBarAct = "visit" | "work" | "personal" | "sleep" | "stop" | "resume";

/** The bar's read: before the first answer, a gateway without the bar, a failed read, or served. */
export type PhaseBarRead =
  | { kind: "loading" }
  | { kind: "unserved" }
  | { kind: "failed"; sentence: string }
  | { kind: "served"; bar: PhaseBar };

/** The bar's own moment: an act in flight, an inline confirmation open. */
export interface PhaseBarUi {
  busy: PhaseBarAct | null;
  confirm: "stop" | "sleep" | null;
}

export const PHASE_LABELS: Record<PhaseSlotKey, string> = {
  visit: "visit",
  work: "work",
  personal: "personal",
  sleep: "sleep",
};
export const PHASE_GLYPHS: Record<PhaseSlotKey, string> = {
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
  /** Toggles only (work, personal): the phase is allowed. Undefined on indicators. */
  pressed?: boolean;
  disabled: boolean;
  title: string;
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
  /** The one sentence for now ("" while loading). */
  sentence: string;
  /** The sentence's tooltip: since when (viewer-local) and what comes next. */
  sentenceTitle: string;
  /** Why an allowed phase is not running (shown as a warning), or "". */
  blocked: string;
  stopped: boolean;
  /** The bar is served and its controls may act. */
  live: boolean;
}

export const WORK_ALLOWED = "Work is allowed: automations, assigned tasks and requests may run.";
export const WORK_NOT_ALLOWED = "Work is not allowed: nothing new is assigned to him.";
export const PERSONAL_ALLOWED = "Personal time is allowed: he explores his own ideas, sleeps for maintenance when he needs to and wakes by himself.";
export const PERSONAL_NOT_ALLOWED = "Personal time is not allowed: he stays awake and can be visited.";
export const VISIT_OFFER = "Visit him: opens the conversation.";
export const VISIT_SHOW = "Click to see the conversation.";
export const SLEEP_OFFER = "Sleep now: he rests for his maintenance, then wakes by himself.";
export const SLEEP_DURING_VISIT = "A visit is open; he can sleep once it closes.";
export const STOP_TITLE = "Stop everything at once: his own time, any work, any conversation in progress. Nothing starts again until you resume him.";
export const RESUME_TITLE = "Resume him: his own time starts again if personal time is allowed, and visits can open.";
const READING = "Reading his phase…";

function slotTitle(bar: PhaseBar, key: PhaseSlotKey): string {
  const lit = bar.phase === key;
  if (bar.stopped) return bar.sentence;
  switch (key) {
    case "visit":
      return lit ? `${bar.sentence} ${VISIT_SHOW}` : VISIT_OFFER;
    case "work":
      return `${bar.toggles.work ? WORK_ALLOWED : WORK_NOT_ALLOWED}${lit ? ` ${bar.sentence}` : ""}`;
    case "personal":
      return `${bar.toggles.personal ? PERSONAL_ALLOWED : PERSONAL_NOT_ALLOWED}${lit ? ` ${bar.sentence}` : ""}`;
    case "sleep":
      if (lit) return bar.next ? `${bar.sentence} ${bar.next.sentence}` : bar.sentence;
      return bar.phase === "visit" ? SLEEP_DURING_VISIT : SLEEP_OFFER;
  }
}

/** The whole bar for one read and the bar's own moment. */
export function phaseBarView(read: PhaseBarRead, ui: PhaseBarUi): PhaseBarView {
  if (read.kind !== "served") {
    const sentence = read.kind === "unserved" ? PHASE_BAR_UNSERVED : read.kind === "failed" ? read.sentence : "";
    const title = read.kind === "loading" ? READING : sentence;
    return {
      slots: PHASE_SLOT_KEYS.map((key) => ({
        key,
        label: PHASE_LABELS[key],
        glyph: PHASE_GLYPHS[key],
        lit: false,
        pressed: key === "work" || key === "personal" ? false : undefined,
        disabled: true,
        title,
      })),
      power: { label: "Stop", danger: true, disabled: true, title },
      sentence,
      sentenceTitle: "",
      blocked: "",
      stopped: false,
      live: false,
    };
  }
  const { bar } = read;
  const writing = ui.busy !== null;
  const slots = PHASE_SLOT_KEYS.map((key): PhaseSlotView => {
    const lit = bar.phase === key;
    return {
      key,
      label: PHASE_LABELS[key],
      glyph: PHASE_GLYPHS[key],
      lit,
      pressed: key === "work" || key === "personal" ? bar.toggles[key] : undefined,
      // While stopped every pill holds (contract §8.3: Resume first); while an act is in flight
      // nothing else acts; a lit sleep pill has nothing to offer (a sleep never follows a sleep).
      disabled: bar.stopped || writing || (key === "sleep" && lit),
      title: slotTitle(bar, key),
    };
  });
  const power: PowerView = bar.stopped
    ? { label: "Resume", danger: false, disabled: writing, title: RESUME_TITLE }
    : { label: "Stop", danger: true, disabled: writing, title: STOP_TITLE };
  const since = bar.since ? `Since ${formatExactTime(bar.since)}.` : "";
  return {
    slots,
    power,
    sentence: bar.sentence,
    sentenceTitle: [since, bar.next?.sentence ?? ""].filter(Boolean).join(" "),
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

/** The highest rev wins (contract §5): `incoming` replaces the read unless the read already holds a
 * newer bar. */
export function adoptPhaseBar(read: PhaseBarRead, incoming: PhaseBar): PhaseBarRead {
  if (read.kind === "served" && incoming.rev < read.bar.rev) return read;
  return { kind: "served", bar: incoming };
}

/** A stream marker with a higher rev repaints phase, toggles, stop, since and sentence at once; the
 * sub-objects of another phase are dropped until the re-read brings them. Null = nothing to paint
 * (an older or equal rev, or no served bar yet: the caller re-reads). */
export function adoptPhaseMarker(read: PhaseBarRead, marker: PhaseMarker): PhaseBarRead | null {
  if (read.kind !== "served" || marker.rev <= read.bar.rev) return null;
  const old = read.bar;
  const same = old.phase === marker.phase;
  return {
    kind: "served",
    bar: {
      ...old,
      rev: marker.rev,
      phase: marker.phase,
      stopped: marker.stopped,
      toggles: marker.toggles,
      since: marker.since,
      sentence: marker.sentence,
      next: null,
      blocked: null,
      visit: same ? old.visit : null,
      work: same ? old.work : null,
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
  /** Allow or stop allowing a phase (the gateway says what it means now). */
  | { kind: "toggle"; key: keyof PhaseToggles; on: boolean }
  /** Ask first, in the bar. */
  | { kind: "confirm"; confirm: "stop" | "sleep" }
  | { kind: "resume" }
  /** Not now, and why. */
  | { kind: "refused"; sentence: string }
  | { kind: "none" };

export function phaseActPlan(read: PhaseBarRead, act: PhaseBarAct): PhaseActPlan {
  if (read.kind !== "served") return { kind: "none" };
  const { bar } = read;
  if (act === "resume") return bar.stopped ? { kind: "resume" } : { kind: "none" };
  if (act === "stop") return bar.stopped ? { kind: "none" } : { kind: "confirm", confirm: "stop" };
  if (bar.stopped) return { kind: "none" };
  switch (act) {
    case "visit":
      return bar.phase === "visit" ? { kind: "show_visit" } : { kind: "open_visit" };
    case "work":
    case "personal":
      return { kind: "toggle", key: act, on: !bar.toggles[act] };
    case "sleep":
      if (bar.phase === "sleep") return { kind: "none" };
      // The operator sleep would end the conversation in progress: never from this pill.
      if (bar.phase === "visit") return { kind: "refused", sentence: SLEEP_DURING_VISIT };
      return { kind: "confirm", confirm: "sleep" };
  }
}

/** The contract's sentences (§2, §3, §6.1, §7) for an answer that carries a code but no words. */
export const REFUSAL_SENTENCES: Record<string, string> = {
  stopped_use_resume: "He is stopped. Resume him first, then choose what he may do.",
  entity_paused: "He is stopped. Resume him to visit.",
  entity_archived: "This entity is archived; restore it from the roster first.",
  already_asleep: "He is already resting; a sleep cannot follow a sleep.",
  work_off: "Work is off for him; turn Work on to send him requests.",
  invalid_toggles: "Say which to change: work, personal or both, each true or false.",
  invalid_action: "The action is stop or resume.",
  entity_not_found: "There is no entity by this name.",
};
/** admin_required's own words are machine words ("Admin principal required"): always this one. */
export const ADMIN_REQUIRED = "Only an admin can change what he may do, stop or resume him.";

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
 * `detail.life_state`), and the one sentence to show. */
export interface PhaseWriteOutcome {
  ok: boolean;
  bar: PhaseBar | null;
  sentence: string | null;
}

export function phaseWriteOutcome(wire: PhaseWire): PhaseWriteOutcome {
  if (wire.status >= 200 && wire.status < 300) {
    const bar = parsePhaseBar(wire.body);
    const failures = Array.isArray(wire.body?.failures) ? (wire.body!.failures as unknown[]) : [];
    const failed = failures
      .map((f) => (f && typeof f === "object" ? (f as Record<string, unknown>).sentence : null))
      .filter((s): s is string => typeof s === "string" && s.trim() !== "");
    // A stop that stands with a step that failed says which; a toggle says what happens next
    // ("When the visit closes, his own time resumes.").
    return { ok: true, bar, sentence: failed.length ? failed.join(" ") : (bar?.next?.sentence ?? null) };
  }
  const detail = wire.body && typeof wire.body.detail === "object" && !Array.isArray(wire.body.detail) ? (wire.body.detail as Record<string, unknown>) : null;
  const carried = parsePhaseBar(detail?.life_state);
  if (wire.status === 401) return { ok: false, bar: carried, sentence: "Sign in again: the gateway did not accept this sign-in." };
  if (wire.code === "admin_required" || (wire.status === 403 && !messageOf(wire))) return { ok: false, bar: carried, sentence: ADMIN_REQUIRED };
  // A 404 without a code is a missing route, not a missing entity.
  if ((wire.status === 404 || wire.status === 405) && !wire.code) return { ok: false, bar: null, sentence: PHASE_BAR_UNSERVED };
  const coded = wire.code ? REFUSAL_SENTENCES[wire.code] : undefined;
  return { ok: false, bar: carried, sentence: messageOf(wire) || coded || `The gateway refused (HTTP ${wire.status}).` };
}
