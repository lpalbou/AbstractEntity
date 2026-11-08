/**
 * The phase bar component (kit chips) rendered with react-dom/server (the package ships no DOM for
 * tests), and the wiring that makes it the one phase control of the entity page and the roster.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findVerbToggleLabels } from "@abstractframework/ui-kit";
import { describe, expect, it } from "vitest";

import { phaseBody } from "./fixtures/phase_bodies";
import { phaseBarRead, phaseBarView, type PhaseBarRead, type PhaseBarUi } from "./phase_bar";
import { PhaseBarControls, confirmSentence } from "./phase_bar_controls";
import { PHASE_BAR_UNSERVED, type ServedPhase } from "./phase_bar_source";

const read = (phase: ServedPhase, overrides: Record<string, unknown> = {}): PhaseBarRead => phaseBarRead({ status: 200, code: null, body: phaseBody(phase, overrides) });
const render = (r: PhaseBarRead, ui: PhaseBarUi = { busy: null, confirm: null }, extra: Partial<React.ComponentProps<typeof PhaseBarControls>> = {}) =>
  renderToStaticMarkup(
    <PhaseBarControls view={phaseBarView(r, ui)} ui={ui} entityName="Castor" note={null} onAct={() => {}} onConfirm={() => {}} onCancel={() => {}} {...extra} />,
  );
const buttons = (html: string) => html.match(/<button[^>]*>.*?<\/button>/g) ?? [];
const pill = (html: string, key: string) => buttons(html).find((b) => b.includes(`ec_pb_${key} `) || b.includes(`ec_pb_${key}"`))!;

describe("PhaseBarControls", () => {
  it("personal on + exploring: personal lit and pressed, work pressed, visit and sleep plain indicators, a red Stop", () => {
    const html = render(read("personal"));
    expect(pill(html, "personal")).toContain("ec_pb_lit");
    expect(pill(html, "personal")).toContain('aria-pressed="true"');
    expect(pill(html, "work")).toContain('aria-pressed="true"');
    expect(pill(html, "work")).not.toContain("ec_pb_lit");
    expect(pill(html, "visit")).not.toContain("aria-pressed");
    expect(pill(html, "sleep")).not.toContain("aria-pressed");
    const power = buttons(html).find((b) => b.includes("ec_pb_power"))!;
    expect(power).toContain("af-chip--error");
    expect(power).toMatch(/>Stop<\/span><\/button>$/);
    expect(html).toContain('role="status"');
    expect(html).toContain(">On his own time since 19:30.</span>");
  });

  it("idle: nothing lit, the toggles as they are, the gateway's sentence", () => {
    const html = render(read("idle"));
    expect(html).not.toContain("ec_pb_lit");
    expect(pill(html, "personal")).toContain('aria-pressed="false"');
    expect(html).toContain("Awake and reachable since 19:41; nothing of his own is running.");
  });

  it("stopped: Resume (not red), every pill disabled, and the page can move the sentence to its banner", () => {
    const html = render(read("stopped"), undefined, { showSentence: false });
    const power = buttons(html).find((b) => b.includes("ec_pb_power"))!;
    expect(power).toContain("af-chip--success");
    expect(power).toMatch(/>Resume<\/span><\/button>$/);
    for (const key of ["visit", "work", "personal", "sleep"]) expect(pill(html, key)).toContain("disabled");
    expect(html).not.toContain("ec_pb_sentence");
  });

  it("a toggle's markup differs only by its pressed state (the label never swaps to a verb)", () => {
    const on = pill(render(read("idle", { toggles: { work: true, personal: true } })), "personal");
    const off = pill(render(read("idle", { toggles: { work: true, personal: false } })), "personal");
    expect(off.replace('aria-pressed="false"', "")).toBe(on.replace('aria-pressed="true"', "").replace(PERSONAL_TITLE_ON, PERSONAL_TITLE_OFF));
  });

  it("Stop confirms inline: the question, Stop now, Cancel; the power button holds meanwhile", () => {
    const html = render(read("personal"), { busy: null, confirm: "stop" });
    expect(html).toContain(confirmSentence("stop", "Castor"));
    expect(html).toContain(">Stop now</span></button>");
    expect(html).toContain(">Cancel</span></button>");
    expect(buttons(html).find((b) => b.includes("ec_pb_power"))).toContain("disabled");
  });

  it("sleep now confirms inline too", () => {
    const html = render(read("idle"), { busy: null, confirm: "sleep" });
    expect(html).toContain("Put Castor to sleep now? He wakes by himself when his maintenance is done.");
    expect(html).toContain(">Sleep now</span></button>");
  });

  it("a refusal shows as its sentence; blocked shows as a warning", () => {
    expect(render(read("stopped"), undefined, { note: "Castor is stopped. Resume him first, then choose what he may do." })).toContain(
      '<span class="ec_pb_note" role="status">Castor is stopped. Resume him first, then choose what he may do.</span>',
    );
    const blocked = render(read("idle", { blocked: { code: "own_time_start_failed", sentence: "His own time could not start: no mind is set for castor." } }));
    expect(blocked).toContain('<span class="ec_pb_blocked">His own time could not start: no mind is set for castor.</span>');
  });

  it("unserved: the one sentence, every control disabled", () => {
    const html = render({ kind: "unserved" });
    expect(html).toContain(PHASE_BAR_UNSERVED);
    expect(buttons(html).every((b) => b.includes("disabled"))).toBe(true);
  });

  it("the roster's bar has no power button", () => {
    expect(render(read("personal"), undefined, { showPower: false })).not.toContain("ec_pb_power");
  });

  it("no verb-toggle labels in the bar's sources", () => {
    for (const f of ["phase_bar_controls.tsx", "phase_bar.ts"]) {
      expect(findVerbToggleLabels(fs.readFileSync(path.join(__dirname, f), "utf8"))).toEqual([]);
    }
  });
});

const PERSONAL_TITLE_ON = "Personal time is allowed: he explores his own ideas, sleeps for maintenance when he needs to and wakes by himself.";
const PERSONAL_TITLE_OFF = "Personal time is not allowed: he stays awake and can be visited.";

describe("wiring: the phase bar is the one phase control", () => {
  const view = fs.readFileSync(path.join(__dirname, "entity_view.tsx"), "utf8");
  const roster = fs.readFileSync(path.join(__dirname, "entities_index.tsx"), "utf8");
  const drawer = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "stream_source.ts"), "utf8");

  it("the old radio, the loop start/stop clients and `state paused` as stop are gone", () => {
    for (const src of [view, roster]) {
      expect(src).not.toMatch(/AfPhaseRadio|startLoop\(|stopLoop\(|toggleLoop|toggleOwnTime|sendState\(/);
      expect(src).not.toContain('"paused"');
    }
    expect(source).not.toMatch(/export function (startLoop|stopLoop|getServerLifeState|parseLoopRefusal)\b/);
    expect(source).not.toContain("loop/start");
    expect(source).not.toContain("loop/stop");
  });

  it("the page renders the bar from the served read, with Stop / Resume and the stopped banner from the same view", () => {
    expect(view).toContain("<PhaseBarControls");
    expect(view).toContain("const phaseView = phaseBarView(phaseRead, phaseUi);");
    expect(view).toContain("showSentence={!phaseView.stopped}");
    expect(view).toContain('phaseView.stopped ? (\n        <div className="entity_stopped_banner" role="alert">');
  });

  it("the acts go through the contract's routes only", () => {
    expect(view).toContain("putPhaseToggle(base, entityName, plan.key, plan.on, token)");
    expect(view).toContain('postLifecycle(base, entityName, "stop", token)');
    expect(view).toContain('postLifecycle(base, entityName, "resume", token)');
    expect(view).toContain("postSleepNow(gatewayUrl.trim()");
  });

  it("live: the stream's phase marker repaints by rev and re-reads; the poll stays the fallback", () => {
    expect(view).toContain("cache.marker = highestPhaseMarker(envelopes, from, appendable ? cache.marker : null);");
    expect(view).toContain("const painted = adoptPhaseMarker(cur, marker);");
    expect(view).toContain("if (painted || cur.kind !== \"served\") readPhaseBarRef.current();");
    expect(view).toContain("setPhaseRead((cur) => (next.kind === \"served\" ? adoptPhaseBar(cur, next.bar) : next));");
  });

  it("the visit pill knocks through the drawer's own open", () => {
    expect(view).toContain("knockRequest={visitKnock}");
    expect(view).toContain("setVisitKnock((n) => n + 1);");
    expect(drawer).toContain("knockRequest?: number;");
    expect(drawer).toMatch(/if \(runId \|\| busy !== "idle"\) return;[\s\S]{0,140}open\(\);/);
  });
});
