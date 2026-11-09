/**
 * The phase bar's pure rules (operator ruling 2026-11-08, CONTRACT-phases v2 + the v3 deltas: the
 * five-state life cycle): state -> view (which pill is lit, the one toggle pressed, what `can`
 * allows, the work indicator and its queue, why he sleeps, the power button, the sentence and
 * since), click -> plan, and the stale rule (rev + generation) for reads, answers and stream
 * markers.
 */
import { describe, expect, it } from "vitest";

import { ALREADY_ASLEEP, CAN_ALL, IN_VISIT, LOOP_CRASHED, NO_JOBS, OWN_TIME_REVOKED, REVOKED_ITEM, STOPPED_SLEEP, STOPPED_TOGGLE, STOPPED_VISIT, phaseBody } from "./fixtures/phase_bodies";
import {
  BACK_AFTER_SLEEP,
  BACK_AFTER_VISIT,
  OWN_TIME_OFF,
  PERSONAL_ALLOWED,
  PERSONAL_NOT_ALLOWED,
  RESUME_AND_VISIT_OFFER,
  RESUME_TITLE,
  RETRY_TITLE,
  SLEEP_OFFER,
  STOP_AGAIN_TITLE,
  STOP_TITLE,
  VISIT_OFFER,
  VISIT_SHOW,
  WORK_IDLE,
  REFUSAL_SENTENCES,
  adoptPhaseBar,
  adoptPhaseMarker,
  adoptPhaseRead,
  isStalePhase,
  phaseActPlan,
  phaseBarRead,
  phaseBarView,
  phaseWriteOutcome,
  sinceWords,
  thenWords,
  afterLine,
  jobLine,
  queueWords,
  reasonWords,
  type PhaseBarRead,
  type PhaseBarUi,
} from "./phase_bar";
import { PHASE_BAR_UNSERVED, parsePhaseMarker, type ServedPhase } from "./phase_bar_source";

const IDLE_UI: PhaseBarUi = { busy: null, confirm: null };
const NOW = Date.parse("2026-11-08T20:00:00.000+00:00");
const served = (phase: ServedPhase, overrides: Record<string, unknown> = {}): PhaseBarRead => {
  const read = phaseBarRead({ status: 200, code: null, body: phaseBody(phase, overrides) });
  if (read.kind !== "served") throw new Error("fixture did not parse");
  return read;
};
const view = (read: PhaseBarRead, ui: PhaseBarUi = IDLE_UI, opts = {}) => phaseBarView(read, ui, { nowMs: NOW, ...opts });
const slot = (read: PhaseBarRead, key: string, ui: PhaseBarUi = IDLE_UI, opts = {}) => view(read, ui, opts).slots.find((s) => s.key === key)!;
const lit = (read: PhaseBarRead) => view(read).slots.filter((s) => s.lit).map((s) => s.key);
const pressed = (read: PhaseBarRead) => Object.fromEntries(view(read).slots.filter((s) => s.pressed !== undefined).map((s) => [s.key, s.pressed]));
const refusedCan = (sentence: string) => ({ allowed: false, sentence });

describe("which pill is lit: exactly the served phase, none for idle and stopped", () => {
  it.each(["visit", "work", "personal", "sleep"] as const)("%s lights only %s", (phase) => {
    expect(lit(served(phase))).toEqual([phase]);
  });
  it("idle lights nothing; its sentence is the gateway's", () => {
    expect(lit(served("idle"))).toEqual([]);
    expect(view(served("idle")).sentence).toBe("Awake and reachable; nothing of his own is running.");
  });
  it("stopped lights nothing", () => {
    expect(lit(served("stopped"))).toEqual([]);
  });
});

describe("the one toggle (v3 D1): personal is pressed = allowed, the label never changes", () => {
  it("personal is the only toggle; visit, work and sleep are indicators (no pressed state)", () => {
    expect(view(served("personal")).slots.map((s) => [s.key, s.pressed])).toEqual([
      ["visit", undefined],
      ["work", undefined],
      ["personal", true],
      ["sleep", undefined],
    ]);
  });
  it("pressed follows the toggle, whatever the phase", () => {
    expect(pressed(served("idle"))).toEqual({ personal: false });
    expect(pressed(served("work"))).toEqual({ personal: true });
    expect(pressed(served("visit", { toggles: { personal: false } }))).toEqual({ personal: false });
  });
  it("the toggle is lit AND pressed when it is the current, allowed phase; lit and not pressed when turned off mid-phase", () => {
    const on = slot(served("personal"), "personal");
    expect([on.lit, on.pressed]).toEqual([true, true]);
    const winding = slot(served("personal", { toggles: { personal: false } }), "personal");
    expect([winding.lit, winding.pressed]).toEqual([true, false]);
  });
  it("labels and glyphs are the same in every state", () => {
    const labels = new Set((["visit", "work", "personal", "sleep", "stopped", "idle"] as const).map((p) => JSON.stringify(view(served(p)).slots.map((s) => [s.label, s.glyph]))));
    expect(labels.size).toBe(1);
    expect([...labels][0]).toBe(JSON.stringify([["visit", "💬"], ["work", "🛠"], ["personal", "⏻"], ["sleep", "🌙"]]));
  });
  it("titles say what the toggle allows; the unlit work pill says a job starts it", () => {
    expect(slot(served("idle"), "work").title).toBe(WORK_IDLE);
    // Who queues work today: the guardian or an entity allowed to ask (no automation reaches an entity).
    expect(WORK_IDLE).toBe("Not working now. Work starts when a job is queued for him: a request from you or from an entity allowed to ask him.");
    expect(WORK_IDLE).not.toMatch(/automation/i);
    expect(slot(served("idle"), "personal").title).toBe(PERSONAL_NOT_ALLOWED);
    expect(slot(served("personal"), "personal").title).toBe(`${PERSONAL_ALLOWED} On his own time.`);
  });
});

describe("can drives every control (contract §1.5, §8.3)", () => {
  it("the toggle the gateway does not allow is disabled, its tooltip the gateway's sentence; the click is refused with it", () => {
    const read = served("idle", { can: { ...CAN_ALL, toggle_personal: refusedCan("This entity is archived.") } });
    expect(slot(read, "personal")).toMatchObject({ disabled: true, title: "This entity is archived.", pressed: false });
    expect(phaseActPlan(read, "personal")).toEqual({ kind: "refused", sentence: "This entity is archived." });
    // Work is no control at all: never a toggle, whatever can says.
    expect(slot(read, "work")).toMatchObject({ disabled: true, title: WORK_IDLE });
    expect(phaseActPlan(read, "work")).toEqual({ kind: "none" });
  });
  it("sleep now during a visit: disabled with the gateway's in_visit sentence (a visit is never ended implicitly)", () => {
    expect(slot(served("visit"), "sleep")).toMatchObject({ disabled: true, title: IN_VISIT });
    expect(phaseActPlan(served("visit"), "sleep")).toEqual({ kind: "refused", sentence: IN_VISIT });
  });
  it("sleep now is refused only while asleep (contract §13): after a sleep has ended, idle included, it is offered again", () => {
    // Asleep: the pill is lit and holds; the click asks for nothing.
    expect(slot(served("sleep"), "sleep")).toMatchObject({ lit: true, disabled: true });
    expect(phaseActPlan(served("sleep"), "sleep")).toEqual({ kind: "none" });
    // Woken into idle (own time off): the gateway allows it, so the bar offers it.
    const woke = served("idle", { toggles: { personal: false } });
    expect(slot(woke, "sleep")).toMatchObject({ disabled: false, title: SLEEP_OFFER });
    expect(phaseActPlan(woke, "sleep")).toEqual({ kind: "confirm", confirm: "sleep" });
  });
  it("a refusal the gateway serves is followed in any phase, with its words", () => {
    const read = served("idle", { can: { ...CAN_ALL, sleep_now: refusedCan(ALREADY_ASLEEP) } });
    expect(slot(read, "sleep")).toMatchObject({ disabled: true, title: ALREADY_ASLEEP });
    expect(phaseActPlan(read, "sleep")).toEqual({ kind: "refused", sentence: ALREADY_ASLEEP });
  });
  it("sleep now when allowed: offered, asked first; a lit sleep holds with its sentence and what comes next", () => {
    expect(slot(served("personal"), "sleep")).toMatchObject({ disabled: false, title: SLEEP_OFFER });
    expect(phaseActPlan(served("personal"), "sleep")).toEqual({ kind: "confirm", confirm: "sleep" });
    expect(slot(served("sleep"), "sleep")).toMatchObject({
      lit: true,
      disabled: true,
      title: "Resting for maintenance; wakes when done. Asleep: maintenance requested. When maintenance is done he wakes and his own time resumes.",
    });
    expect(phaseActPlan(served("sleep"), "sleep")).toEqual({ kind: "none" });
  });
  it("the client never invents a refusal the gateway did not serve: sleep now offered during a visit if can says so", () => {
    const read = served("visit", { can: CAN_ALL });
    expect(slot(read, "sleep").disabled).toBe(false);
    expect(phaseActPlan(read, "sleep")).toEqual({ kind: "confirm", confirm: "sleep" });
  });
});

describe("visit: open, show, wait, and Resume and visit while stopped", () => {
  it("unlit visit offers a visit; lit visit shows it", () => {
    expect(slot(served("idle"), "visit").title).toBe(VISIT_OFFER);
    expect(phaseActPlan(served("idle"), "visit")).toEqual({ kind: "open_visit" });
    expect(phaseActPlan(served("visit"), "visit")).toEqual({ kind: "show_visit" });
    expect(slot(served("visit"), "visit")).toMatchObject({ title: `In a visit with Laurent. When the visit closes, his own time resumes. ${VISIT_SHOW}`, badge: "" });
  });
  it("a visit that waits for him: 'waiting' beside the label; the tooltip is the gateway's sentence, which says it, with no words of the app's on top", () => {
    const waitingSentence = "In a visit with Laurent; he is finishing what he was doing.";
    const visit = (waiting_for: string) => served("visit", { sentence: waitingSentence, visit: { ...(phaseBody("visit").visit as object), waiting_for } });
    for (const w of ["loop", "maintenance"]) {
      expect(slot(visit(w), "visit")).toMatchObject({ badge: "waiting", lit: true, label: "visit" });
      expect(slot(visit(w), "visit").title).toBe(`${waitingSentence} When the visit closes, his own time resumes. ${VISIT_SHOW}`);
    }
  });
  it("stopped: the visit pill offers 'Resume and visit', asked first (two visible acts, never a silent bypass)", () => {
    expect(slot(served("stopped"), "visit")).toMatchObject({ disabled: false, title: `${STOPPED_VISIT} ${RESUME_AND_VISIT_OFFER}` });
    expect(phaseActPlan(served("stopped"), "visit")).toEqual({ kind: "confirm", confirm: "resume_visit" });
  });
  it("on a roster tile (no Resume there) the stopped visit pill only says why", () => {
    expect(slot(served("stopped"), "visit", IDLE_UI, { resume: false })).toMatchObject({ disabled: true, title: STOPPED_VISIT });
  });
  it("a visit refused for another reason (archived) is refused with the gateway's words", () => {
    const read = served("idle", { can: { ...CAN_ALL, visit: refusedCan("This entity is archived.") } });
    expect(slot(read, "visit")).toMatchObject({ disabled: true, title: "This entity is archived." });
    expect(phaseActPlan(read, "visit")).toEqual({ kind: "refused", sentence: "This entity is archived." });
  });
});

describe("work is an indicator with the job queue (v3 D1: no work switch)", () => {
  const job = (o: Record<string, unknown> = {}) => ({ kind: "summon", run_id: "run_a11", since: "2026-11-08T18:20:00.000+00:00", ...o });
  const barOf = (r: PhaseBarRead) => {
    if (r.kind !== "served") throw new Error("fixture");
    return r.bar;
  };
  it("lit while working: no pressed state, no click; its tooltip is the gateway's sentence, the current job and since when, and the queue", () => {
    const s = slot(served("work"), "work");
    expect(s).toMatchObject({ lit: true, disabled: true, badge: "", label: "work" });
    expect(s.pressed).toBeUndefined();
    expect(s.title).toBe(`Working on a request from an agent. Current job: summon, ${sinceWords("2026-11-08T18:20:00.000+00:00", NOW)}. 2 jobs queued.`);
    expect(phaseActPlan(served("work"), "work")).toEqual({ kind: "none" });
  });
  it("the line says how many jobs are queued, in any phase; nothing when none", () => {
    expect(view(served("work")).queue).toBe("2 jobs queued");
    expect(view(served("visit", { work: { jobs_queued: 1, current: null } })).queue).toBe("1 job queued");
    expect(view(served("idle")).queue).toBe("");
    expect(queueWords({ jobs_queued: 0, current: null })).toBe("");
    expect(queueWords({ jobs_queued: 7, current: null })).toBe("7 jobs queued");
  });
  it("the current job in words: its kind and since when, in the viewer's time; no job, no line", () => {
    expect(jobLine({ jobs_queued: 0, current: job({ kind: "work_order", since: null }) }, NOW)).toBe("Current job: work order.");
    expect(jobLine({ jobs_queued: 0, current: job() }, NOW)).toBe(`Current job: summon, ${sinceWords("2026-11-08T18:20:00.000+00:00", NOW)}.`);
    expect(jobLine(NO_JOBS, NOW)).toBe("");
  });
  it("unlit: a job starts work (no switch); a queue waiting through a visit still shows; stopped says the stop", () => {
    expect(slot(served("idle"), "work")).toMatchObject({ lit: false, disabled: true, title: WORK_IDLE });
    expect(slot(served("visit", { work: { jobs_queued: 1, current: job() } }), "work").title).toBe(
      `${WORK_IDLE} Current job: summon, ${sinceWords("2026-11-08T18:20:00.000+00:00", NOW)}. 1 job queued.`,
    );
    expect(slot(served("stopped"), "work")).toMatchObject({ disabled: true, title: "Stopped. Nothing runs until you resume him." });
  });
  it("then: where he returns when all jobs are done, as served", () => {
    expect(view(served("work")).then).toBe("then: own time");
    expect(afterLine(barOf(served("work")))).toBe("When his jobs are done, his own time resumes.");
  });
  it("no 'finishing' state word is left (it belonged to the work switch)", () => {
    for (const phase of ["visit", "work", "personal", "sleep", "stopped", "idle"] as const) {
      expect(view(served(phase)).slots.map((s) => s.badge)).not.toContain("finishing");
    }
  });
});

describe("why he sleeps (v3 D2): the served sleep.reason beside the sentence and in the sleep pill", () => {
  const sweep = (reason: string | null) =>
    served("sleep", { sentence: "Resting for maintenance; wakes when done.", next: { phase: "idle", sentence: "When maintenance is done he wakes, awake and reachable." }, sleep: { kind: "self", reason, since: "2026-11-08T18:02:00.000+00:00", ends: "when maintenance is done" } });
  it("each threshold, as served", () => {
    expect(view(sweep("24 h since the last sleep")).reason).toBe("asleep: 24 h since the last sleep");
    expect(view(sweep("500 new memories since the last sleep.")).reason).toBe("asleep: 500 new memories since the last sleep");
    expect(slot(sweep("24 h since the last sleep"), "sleep").title).toBe(
      "Resting for maintenance; wakes when done. Asleep: 24 h since the last sleep. When maintenance is done he wakes, awake and reachable.",
    );
  });
  it("no reason served, or not asleep: nothing", () => {
    expect(view(sweep(null)).reason).toBe("");
    expect(slot(sweep(null), "sleep").title).toBe("Resting for maintenance; wakes when done. When maintenance is done he wakes, awake and reachable.");
    for (const phase of ["visit", "work", "personal", "stopped", "idle"] as const) expect(view(served(phase)).reason).toBe("");
    const r = sweep("24 h since the last sleep");
    if (r.kind !== "served") throw new Error("fixture");
    expect(reasonWords({ ...r.bar, phase: "idle" })).toBe("");
  });
});

describe("Stop cancels his own time; Resume lands him idle (v3 D3)", () => {
  const item = (item: string, outcome: string, extra: Record<string, unknown> = {}) => ({ item, id: null, outcome, code: null, sentence: null, ...extra });
  it("the stop's receipt says own time was revoked, with any part that failed", () => {
    const stop = phaseWriteOutcome({
      status: 200,
      code: null,
      body: { ...phaseBody("stopped"), action: "stop", already: false, complete: true, items: [item("run", "cancelled"), REVOKED_ITEM, item("loop", "killed_sigterm")] },
    });
    expect(stop).toMatchObject({ ok: true, sentence: OWN_TIME_REVOKED, incomplete: false });
    expect(stop.bar).toMatchObject({ stopped: true, toggles: { personal: false } });
    const partly = phaseWriteOutcome({
      status: 200,
      code: null,
      body: { ...phaseBody("stopped"), complete: false, items: [item("visit", "failed", { code: "visit_close_failed", sentence: "The visit could not be closed yet; press Stop again to retry." }), REVOKED_ITEM] },
    });
    expect(partly.sentence).toBe(`The visit could not be closed yet; press Stop again to retry. ${OWN_TIME_REVOKED}`);
    expect(partly.incomplete).toBe(true);
  });
  it("while stopped the toggle shows own time revoked and holds", () => {
    expect(slot(served("stopped"), "personal")).toMatchObject({ pressed: false, disabled: true, title: STOPPED_TOGGLE });
  });
  it("Resume says he comes back idle and own time waits for a grant; its answer lands idle and says so", () => {
    expect(RESUME_TITLE).toBe("Resume him: he comes back idle, awake and visitable. His own time starts again only when you grant it.");
    expect(STOP_TITLE).toContain("his own time, which is cancelled");
    const resumed = phaseWriteOutcome({ status: 200, code: null, body: { ...phaseBody("idle", { rev: 49 }), action: "resume", already: false, complete: true, items: [] } });
    expect(resumed.bar).toMatchObject({ phase: "idle", stopped: false, toggles: { personal: false } });
    expect(resumed.sentence).toBe(OWN_TIME_OFF);
  });
  it("the work switch's refusal words are gone; a body naming work is refused in the gateway's words", () => {
    expect(REFUSAL_SENTENCES).not.toHaveProperty("work_off");
    expect(REFUSAL_SENTENCES.unknown_field).toBe("There is no work switch: work starts when a job is queued.");
    expect(REFUSAL_SENTENCES.invalid_toggles).not.toMatch(/\bwork\b/);
  });
});

describe("own time is a privilege (operator ruling 2026-11-09): a served sentence wins, else the app says where he returns", () => {
  const visitWith = (personal: boolean, next: unknown = null) => served("visit", { toggles: { personal }, next });
  const selfSleep = (personal: boolean, next: unknown = null) =>
    served("sleep", { toggles: { personal }, next, sleep: { kind: "self", reason: "done enough", since: "2026-11-08T18:02:00.000+00:00", ends: "when maintenance is done" } });
  const barOf = (r: PhaseBarRead) => {
    if (r.kind !== "served") throw new Error("fixture");
    return r.bar;
  };
  it("the gateway's next sentence wins everywhere it shows: the app's line is never added on top", () => {
    const served_ = "When the visit closes, he returns to what he was doing.";
    const r = visitWith(true, { phase: null, sentence: served_ });
    expect(afterLine(barOf(r))).toBe(served_);
    expect(slot(r, "visit").title).toBe(`In a visit with Laurent. ${served_} ${VISIT_SHOW}`);
    expect(slot(r, "personal").title).toBe(`${PERSONAL_ALLOWED} ${served_}`);
    expect(view(r).sentenceTitle).toMatch(new RegExp(`^Since .+\\. ${served_.replace(/\./g, "\\.")}$`));
    for (const v of [slot(r, "visit").title, slot(r, "personal").title, view(r).sentenceTitle]) {
      expect(v).not.toContain(BACK_AFTER_VISIT);
      expect(v).not.toContain(OWN_TIME_OFF);
    }
    const sleepServed = selfSleep(true, { phase: "personal", sentence: "When maintenance is done he wakes and his own time resumes." });
    expect(slot(sleepServed, "sleep").title).toBe("Resting for maintenance; wakes when done. Asleep: done enough. When maintenance is done he wakes and his own time resumes.");
    expect(slot(sleepServed, "sleep").title).not.toContain(BACK_AFTER_SLEEP);
  });
  it("a visit with no served next: back to his own time while personal is granted; with it revoked he stays awake", () => {
    const granted = visitWith(true);
    expect(afterLine(barOf(granted))).toBe(BACK_AFTER_VISIT);
    expect(slot(granted, "visit").title).toBe(`In a visit with Laurent. ${BACK_AFTER_VISIT} ${VISIT_SHOW}`);
    expect(slot(granted, "personal").title).toBe(`${PERSONAL_ALLOWED} ${BACK_AFTER_VISIT}`);
    expect(view(granted).sentenceTitle).toMatch(/^Since .+\. Back to his own time after the visit\.$/);
    const revoked = visitWith(false);
    expect(afterLine(barOf(revoked))).toBe(OWN_TIME_OFF);
    expect(slot(revoked, "visit").title).toBe(`In a visit with Laurent. ${OWN_TIME_OFF} ${VISIT_SHOW}`);
    expect(slot(revoked, "personal").title).toBe(`${PERSONAL_NOT_ALLOWED} ${OWN_TIME_OFF}`);
  });
  it("a sleep he chose himself, no served next: back to his own time when he wakes while granted; an operator sleep gets no app line", () => {
    const r = selfSleep(true);
    expect(afterLine(barOf(r))).toBe(BACK_AFTER_SLEEP);
    expect(slot(r, "sleep").title).toBe(`Resting for maintenance; wakes when done. Asleep: done enough. ${BACK_AFTER_SLEEP}`);
    expect(view(r).sentenceTitle).toMatch(/^Since .+\. Back to his own time when he wakes\.$/);
    expect(afterLine(barOf(selfSleep(false)))).toBe("");
    const operatorSleep = served("sleep", { next: null });
    expect(afterLine(barOf(operatorSleep))).toBe("");
    expect(slot(operatorSleep, "sleep").title).toBe("Resting for maintenance; wakes when done. Asleep: maintenance requested.");
  });
  it("the idle line: own time off says he stays awake; own time on (blocked) does not; his own time running has nothing to add", () => {
    expect(afterLine(barOf(served("idle")))).toBe(OWN_TIME_OFF);
    expect(view(served("idle")).sentenceTitle).toMatch(/^Since .+\. Own time is off; he stays awake\.$/);
    expect(slot(served("idle"), "personal").title).toBe(PERSONAL_NOT_ALLOWED);
    expect(afterLine(barOf(served("idle", { ...LOOP_CRASHED, toggles: { personal: true } })))).toBe("");
    expect(afterLine(barOf(served("personal")))).toBe("");
    expect(afterLine(barOf(served("stopped")))).toBe("");
  });
  it("then: where he goes next, from the served next.phase — own time, work or idle; nothing when none is served", () => {
    expect(view(served("visit")).then).toBe("then: own time");
    expect(view(served("work", { next: { phase: "idle", sentence: "When his jobs are done, he stays awake and reachable." } })).then).toBe("then: idle");
    expect(thenWords(barOf(visitWith(true, { phase: "work", sentence: "When the visit closes, he goes back to work." })))).toBe("then: work");
    expect(view(visitWith(true, { phase: null, sentence: "When the visit closes, he returns to what he was doing." })).then).toBe("");
    expect(view(served("personal")).then).toBe("");
    expect(view({ kind: "unserved" }).then).toBe("");
  });
  it("a toggle's answer says what happens next: the gateway's words, else the app's line", () => {
    const off = phaseWriteOutcome({ status: 200, code: null, body: phaseBody("visit", { rev: 50, toggles: { personal: false }, next: null }) });
    expect(off.sentence).toBe(OWN_TIME_OFF);
    const on = phaseWriteOutcome({ status: 200, code: null, body: phaseBody("visit", { rev: 50, next: null }) });
    expect(on.sentence).toBe(BACK_AFTER_VISIT);
    expect(phaseWriteOutcome({ status: 200, code: null, body: phaseBody("visit") }).sentence).toBe("When the visit closes, his own time resumes.");
    expect(phaseWriteOutcome({ status: 200, code: null, body: phaseBody("personal") }).sentence).toBeNull();
  });
  it("a stream marker into a visit drops next until the re-read: the app's line holds the place", () => {
    const m = parsePhaseMarker({ kind: "phase_changed", name: "castor", from: "personal", to: "visit", phase: "visit", toggles: { personal: true }, stopped: false, since: "2026-11-08T18:50:00.000+00:00", rev: 49, generation: 7, cause: "visit_open", sentence: "In a visit with Laurent." })!;
    const r = adoptPhaseMarker(served("personal"), m)!;
    expect(view(r).then).toBe("");
    expect(view(r).sentenceTitle).toMatch(/Back to his own time after the visit\.$/);
  });
});

describe("the power button: red Stop while he runs, Resume when stopped", () => {
  it.each(["visit", "work", "personal", "sleep", "idle"] as const)("%s -> Stop (danger)", (phase) => {
    expect(view(served(phase)).power).toEqual({ label: "Stop", danger: true, disabled: false, title: STOP_TITLE });
  });
  it("stopped -> Resume; the toggle and sleep hold with the gateway's sentences", () => {
    const v = view(served("stopped"));
    expect(v.power).toEqual({ label: "Resume", danger: false, disabled: false, title: RESUME_TITLE });
    expect(v.stopped).toBe(true);
    expect(slot(served("stopped"), "personal")).toMatchObject({ disabled: true, title: STOPPED_TOGGLE });
    expect(slot(served("stopped"), "sleep")).toMatchObject({ disabled: true, title: STOPPED_SLEEP });
    // The toggle shows what the gateway serves (v3 D3: the stop revoked own time).
    expect(pressed(served("stopped"))).toEqual({ personal: false });
  });
  it("a stop that left something outstanding keeps a Stop beside Resume, sent at once", () => {
    expect(view(served("stopped")).stopAgain).toBeNull();
    expect(view(served("stopped"), { busy: null, confirm: null, stopIncomplete: true }).stopAgain).toEqual({ label: "Stop", danger: true, disabled: false, title: STOP_AGAIN_TITLE });
    expect(phaseActPlan(served("stopped"), "stop")).toEqual({ kind: "stop" });
    // Not stopped any more: no second Stop, whatever the last stop said.
    expect(view(served("idle"), { busy: null, confirm: null, stopIncomplete: true }).stopAgain).toBeNull();
  });
});

describe("blocked and Retry (contract §1.4, §3.4)", () => {
  it("own time stopped unexpectedly: the warning, and the Retry the gateway offers", () => {
    const read = served("idle", LOOP_CRASHED);
    const v = view(read);
    expect(v.blocked).toBe("His own time stopped unexpectedly. Retry to start it again.");
    expect(v.retry).toEqual({ disabled: false, title: RETRY_TITLE });
    expect(phaseActPlan(read, "retry")).toEqual({ kind: "retry" });
  });
  it("his own time is not running (contract §13, own_time_not_running): the same Retry", () => {
    const read = served("idle", {
      toggles: { work: true, personal: true },
      sentence: "Awake and reachable; his own time is not running.",
      blocked: { code: "own_time_not_running", sentence: "His own time is not running. Retry to start it.", action: "retry" },
    });
    expect(view(read).blocked).toBe("His own time is not running. Retry to start it.");
    expect(view(read).retry).toEqual({ disabled: false, title: RETRY_TITLE });
    expect(phaseActPlan(read, "retry")).toEqual({ kind: "retry" });
  });
  it("no Retry without the gateway's action (a block with action null)", () => {
    const read = served("idle", { blocked: { code: "work_order_waits_for_runtime", sentence: "Work is off and a work order stands; his own time waits until Work is back on.", action: null } });
    expect(view(read).blocked).toContain("work order stands");
    expect(view(read).retry).toBeNull();
    expect(phaseActPlan(read, "retry")).toEqual({ kind: "none" });
    expect(view(served("idle")).retry).toBeNull();
  });
});

describe("the sentence line: the gateway's words and since, in the viewer's time", () => {
  it("is the served sentence; since sits beside it; exact since and next ride the tooltip", () => {
    const v = view(served("visit"));
    expect(v.sentence).toBe("In a visit with Laurent.");
    expect(v.since).toBe(sinceWords("2026-11-08T18:15:02.000+00:00", NOW));
    expect(v.since).toMatch(/^since (\d{2}:\d{2}|Nov \d+, \d{2}:\d{2})$/);
    expect(v.sentenceTitle).toMatch(/^Since .+\. When the visit closes, his own time resumes\.$/);
    expect(v.blocked).toBe("");
  });
  it("since reads the clock time today, and the day too on another day", () => {
    const iso = "2026-11-08T18:15:02.000+00:00";
    const d = new Date(iso);
    const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    expect(sinceWords(iso, d.getTime() + 60_000)).toBe(`since ${clock}`);
    expect(sinceWords(iso, d.getTime() + 3 * 86_400_000)).toBe(`since ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getDate()}, ${clock}`);
    expect(sinceWords(null, NOW)).toBe("");
    expect(sinceWords("not a time", NOW)).toBe("");
  });
  it("unserved: one sentence, every control off", () => {
    const v = view({ kind: "unserved" });
    expect(v.sentence).toBe(PHASE_BAR_UNSERVED);
    expect(v.live).toBe(false);
    expect(v.slots.every((s) => s.disabled && !s.lit)).toBe(true);
    expect(v.power.disabled).toBe(true);
  });
  it("loading: no sentence yet, nothing claimed, but the kill switch is already there", () => {
    const v = view({ kind: "loading" });
    expect(v.sentence).toBe("");
    expect(v.slots.every((s) => s.disabled && !s.lit && s.pressed !== true)).toBe(true);
    expect(v.power).toEqual({ label: "Stop", danger: true, disabled: false, title: STOP_TITLE });
  });
  it("a failed read: its sentence, the pills off, Stop still live", () => {
    const v = view({ kind: "failed", sentence: "Could not read his phase: HTTP 502" });
    expect(v.sentence).toBe("Could not read his phase: HTTP 502");
    expect(v.slots.every((s) => s.disabled)).toBe(true);
    expect(v.power).toEqual({ label: "Stop", danger: true, disabled: false, title: STOP_TITLE });
  });
});

describe("clicks -> plans", () => {
  it("a toggle asks the opposite of what it shows when the gateway allows it (the gateway says what it means)", () => {
    expect(phaseActPlan(served("idle"), "personal")).toEqual({ kind: "toggle", key: "personal", on: true });
    expect(phaseActPlan(served("visit"), "personal")).toEqual({ kind: "toggle", key: "personal", on: false });
    expect(phaseActPlan(served("work"), "personal")).toEqual({ kind: "toggle", key: "personal", on: false });
    expect(phaseActPlan(served("work"), "work")).toEqual({ kind: "none" });
    expect(phaseActPlan(served("stopped"), "personal")).toEqual({ kind: "refused", sentence: STOPPED_TOGGLE });
  });
  it("Stop asks first; Resume acts; Resume does nothing while he runs", () => {
    expect(phaseActPlan(served("personal"), "stop")).toEqual({ kind: "confirm", confirm: "stop" });
    expect(phaseActPlan(served("stopped"), "resume")).toEqual({ kind: "resume" });
    expect(phaseActPlan(served("idle"), "resume")).toEqual({ kind: "none" });
  });
  it("nothing but Stop acts before the bar is served; a gateway without the bar has no Stop either", () => {
    for (const act of ["visit", "work", "personal", "sleep", "stop", "resume", "retry"] as const) {
      expect(phaseActPlan({ kind: "unserved" }, act)).toEqual({ kind: "none" });
    }
    for (const act of ["visit", "work", "personal", "sleep", "resume", "retry"] as const) {
      expect(phaseActPlan({ kind: "loading" }, act)).toEqual({ kind: "none" });
      expect(phaseActPlan({ kind: "failed", sentence: "x" }, act)).toEqual({ kind: "none" });
    }
    expect(phaseActPlan({ kind: "loading" }, "stop")).toEqual({ kind: "confirm", confirm: "stop" });
    expect(phaseActPlan({ kind: "failed", sentence: "x" }, "stop")).toEqual({ kind: "confirm", confirm: "stop" });
  });
  it.each(["personal", "resume", "retry"] as const)("while a %s write is in flight every pill holds, and Stop stays live", (busy) => {
    for (const phase of ["visit", "work", "personal", "sleep", "idle"] as const) {
      const v = view(served(phase), { busy, confirm: null });
      expect(v.slots.every((s) => s.disabled)).toBe(true);
      expect(v.power).toEqual({ label: "Stop", danger: true, disabled: false, title: STOP_TITLE });
      expect(phaseActPlan(served(phase), "stop")).toEqual({ kind: "confirm", confirm: "stop" });
    }
  });
  it("a Stop in flight holds the pills and leaves Stop live (pressed again, it sends again)", () => {
    const v = view(served("personal"), { busy: null, stopping: true, confirm: null });
    expect(v.slots.every((s) => s.disabled)).toBe(true);
    expect(v.power.disabled).toBe(false);
  });
  it("a refusal on screen never holds Stop", () => {
    expect(view(served("visit")).power.disabled).toBe(false);
    expect(phaseActPlan(served("visit"), "sleep").kind).toBe("refused");
    expect(phaseActPlan(served("visit"), "stop")).toEqual({ kind: "confirm", confirm: "stop" });
  });
  it("Resume and Retry wait for a write in flight (only Stop is the kill switch)", () => {
    expect(view(served("stopped"), { busy: "resume", confirm: null }).power).toMatchObject({ label: "Resume", disabled: true });
    expect(view(served("idle", LOOP_CRASHED), { busy: "personal", confirm: null }).retry).toEqual({ disabled: true, title: RETRY_TITLE });
  });
});

describe("the stale rule: highest rev wins, and nothing from before a Stop (contract §3.3, §5)", () => {
  it("an older read never repaints a newer bar; an equal or newer one does", () => {
    const newer = served("idle"); // rev 48
    const older = served("personal"); // rev 45
    if (newer.kind !== "served" || older.kind !== "served") throw new Error("fixture");
    expect(adoptPhaseBar(newer, older.bar)).toBe(newer);
    expect(adoptPhaseBar(older, newer.bar)).toEqual(newer);
    expect(adoptPhaseBar({ kind: "loading" }, older.bar)).toEqual(older);
  });
  it("an answer from before the Stop (lower generation) never repaints, even with a higher rev", () => {
    const stopped = served("stopped"); // rev 47, generation 8
    const before = served("personal", { rev: 99, generation: 7 });
    if (stopped.kind !== "served" || before.kind !== "served") throw new Error("fixture");
    expect(isStalePhase(before.bar, stopped.bar)).toBe(true);
    expect(adoptPhaseBar(stopped, before.bar)).toBe(stopped);
    expect(isStalePhase({ rev: 48, generation: 8 }, stopped.bar)).toBe(false);
  });
  it("a failed or unserved read keeps the newest seen: a late, older answer never repaints over it", () => {
    const stopped = served("stopped"); // rev 47, gen 8
    const older = served("personal"); // rev 45, gen 7
    if (stopped.kind !== "served" || older.kind !== "served") throw new Error("fixture");
    const failed = adoptPhaseRead(stopped, { kind: "failed", sentence: "Could not read his phase: HTTP 502" });
    expect(failed).toEqual({ kind: "failed", sentence: "Could not read his phase: HTTP 502", seen: { rev: 47, generation: 8 } });
    expect(adoptPhaseBar(failed, older.bar)).toBe(failed);
    expect(adoptPhaseRead(failed, older)).toBe(failed);
    const unserved = adoptPhaseRead(failed, { kind: "unserved" });
    expect(unserved).toEqual({ kind: "unserved", seen: { rev: 47, generation: 8 } });
    expect(adoptPhaseBar(unserved, older.bar)).toBe(unserved);
    // An equal or newer bar is adopted; a new entity starts from loading (nothing seen).
    expect(adoptPhaseBar(failed, stopped.bar)).toEqual(stopped);
    expect(adoptPhaseRead(failed, { kind: "loading" })).toEqual({ kind: "loading" });
    expect(adoptPhaseRead({ kind: "loading" }, { kind: "failed", sentence: "x" })).toEqual({ kind: "failed", sentence: "x" });
  });
  const marker = (o: Record<string, unknown>) => parsePhaseMarker({ kind: "phase_changed", name: "castor", from: "visit", to: "idle", phase: "idle", toggles: { personal: false }, stopped: false, since: "2026-11-08T18:41:00.000+00:00", rev: 48, generation: 7, cause: "visit_closed", sentence: "Awake and reachable; nothing of his own is running.", ...o })!;
  it("a newer marker repaints phase, toggles, stop, since and sentence; next/blocked, another phase's facts and can (the phase moved) wait for the re-read", () => {
    const read = served("visit"); // rev 43
    const next = adoptPhaseMarker(read, marker({}));
    expect(next).toMatchObject({ kind: "served", bar: { rev: 48, generation: 7, phase: "idle", toggles: { personal: false }, sentence: "Awake and reachable; nothing of his own is running.", next: null, blocked: null, visit: null } });
    expect(lit(next!)).toEqual([]);
    // The controls hold until the re-read says what is allowed now; Stop does not.
    expect(view(next!).slots.every((s) => s.disabled)).toBe(true);
    expect(view(next!).power.disabled).toBe(false);
  });
  it("a marker that changes only the toggle keeps can", () => {
    const read = served("personal"); // rev 45
    const next = adoptPhaseMarker(read, marker({ phase: "personal", to: "personal", from: "personal", rev: 46, toggles: { personal: false }, cause: "toggle", sentence: "On his own time." }));
    if (!next || next.kind !== "served") throw new Error("marker");
    expect(next.bar.can).toEqual(CAN_ALL);
    expect(slot(next, "personal")).toMatchObject({ disabled: false, pressed: false });
  });
  it("a marker into or out of work keeps the queue's count and drops the job until the re-read", () => {
    const working = served("work"); // rev 44, 2 queued, a summon running
    const out = adoptPhaseMarker(working, marker({ phase: "visit", to: "visit", from: "work", rev: 45, generation: 7, sentence: "In a visit with Laurent." }));
    if (!out || out.kind !== "served") throw new Error("marker");
    expect(out.bar.work).toEqual({ jobs_queued: 2, current: null });
    expect(view(out).queue).toBe("2 jobs queued");
    const same = adoptPhaseMarker(working, marker({ phase: "work", to: "work", from: "work", rev: 45, generation: 7, sentence: "Working on his work order." }));
    if (!same || same.kind !== "served") throw new Error("marker");
    expect(same.bar.work.current?.kind).toBe("summon");
  });
  it("an older or equal marker, or one from before a Stop, changes nothing; without a served bar the caller re-reads", () => {
    const read = served("idle"); // rev 48, gen 8
    expect(adoptPhaseMarker(read, marker({ rev: 45, generation: 8 }))).toBeNull();
    expect(adoptPhaseMarker(read, marker({ rev: 48, generation: 8 }))).toBeNull();
    expect(adoptPhaseMarker(read, marker({ rev: 60, generation: 7 }))).toBeNull();
    expect(adoptPhaseMarker({ kind: "loading" }, marker({ rev: 99 }))).toBeNull();
  });
});

describe("a newborn is idle (v3 D5)", () => {
  const newborn = served("idle", { rev: 1, generation: 0, toggles: { personal: false }, since: "2026-11-08T18:02:00.000+00:00" });
  it("nothing lit, awake and reachable; own time off says he stays awake; granting it is the one toggle", () => {
    expect(lit(newborn)).toEqual([]);
    expect(view(newborn).sentence).toBe("Awake and reachable; nothing of his own is running.");
    expect(afterLine((newborn as Extract<PhaseBarRead, { kind: "served" }>).bar)).toBe(OWN_TIME_OFF);
    expect(phaseActPlan(newborn, "personal")).toEqual({ kind: "toggle", key: "personal", on: true });
    expect(phaseActPlan(newborn, "visit")).toEqual({ kind: "open_visit" });
  });
});

describe("an operator sleep with no end holds until he is woken (contract §13)", () => {
  const held = (personal: boolean) =>
    served("sleep", {
      toggles: { personal },
      sentence: "Asleep until you wake him.",
      next: null,
      sleep: { kind: "operator", reason: null, since: "2026-11-08T18:02:00.000+00:00", ends: null },
    });
  it.each([false, true])("personal %s: the sleep stays lit and holds; nothing says he wakes on his own", (personal) => {
    const read = held(personal);
    expect(lit(read)).toEqual(["sleep"]);
    expect(slot(read, "sleep")).toMatchObject({ lit: true, disabled: true, title: "Asleep until you wake him." });
    expect(afterLine((read as Extract<PhaseBarRead, { kind: "served" }>).bar)).toBe("");
    expect(view(read).then).toBe("");
    expect(view(read).retry).toBeNull();
  });
  it("turning Personal on is a toggle, never a wake; its answer adds no words of the app's", () => {
    expect(phaseActPlan(held(false), "personal")).toEqual({ kind: "toggle", key: "personal", on: true });
    const body = phaseBody("sleep", { toggles: { personal: true }, sentence: "Asleep until you wake him.", next: null, sleep: { kind: "operator", reason: null, since: null, ends: null } });
    expect(phaseWriteOutcome({ status: 200, code: null, body: { ...body, changed: { personal: { from: false, to: true } } } })).toMatchObject({ ok: true, sentence: null });
  });
});
