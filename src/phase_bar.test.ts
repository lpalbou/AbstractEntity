/**
 * The phase bar's pure rules (operator ruling 2026-11-08, CONTRACT-phases v2): state -> view (which
 * pill is lit, which toggle pressed, what `can` allows, the power button, the sentence and since),
 * click -> plan, and the stale rule (rev + generation) for reads, answers and stream markers.
 */
import { describe, expect, it } from "vitest";

import { ALREADY_ASLEEP, CAN_ALL, IN_VISIT, LOOP_CRASHED, STOPPED_SLEEP, STOPPED_TOGGLE, STOPPED_VISIT, phaseBody } from "./fixtures/phase_bodies";
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
  WORK_ALLOWED,
  WORK_NOT_ALLOWED,
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

describe("toggles: pressed = allowed, the label never changes", () => {
  it("work and personal are toggles; visit and sleep are indicators (no pressed state)", () => {
    expect(view(served("personal")).slots.map((s) => [s.key, s.pressed])).toEqual([
      ["visit", undefined],
      ["work", true],
      ["personal", true],
      ["sleep", undefined],
    ]);
  });
  it("pressed follows the toggles, whatever the phase", () => {
    expect(pressed(served("idle"))).toEqual({ work: true, personal: false });
    expect(pressed(served("work"))).toEqual({ work: false, personal: false });
    expect(pressed(served("visit", { toggles: { work: false, personal: true } }))).toEqual({ work: false, personal: true });
  });
  it("a toggle is lit AND pressed when it is the current, allowed phase; lit and not pressed when turned off mid-phase", () => {
    const on = slot(served("personal"), "personal");
    expect([on.lit, on.pressed]).toEqual([true, true]);
    const winding = slot(served("personal", { toggles: { work: true, personal: false } }), "personal");
    expect([winding.lit, winding.pressed]).toEqual([true, false]);
  });
  it("labels and glyphs are the same in every state", () => {
    const labels = new Set((["visit", "work", "personal", "sleep", "stopped", "idle"] as const).map((p) => JSON.stringify(view(served(p)).slots.map((s) => [s.label, s.glyph]))));
    expect(labels.size).toBe(1);
    expect([...labels][0]).toBe(JSON.stringify([["visit", "💬"], ["work", "🛠"], ["personal", "⏻"], ["sleep", "🌙"]]));
  });
  it("titles say what the toggle allows", () => {
    expect(slot(served("idle"), "work").title).toBe(WORK_ALLOWED);
    expect(slot(served("idle"), "personal").title).toBe(PERSONAL_NOT_ALLOWED);
    expect(slot(served("personal"), "personal").title).toBe(`${PERSONAL_ALLOWED} On his own time.`);
  });
});

describe("can drives every control (contract §1.5, §8.3)", () => {
  it("a toggle the gateway does not allow is disabled, its tooltip the gateway's sentence; the click is refused with it", () => {
    const read = served("idle", { can: { ...CAN_ALL, toggle_personal: refusedCan("This entity is archived.") } });
    expect(slot(read, "personal")).toMatchObject({ disabled: true, title: "This entity is archived.", pressed: false });
    expect(slot(read, "work")).toMatchObject({ disabled: false, title: WORK_ALLOWED });
    expect(phaseActPlan(read, "personal")).toEqual({ kind: "refused", sentence: "This entity is archived." });
    expect(phaseActPlan(read, "work")).toEqual({ kind: "toggle", key: "work", on: false });
  });
  it("sleep now during a visit: disabled with the gateway's in_visit sentence (a visit is never ended implicitly)", () => {
    expect(slot(served("visit"), "sleep")).toMatchObject({ disabled: true, title: IN_VISIT });
    expect(phaseActPlan(served("visit"), "sleep")).toEqual({ kind: "refused", sentence: IN_VISIT });
  });
  it("sleep now right after a sleep: the gateway says no, and why", () => {
    const read = served("idle", { can: { ...CAN_ALL, sleep_now: refusedCan(ALREADY_ASLEEP) } });
    expect(slot(read, "sleep")).toMatchObject({ disabled: true, title: ALREADY_ASLEEP });
    expect(phaseActPlan(read, "sleep")).toEqual({ kind: "refused", sentence: ALREADY_ASLEEP });
  });
  it("sleep now when allowed: offered, asked first; a lit sleep holds with its sentence and what comes next", () => {
    expect(slot(served("personal"), "sleep")).toMatchObject({ disabled: false, title: SLEEP_OFFER });
    expect(phaseActPlan(served("personal"), "sleep")).toEqual({ kind: "confirm", confirm: "sleep" });
    expect(slot(served("sleep"), "sleep")).toMatchObject({ lit: true, disabled: true, title: "Resting for maintenance; wakes when done. When maintenance is done he wakes and his own time resumes." });
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

describe("work: finishing after Work was turned off", () => {
  it("the lit work pill shows 'finishing' beside its label and says it in its tooltip", () => {
    const s = slot(served("work"), "work");
    expect(s).toMatchObject({ lit: true, pressed: false, badge: "finishing", label: "work" });
    // The gateway's sentence says it; the app adds nothing on top.
    expect(s.title).toBe(`${WORK_NOT_ALLOWED} Working on a request from an agent; Work is off, so he stops after this run.`);
    expect(slot(served("work", { work: { kind: "summon", run_id: "r", since: null, finishing: false }, toggles: { work: true, personal: false } }), "work").badge).toBe("");
  });
});

describe("own time is a privilege (operator ruling 2026-11-09): a served sentence wins, else the app says where he returns", () => {
  const visitWith = (personal: boolean, next: unknown = null) => served("visit", { toggles: { work: true, personal }, next });
  const selfSleep = (personal: boolean, next: unknown = null) =>
    served("sleep", { toggles: { work: true, personal }, next, sleep: { kind: "self", reason: "done enough", since: "2026-11-08T18:02:00.000+00:00", ends: "when maintenance is done" } });
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
    expect(slot(sleepServed, "sleep").title).toBe("Resting for maintenance; wakes when done. When maintenance is done he wakes and his own time resumes.");
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
    expect(slot(r, "sleep").title).toBe(`Resting for maintenance; wakes when done. ${BACK_AFTER_SLEEP}`);
    expect(view(r).sentenceTitle).toMatch(/^Since .+\. Back to his own time when he wakes\.$/);
    expect(afterLine(barOf(selfSleep(false)))).toBe("");
    const operatorSleep = served("sleep", { next: null });
    expect(afterLine(barOf(operatorSleep))).toBe("");
    expect(slot(operatorSleep, "sleep").title).toBe("Resting for maintenance; wakes when done.");
  });
  it("the idle line: own time off says he stays awake; own time on (blocked) does not; his own time running has nothing to add", () => {
    expect(afterLine(barOf(served("idle")))).toBe(OWN_TIME_OFF);
    expect(view(served("idle")).sentenceTitle).toMatch(/^Since .+\. Own time is off; he stays awake\.$/);
    expect(slot(served("idle"), "personal").title).toBe(PERSONAL_NOT_ALLOWED);
    expect(afterLine(barOf(served("idle", { ...LOOP_CRASHED, toggles: { work: true, personal: true } })))).toBe("");
    expect(afterLine(barOf(served("personal")))).toBe("");
    expect(afterLine(barOf(served("stopped")))).toBe("");
  });
  it("then: where he goes next, from the served next.phase — own time, work or idle; nothing when none is served", () => {
    expect(view(served("visit")).then).toBe("then: own time");
    expect(view(served("work")).then).toBe("then: idle");
    expect(thenWords(barOf(visitWith(true, { phase: "work", sentence: "When the visit closes, he goes back to work." })))).toBe("then: work");
    expect(view(visitWith(true, { phase: null, sentence: "When the visit closes, he returns to what he was doing." })).then).toBe("");
    expect(view(served("personal")).then).toBe("");
    expect(view({ kind: "unserved" }).then).toBe("");
  });
  it("a toggle's answer says what happens next: the gateway's words, else the app's line", () => {
    const off = phaseWriteOutcome({ status: 200, code: null, body: phaseBody("visit", { rev: 50, toggles: { work: true, personal: false }, next: null }) });
    expect(off.sentence).toBe(OWN_TIME_OFF);
    const on = phaseWriteOutcome({ status: 200, code: null, body: phaseBody("visit", { rev: 50, next: null }) });
    expect(on.sentence).toBe(BACK_AFTER_VISIT);
    expect(phaseWriteOutcome({ status: 200, code: null, body: phaseBody("visit") }).sentence).toBe("When the visit closes, his own time resumes.");
    expect(phaseWriteOutcome({ status: 200, code: null, body: phaseBody("personal") }).sentence).toBeNull();
  });
  it("a stream marker into a visit drops next until the re-read: the app's line holds the place", () => {
    const m = parsePhaseMarker({ kind: "phase_changed", name: "castor", from: "personal", to: "visit", phase: "visit", toggles: { work: true, personal: true }, stopped: false, since: "2026-11-08T18:50:00.000+00:00", rev: 49, generation: 7, cause: "visit_open", sentence: "In a visit with Laurent." })!;
    const r = adoptPhaseMarker(served("personal"), m)!;
    expect(view(r).then).toBe("");
    expect(view(r).sentenceTitle).toMatch(/Back to his own time after the visit\.$/);
  });
});

describe("the power button: red Stop while he runs, Resume when stopped", () => {
  it.each(["visit", "work", "personal", "sleep", "idle"] as const)("%s -> Stop (danger)", (phase) => {
    expect(view(served(phase)).power).toEqual({ label: "Stop", danger: true, disabled: false, title: STOP_TITLE });
  });
  it("stopped -> Resume; the toggles and sleep hold with the gateway's sentences", () => {
    const v = view(served("stopped"));
    expect(v.power).toEqual({ label: "Resume", danger: false, disabled: false, title: RESUME_TITLE });
    expect(v.stopped).toBe(true);
    expect(slot(served("stopped"), "work")).toMatchObject({ disabled: true, title: STOPPED_TOGGLE });
    expect(slot(served("stopped"), "personal")).toMatchObject({ disabled: true, title: STOPPED_TOGGLE });
    expect(slot(served("stopped"), "sleep")).toMatchObject({ disabled: true, title: STOPPED_SLEEP });
    // The toggles still show what is allowed (stop never changes them).
    expect(pressed(served("stopped"))).toEqual({ work: true, personal: true });
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
    expect(phaseActPlan(served("work"), "work")).toEqual({ kind: "toggle", key: "work", on: true });
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
  it.each(["work", "personal", "resume", "retry"] as const)("while a %s write is in flight every pill holds, and Stop stays live", (busy) => {
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
    expect(view(served("idle", LOOP_CRASHED), { busy: "work", confirm: null }).retry).toEqual({ disabled: true, title: RETRY_TITLE });
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
  const marker = (o: Record<string, unknown>) => parsePhaseMarker({ kind: "phase_changed", name: "castor", from: "visit", to: "idle", phase: "idle", toggles: { work: true, personal: false }, stopped: false, since: "2026-11-08T18:41:00.000+00:00", rev: 48, generation: 7, cause: "visit_closed", sentence: "Awake and reachable; nothing of his own is running.", ...o })!;
  it("a newer marker repaints phase, toggles, stop, since and sentence; next/blocked, another phase's facts and can (the phase moved) wait for the re-read", () => {
    const read = served("visit"); // rev 43
    const next = adoptPhaseMarker(read, marker({}));
    expect(next).toMatchObject({ kind: "served", bar: { rev: 48, generation: 7, phase: "idle", toggles: { work: true, personal: false }, sentence: "Awake and reachable; nothing of his own is running.", next: null, blocked: null, visit: null } });
    expect(lit(next!)).toEqual([]);
    // The controls hold until the re-read says what is allowed now; Stop does not.
    expect(view(next!).slots.every((s) => s.disabled)).toBe(true);
    expect(view(next!).power.disabled).toBe(false);
  });
  it("a marker that changes only the toggles keeps can", () => {
    const read = served("personal"); // rev 45
    const next = adoptPhaseMarker(read, marker({ phase: "personal", to: "personal", from: "personal", rev: 46, toggles: { work: false, personal: true }, cause: "toggle", sentence: "On his own time." }));
    if (!next || next.kind !== "served") throw new Error("marker");
    expect(next.bar.can).toEqual(CAN_ALL);
    expect(slot(next, "work").disabled).toBe(false);
  });
  it("an older or equal marker, or one from before a Stop, changes nothing; without a served bar the caller re-reads", () => {
    const read = served("idle"); // rev 48, gen 8
    expect(adoptPhaseMarker(read, marker({ rev: 45, generation: 8 }))).toBeNull();
    expect(adoptPhaseMarker(read, marker({ rev: 48, generation: 8 }))).toBeNull();
    expect(adoptPhaseMarker(read, marker({ rev: 60, generation: 7 }))).toBeNull();
    expect(adoptPhaseMarker({ kind: "loading" }, marker({ rev: 99 }))).toBeNull();
  });
});
