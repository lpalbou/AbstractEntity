/**
 * The phase bar's pure rules (operator ruling 2026-11-08, CONTRACT-phases v1): state -> view (which
 * pill is lit, which toggle pressed, the power button, the sentence), click -> plan, and the rev rule
 * for reads, answers and stream markers.
 */
import { describe, expect, it } from "vitest";

import { phaseBody } from "./fixtures/phase_bodies";
import {
  PERSONAL_ALLOWED,
  PERSONAL_NOT_ALLOWED,
  RESUME_TITLE,
  SLEEP_DURING_VISIT,
  SLEEP_OFFER,
  STOP_TITLE,
  VISIT_OFFER,
  WORK_ALLOWED,
  adoptPhaseBar,
  adoptPhaseMarker,
  phaseActPlan,
  phaseBarRead,
  phaseBarView,
  type PhaseBarRead,
  type PhaseBarUi,
} from "./phase_bar";
import { PHASE_BAR_UNSERVED, parsePhaseMarker, type ServedPhase } from "./phase_bar_source";

const IDLE_UI: PhaseBarUi = { busy: null, confirm: null };
const served = (phase: ServedPhase, overrides: Record<string, unknown> = {}): PhaseBarRead => {
  const read = phaseBarRead({ status: 200, code: null, body: phaseBody(phase, overrides) });
  if (read.kind !== "served") throw new Error("fixture did not parse");
  return read;
};
const lit = (read: PhaseBarRead) => phaseBarView(read, IDLE_UI).slots.filter((s) => s.lit).map((s) => s.key);
const pressed = (read: PhaseBarRead) =>
  Object.fromEntries(
    phaseBarView(read, IDLE_UI)
      .slots.filter((s) => s.pressed !== undefined)
      .map((s) => [s.key, s.pressed]),
  );

describe("which pill is lit: exactly the served phase, none for idle and stopped", () => {
  it.each(["visit", "work", "personal", "sleep"] as const)("%s lights only %s", (phase) => {
    expect(lit(served(phase))).toEqual([phase]);
  });
  it("idle lights nothing; its sentence is the gateway's", () => {
    const read = served("idle");
    expect(lit(read)).toEqual([]);
    expect(phaseBarView(read, IDLE_UI).sentence).toBe("Awake and reachable since 19:41; nothing of his own is running.");
  });
  it("stopped lights nothing", () => {
    expect(lit(served("stopped"))).toEqual([]);
  });
});

describe("toggles: pressed = allowed, the label never changes", () => {
  it("work and personal are toggles; visit and sleep are indicators (no pressed state)", () => {
    const view = phaseBarView(served("personal"), IDLE_UI);
    expect(view.slots.map((s) => [s.key, s.pressed])).toEqual([
      ["visit", undefined],
      ["work", true],
      ["personal", true],
      ["sleep", undefined],
    ]);
  });
  it("pressed follows the toggles, whatever the phase", () => {
    expect(pressed(served("idle"))).toEqual({ work: true, personal: false });
    expect(pressed(served("work"))).toEqual({ work: true, personal: false });
    expect(pressed(served("visit", { toggles: { work: false, personal: true } }))).toEqual({ work: false, personal: true });
  });
  it("a toggle is lit AND pressed when it is the current, allowed phase; lit and not pressed when turned off mid-phase", () => {
    const on = phaseBarView(served("personal"), IDLE_UI).slots.find((s) => s.key === "personal")!;
    expect([on.lit, on.pressed]).toEqual([true, true]);
    const winding = phaseBarView(served("personal", { toggles: { work: true, personal: false } }), IDLE_UI).slots.find((s) => s.key === "personal")!;
    expect([winding.lit, winding.pressed]).toEqual([true, false]);
  });
  it("labels and glyphs are the same in every state", () => {
    const labels = new Set((["visit", "work", "personal", "sleep", "stopped", "idle"] as const).map((p) => JSON.stringify(phaseBarView(served(p), IDLE_UI).slots.map((s) => [s.label, s.glyph]))));
    expect(labels.size).toBe(1);
    expect([...labels][0]).toBe(JSON.stringify([["visit", "💬"], ["work", "🛠"], ["personal", "⏻"], ["sleep", "🌙"]]));
  });
  it("titles say what the toggle allows", () => {
    const view = phaseBarView(served("idle"), IDLE_UI);
    expect(view.slots.find((s) => s.key === "work")!.title).toBe(WORK_ALLOWED);
    expect(view.slots.find((s) => s.key === "personal")!.title).toBe(PERSONAL_NOT_ALLOWED);
    const own = phaseBarView(served("personal"), IDLE_UI).slots.find((s) => s.key === "personal")!;
    expect(own.title).toBe(`${PERSONAL_ALLOWED} On his own time since 19:30.`);
  });
});

describe("the power button: red Stop while he runs, Resume when stopped", () => {
  it.each(["visit", "work", "personal", "sleep", "idle"] as const)("%s -> Stop (danger)", (phase) => {
    expect(phaseBarView(served(phase), IDLE_UI).power).toEqual({ label: "Stop", danger: true, disabled: false, title: STOP_TITLE });
  });
  it("stopped -> Resume, and every pill holds (resume first)", () => {
    const view = phaseBarView(served("stopped"), IDLE_UI);
    expect(view.power).toEqual({ label: "Resume", danger: false, disabled: false, title: RESUME_TITLE });
    expect(view.stopped).toBe(true);
    expect(view.slots.every((s) => s.disabled && s.title === "Stopped since 19:40. Nothing runs until you resume him.")).toBe(true);
    // The toggles still show what is allowed (stop never changes them).
    expect(pressed(served("stopped"))).toEqual({ work: true, personal: true });
  });
});

describe("the sentence line", () => {
  it("is the served sentence; since (viewer-local) and next ride the tooltip; blocked is a warning", () => {
    const view = phaseBarView(served("visit"), IDLE_UI);
    expect(view.sentence).toBe("In a visit with Laurent since 19:15.");
    expect(view.sentenceTitle).toMatch(/^Since .+\. When the visit closes, his own time resumes\.$/);
    expect(view.blocked).toBe("");
    const blocked = phaseBarView(
      served("idle", { toggles: { work: true, personal: true }, blocked: { code: "own_time_start_failed", sentence: "His own time could not start: no mind is set for castor. Choose a mind in Settings." } }),
      IDLE_UI,
    );
    expect(blocked.blocked).toBe("His own time could not start: no mind is set for castor. Choose a mind in Settings.");
  });
  it("unserved: one sentence, every control off", () => {
    const view = phaseBarView({ kind: "unserved" }, IDLE_UI);
    expect(view.sentence).toBe(PHASE_BAR_UNSERVED);
    expect(view.live).toBe(false);
    expect(view.slots.every((s) => s.disabled && !s.lit)).toBe(true);
    expect(view.power.disabled).toBe(true);
  });
  it("loading: no sentence yet, nothing claimed", () => {
    const view = phaseBarView({ kind: "loading" }, IDLE_UI);
    expect(view.sentence).toBe("");
    expect(view.slots.every((s) => s.disabled && !s.lit && s.pressed !== true)).toBe(true);
  });
});

describe("indicators: visit and sleep", () => {
  it("unlit visit offers a visit; lit visit shows it", () => {
    expect(phaseBarView(served("idle"), IDLE_UI).slots[0].title).toBe(VISIT_OFFER);
    expect(phaseActPlan(served("idle"), "visit")).toEqual({ kind: "open_visit" });
    expect(phaseActPlan(served("visit"), "visit")).toEqual({ kind: "show_visit" });
  });
  it("unlit sleep offers sleep now (asked first); lit sleep holds (a sleep never follows a sleep)", () => {
    expect(phaseBarView(served("personal"), IDLE_UI).slots[3]).toMatchObject({ disabled: false, title: SLEEP_OFFER });
    expect(phaseActPlan(served("personal"), "sleep")).toEqual({ kind: "confirm", confirm: "sleep" });
    expect(phaseBarView(served("sleep"), IDLE_UI).slots[3]).toMatchObject({ lit: true, disabled: true });
    expect(phaseActPlan(served("sleep"), "sleep")).toEqual({ kind: "none" });
  });
  it("sleep during a visit is refused with a sentence (it would end the conversation)", () => {
    expect(phaseActPlan(served("visit"), "sleep")).toEqual({ kind: "refused", sentence: SLEEP_DURING_VISIT });
  });
});

describe("clicks -> plans", () => {
  it("a toggle asks the opposite of what it shows, in every phase but stopped (the gateway says what it means)", () => {
    expect(phaseActPlan(served("idle"), "personal")).toEqual({ kind: "toggle", key: "personal", on: true });
    expect(phaseActPlan(served("visit"), "personal")).toEqual({ kind: "toggle", key: "personal", on: false });
    expect(phaseActPlan(served("work"), "work")).toEqual({ kind: "toggle", key: "work", on: false });
    expect(phaseActPlan(served("stopped"), "personal")).toEqual({ kind: "none" });
  });
  it("Stop asks first; Resume acts; neither applies in the other state", () => {
    expect(phaseActPlan(served("personal"), "stop")).toEqual({ kind: "confirm", confirm: "stop" });
    expect(phaseActPlan(served("stopped"), "resume")).toEqual({ kind: "resume" });
    expect(phaseActPlan(served("stopped"), "stop")).toEqual({ kind: "none" });
    expect(phaseActPlan(served("idle"), "resume")).toEqual({ kind: "none" });
  });
  it("nothing acts before the bar is served", () => {
    for (const act of ["visit", "work", "personal", "sleep", "stop", "resume"] as const) {
      expect(phaseActPlan({ kind: "unserved" }, act)).toEqual({ kind: "none" });
      expect(phaseActPlan({ kind: "loading" }, act)).toEqual({ kind: "none" });
    }
  });
  it("while an act is in flight every control holds", () => {
    const view = phaseBarView(served("personal"), { busy: "work", confirm: null });
    expect(view.slots.every((s) => s.disabled)).toBe(true);
    expect(view.power.disabled).toBe(true);
  });
});

describe("the highest rev wins (contract §5)", () => {
  it("an older read never repaints a newer bar; an equal or newer one does", () => {
    const newer = served("idle"); // rev 48
    const older = served("personal"); // rev 45
    if (newer.kind !== "served" || older.kind !== "served") throw new Error("fixture");
    expect(adoptPhaseBar(newer, older.bar)).toBe(newer);
    expect(adoptPhaseBar(older, newer.bar)).toEqual(newer);
    expect(adoptPhaseBar({ kind: "loading" }, older.bar)).toEqual(older);
  });
  it("a newer marker repaints phase, toggles, stop, since and sentence; next/blocked and another phase's facts wait for the re-read", () => {
    const read = served("visit"); // rev 43
    const marker = parsePhaseMarker({ kind: "phase_changed", name: "castor", from: "visit", to: "idle", phase: "idle", toggles: { work: true, personal: false }, stopped: false, since: "2026-11-08T18:41:00.000+00:00", rev: 48, cause: "visit_closed", sentence: "Awake and reachable since 19:41; nothing of his own is running." })!;
    const next = adoptPhaseMarker(read, marker);
    expect(next).toMatchObject({ kind: "served", bar: { rev: 48, phase: "idle", toggles: { work: true, personal: false }, sentence: "Awake and reachable since 19:41; nothing of his own is running.", next: null, blocked: null, visit: null } });
    expect(lit(next!)).toEqual([]);
  });
  it("an older or equal marker changes nothing; without a served bar the caller re-reads", () => {
    const read = served("idle"); // rev 48
    const old = parsePhaseMarker({ kind: "phase_changed", phase: "personal", toggles: { work: true, personal: true }, stopped: false, since: null, rev: 45, sentence: "On his own time since 19:30." })!;
    expect(adoptPhaseMarker(read, old)).toBeNull();
    expect(adoptPhaseMarker(read, { ...old, rev: 48 })).toBeNull();
    expect(adoptPhaseMarker({ kind: "loading" }, { ...old, rev: 99 })).toBeNull();
  });
});
