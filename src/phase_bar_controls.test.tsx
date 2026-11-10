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

import { LOOP_CRASHED, OWN_TIME_REVOKED, STOPPED_TOGGLE, phaseBody } from "./fixtures/phase_bodies";
import { IDLE_NOT_NOW, STOP_CONSEQUENCE, WORK_IDLE, phaseBarRead, phaseBarView, sinceWords, type PhaseBarRead, type PhaseBarUi } from "./phase_bar";
import { PhaseBarControls, confirmSentence } from "./phase_bar_controls";
import { PHASE_BAR_UNSERVED, type ServedPhase } from "./phase_bar_source";

const NOW = Date.parse("2026-11-08T20:00:00.000+00:00");
const read = (phase: ServedPhase, overrides: Record<string, unknown> = {}): PhaseBarRead => phaseBarRead({ status: 200, code: null, body: phaseBody(phase, overrides) });
const render = (r: PhaseBarRead, ui: PhaseBarUi = { busy: null, confirm: null }, extra: Partial<React.ComponentProps<typeof PhaseBarControls>> = {}, resume = true) =>
  renderToStaticMarkup(
    <PhaseBarControls view={phaseBarView(r, ui, { nowMs: NOW, resume })} ui={ui} entityName="Castor" note={null} onAct={() => {}} onConfirm={() => {}} onCancel={() => {}} {...extra} />,
  );
const buttons = (html: string) => html.match(/<button[^>]*>.*?<\/button>/g) ?? [];
/** The indicator chips (review S4): `<span class="ec_pb_ind_wrap" …>chip + tooltip</span>`, whole. */
const indicators = (html: string): string[] => {
  const out: string[] = [];
  for (let at = html.indexOf('<span class="ec_pb_ind_wrap"'); at >= 0; at = html.indexOf('<span class="ec_pb_ind_wrap"', at + 1)) {
    let depth = 0;
    const re = /<\/?span\b[^>]*>/g;
    re.lastIndex = at;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      depth += m[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        out.push(html.slice(at, re.lastIndex));
        break;
      }
    }
  }
  return out;
};
/** Every pill in the bar's order: a button, or an indicator chip. */
const pills = (html: string): string[] =>
  [...buttons(html), ...indicators(html)]
    .filter((b) => /ec_pb_(idle|visit|work|personal|sleep)\b/.test(b))
    .sort((a, b) => html.indexOf(a) - html.indexOf(b));
const pill = (html: string, key: string) => pills(html).find((b) => b.includes(`ec_pb_${key} `) || b.includes(`ec_pb_${key}"`))!;
/** An indicator: no button, a status chip a keyboard reaches, its words in a tooltip it points at. */
const expectIndicator = (chip: string, title: string) => {
  expect(chip, chip).toMatch(/^<span class="ec_pb_ind_wrap" tabindex="0" role="status" aria-live="off"/);
  expect(chip).not.toContain("<button");
  expect(chip).not.toContain("disabled");
  expect(chip).not.toMatch(/ title=/);
  const tip = /aria-describedby="([^"]+)"/.exec(chip)![1];
  expect(chip).toContain(`<span class="ec_pb_tip" role="tooltip" id="${tip}">${title}</span>`);
};
const button = (html: string, cls: string) => buttons(html).find((b) => b.includes(cls));

describe("PhaseBarControls", () => {
  it("personal on + exploring: personal lit and pressed; visit, work and sleep plain indicators; a red Stop", () => {
    const html = render(read("personal"));
    expect(pill(html, "personal")).toContain("ec_pb_lit");
    expect(pill(html, "personal")).toContain('aria-pressed="true"');
    expect(pill(html, "personal")).toContain("ec_pb_toggle");
    expect(pill(html, "work")).not.toContain("aria-pressed");
    expect(pill(html, "work")).not.toContain("ec_pb_toggle");
    expect(pill(html, "work")).not.toContain("ec_pb_ring");
    expect(pill(html, "work")).not.toContain("ec_pb_lit");
    expect(pill(html, "visit")).not.toContain("aria-pressed");
    expect(pill(html, "sleep")).not.toContain("aria-pressed");
    const power = button(html, "ec_pb_power")!;
    expect(power).toContain("af-chip--error");
    expect(power).toMatch(/>Stop<\/span><\/button>$/);
    expect(html).toContain('role="status"');
    // The gateway's sentence (no clock time) and since, in the viewer's time.
    expect(html).toContain(`>On his own time.<span class="ec_pb_since"> · ${sinceWords("2026-11-08T18:30:00.000+00:00", NOW)}</span></span>`);
  });

  it("where he goes next sits after since ('then: own time' from the served next.phase); nothing when none is served", () => {
    const html = render(read("visit"));
    expect(html).toContain(`>In a visit with Laurent.<span class="ec_pb_since"> · ${sinceWords("2026-11-08T18:15:02.000+00:00", NOW)}</span><span class="ec_pb_then"> · then: own time</span></span>`);
    expect(render(read("work", { next: { phase: "idle", sentence: "When his jobs are done, he stays awake and reachable." } }))).toContain('<span class="ec_pb_then"> · then: idle</span>');
    expect(render(read("personal"))).not.toContain("ec_pb_then");
    expect(render(read("visit", { next: { phase: null, sentence: "When the visit closes, he returns to what he was doing." } }))).not.toContain("ec_pb_then");
  });

  it("idle: the idle indicator lit (no pressed state, no click, the gateway's sentence as its tooltip), the toggles as they are", () => {
    const html = render(read("idle"));
    expect(html.match(/ec_pb_lit/g)).toHaveLength(1);
    const idle = pill(html, "idle");
    expect(idle).toContain("ec_pb_lit");
    expectIndicator(idle, "Awake and reachable; nothing of his own is running. Own time is off; he stays awake.");
    expect(idle).toContain('aria-label="idle (now)"');
    expect(idle).not.toContain("aria-pressed");
    expect(idle).not.toContain("ec_pb_toggle");
    expect(idle).not.toContain("ec_pb_ring");
    expect(idle).toContain('>○ </span>idle</span></span><span class="ec_pb_tip"');
    expect(pill(html, "personal")).toContain('aria-pressed="false"');
    expect(html).toContain("Awake and reachable; nothing of his own is running.");
    // Idle comes first, then the four phases.
    expect(pills(html).map((b) => b.match(/ec_pb_(idle|visit|work|personal|sleep)\b/)![1])).toEqual(["idle", "visit", "work", "personal", "sleep"]);
  });

  it("any other state: the idle indicator unlit, disabled, saying what idle is", () => {
    for (const phase of ["visit", "work", "personal", "sleep"] as const) {
      const idle = pill(render(read(phase)), "idle");
      expect(idle).not.toContain("ec_pb_lit");
      expectIndicator(idle, IDLE_NOT_NOW);
      expect(idle).toContain('aria-label="idle"');
    }
  });

  it("stopped: Resume (not red), the toggles and sleep disabled with the gateway's words, the visit pill offers Resume and visit; a host can leave the sentence out (a roster tile)", () => {
    const html = render(read("stopped"), undefined, { showSentence: false });
    const power = button(html, "ec_pb_power")!;
    expect(power).toContain("af-chip--success");
    expect(power).toMatch(/>Resume<\/span><\/button>$/);
    for (const key of ["personal", "sleep"]) expect(pill(html, key)).toMatch(/^<button[^>]*disabled/);
    expectIndicator(pill(html, "work"), "Stopped. Nothing runs until you resume him.");
    expect(pill(html, "personal")).toContain(`title="${STOPPED_TOGGLE}"`);
    // v3 D3: the stop revoked own time; the toggle shows it.
    expect(pill(html, "personal")).toContain('aria-pressed="false"');
    expect(pill(html, "visit")).not.toContain("disabled");
    expect(pill(html, "visit")).toContain("Stopped. Resume to visit. Click to resume him, then visit.");
    expect(html).not.toContain("ec_pb_sentence");
    expect(html).not.toContain("ec_pb_stop_again");
  });

  it("Resume and visit confirms inline: the question, Resume and visit, Cancel", () => {
    const html = render(read("stopped"), { busy: null, confirm: "resume_visit" });
    expect(html).toContain(confirmSentence("resume_visit", "Castor"));
    expect(html).toContain("Castor is stopped. Resume him and visit? He comes back idle, then the conversation opens.");
    expect(html).toContain(">Resume and visit</span></button>");
    expect(html).toContain('aria-label="Confirm resume and visit"');
  });

  it("a stop that left something outstanding: a second red Stop beside Resume", () => {
    const html = render(read("stopped"), { busy: null, confirm: null, stopIncomplete: true });
    const again = button(html, "ec_pb_stop_again")!;
    expect(again).toContain("af-chip--error");
    expect(again).toMatch(/>Stop<\/span><\/button>$/);
    expect(again).not.toContain("disabled");
    expect(button(html, "ec_pb_power")).toMatch(/>Resume<\/span><\/button>$/);
  });

  it("a visit that waits for him shows its state word beside the label (the label stays)", () => {
    const waiting = render(read("visit", { visit: { ...(phaseBody("visit").visit as object), waiting_for: "loop" } }));
    expect(pill(waiting, "visit")).toContain('visit<span class="ec_pb_badge">waiting</span>');
    expect(render(read("personal"))).not.toContain("ec_pb_badge");
    expect(render(read("work"))).not.toContain("ec_pb_badge");
  });

  it("working with 2 jobs queued (v3 D1): work lit, no toggle; the line says the queue; the tooltip names the job and since when", () => {
    const html = render(read("work"));
    const work = pill(html, "work");
    expect(work).toContain("ec_pb_lit");
    expectIndicator(work, `Working on a request from an agent. Current job: summon, ${sinceWords("2026-11-08T18:20:00.000+00:00", NOW)}. 2 jobs queued.`);
    expect(html).toContain(
      `>Working on a request from an agent.<span class="ec_pb_since"> · ${sinceWords("2026-11-08T18:20:00.000+00:00", NOW)}</span><span class="ec_pb_queue"> · 2 jobs queued</span><span class="ec_pb_then"> · then: own time</span></span>`,
    );
    // Idle: unlit work, its tooltip says a job starts it; no queue in the line.
    const idle = render(read("idle"));
    expectIndicator(pill(idle, "work"), WORK_IDLE);
    expect(idle).not.toContain("ec_pb_queue");
  });

  it("asleep for a threshold (v3 D2): the line says why, from the served reason", () => {
    const html = render(read("sleep", { sleep: { kind: "self", reason: "24 h since the last sleep", since: "2026-11-08T18:02:00.000+00:00", ends: "when maintenance is done" } }));
    expect(html).toContain('<span class="ec_pb_reason"> · asleep: 24 h since the last sleep</span>');
    expect(pill(html, "sleep")).toContain("Asleep: 24 h since the last sleep.");
    // Asleep, the sleep pill is an indicator (nothing to click); awake, it offers "sleep now".
    expect(pill(html, "sleep")).toMatch(/^<span class="ec_pb_ind_wrap"/);
    expect(pill(html, "sleep")).toContain('aria-label="sleep (now)"');
    expect(pill(render(read("idle")), "sleep")).toMatch(/^<button/);
    expect(render(read("idle"))).not.toContain("ec_pb_reason");
  });

  it("sleep now during a visit: the pill is disabled and its tooltip is the gateway's sentence", () => {
    expect(pill(render(read("visit")), "sleep")).toMatch(/title="He is in a visit; end it to let him sleep\."[^>]*disabled/);
  });

  it("own time stopped unexpectedly: the warning and a Retry; never on a roster tile", () => {
    const html = render(read("idle", LOOP_CRASHED));
    expect(html).toContain('<span class="ec_pb_blocked">His own time stopped unexpectedly. Retry to start it again.</span>');
    expect(button(html, "ec_pb_retry")).toMatch(/>Retry<\/span><\/button>$/);
    expect(render(read("idle", LOOP_CRASHED), undefined, { showPower: false })).not.toContain("ec_pb_retry");
    expect(render(read("idle"))).not.toContain("ec_pb_retry");
  });

  it("a toggle's markup differs only by its pressed state (the label never swaps to a verb)", () => {
    const on = pill(render(read("idle", { toggles: { personal: true } })), "personal");
    const off = pill(render(read("idle", { toggles: { personal: false } })), "personal");
    expect(off.replace('aria-pressed="false"', "")).toBe(on.replace('aria-pressed="true"', "").replace(PERSONAL_TITLE_ON, PERSONAL_TITLE_OFF));
  });

  it("Stop confirms inline: the question says it cancels his own time and Resume lands idle; Stop now, Cancel; the power button holds meanwhile", () => {
    const html = render(read("personal"), { busy: null, confirm: "stop" });
    expect(html).toContain(confirmSentence("stop", "Castor"));
    expect(STOP_CONSEQUENCE).toBe("Stop halts everything now and cancels his own time; after Resume he is idle until you grant own time again.");
    expect(html).toContain(`<span class="ec_pb_confirm_text">Stop Castor? ${STOP_CONSEQUENCE}</span>`);
    expect(html).toContain(">Stop now</span></button>");
    expect(html).toContain(">Cancel</span></button>");
    expect(button(html, "ec_pb_power")).toContain("disabled");
  });

  it("Stop now and Cancel never wait for a toggle in flight; the power button stays live and shows a Stop in flight", () => {
    const html = render(read("personal"), { busy: "personal", confirm: "stop" });
    expect(button(html, "ec_pb_confirm_yes")).not.toContain("disabled");
    expect(button(html, "ec_pb_confirm_no")).not.toContain("disabled");
    const busy = render(read("personal"), { busy: "personal", confirm: null });
    expect(button(busy, "ec_pb_power")).not.toContain("disabled");
    for (const key of ["visit", "personal", "sleep"]) expect(pill(busy, key)).toMatch(/^<button[^>]*disabled/);
    for (const key of ["idle", "work"]) expect(pill(busy, key)).toMatch(/^<span class="ec_pb_ind_wrap"/);
    const stopping = render(read("personal"), { busy: null, stopping: true, confirm: null });
    const power = button(stopping, "ec_pb_power")!;
    expect(power).toContain("ec_pb_busy");
    expect(power).not.toContain("disabled");
  });

  it("before the first read and after a failed one the bar offers Stop; a gateway without the bar does not", () => {
    for (const r of [{ kind: "loading" }, { kind: "failed", sentence: "Could not read his phase: HTTP 502" }] as PhaseBarRead[]) {
      const power = button(render(r), "ec_pb_power")!;
      expect(power).toMatch(/>Stop<\/span><\/button>$/);
      expect(power).not.toContain("disabled");
    }
    expect(button(render({ kind: "unserved" }), "ec_pb_power")).toContain("disabled");
  });

  it("Sleep now and Resume and visit wait for a write in flight", () => {
    expect(button(render(read("idle"), { busy: "personal", confirm: "sleep" }), "ec_pb_confirm_yes")).toContain("disabled");
    expect(button(render(read("stopped"), { busy: null, stopping: true, confirm: "resume_visit" }), "ec_pb_confirm_yes")).toContain("disabled");
  });

  it("sleep now confirms inline too", () => {
    const html = render(read("idle"), { busy: null, confirm: "sleep" });
    expect(html).toContain("Put Castor to sleep now? He wakes by himself when his maintenance is done.");
    expect(html).toContain(">Sleep now</span></button>");
  });

  it("the stop's receipt shows as the note", () => {
    expect(render(read("stopped"), undefined, { note: OWN_TIME_REVOKED })).toContain(`<span class="ec_pb_note" role="status">${OWN_TIME_REVOKED}</span>`);
  });

  it("a refusal shows as its sentence; blocked shows as a warning", () => {
    expect(render(read("stopped"), undefined, { note: "Stopped. Resume him first, then choose what he may do." })).toContain(
      '<span class="ec_pb_note" role="status">Stopped. Resume him first, then choose what he may do.</span>',
    );
    const blocked = render(read("idle", { blocked: { code: "own_time_start_failed", sentence: "His own time could not start: no mind is set for castor.", action: "retry" } }));
    expect(blocked).toContain('<span class="ec_pb_blocked">His own time could not start: no mind is set for castor.</span>');
  });

  it("unserved (an older gateway, a v1 body included): the one sentence, every control disabled", () => {
    const html = render({ kind: "unserved" });
    expect(html).toContain(PHASE_BAR_UNSERVED);
    expect(buttons(html).every((b) => b.includes("disabled"))).toBe(true);
    const v1 = phaseBody("personal");
    delete v1.can;
    delete v1.generation;
    expect(render(phaseBarRead({ status: 200, code: null, body: v1 }))).toContain(PHASE_BAR_UNSERVED);
  });

  it("the roster's bar has no power button, and its stopped visit pill only says why", () => {
    expect(render(read("personal"), undefined, { showPower: false })).not.toContain("ec_pb_power");
    expect(pill(render(read("stopped"), undefined, { showPower: false }, false), "visit")).toMatch(/title="Stopped\. Resume to visit\."[^>]*disabled/);
  });

  it("indicators are never disabled buttons: status chips a keyboard reaches, their tooltip shown on hover and on focus, set apart from the two actionable chips (review S4)", () => {
    for (const phase of ["idle", "visit", "work", "personal", "sleep", "stopped"] as const) {
      const html = render(read(phase));
      for (const key of ["idle", "work"]) expect(pill(html, key), `${phase}/${key}`).toMatch(/^<span class="ec_pb_ind_wrap" tabindex="0" role="status" aria-live="off"/);
      for (const key of ["visit", "personal"]) expect(pill(html, key), `${phase}/${key}`).toMatch(/^<button/);
      // No pill is ever a disabled indicator button.
      for (const b of buttons(html)) expect(b).not.toMatch(/ec_pb_(idle|work)\b/);
    }
    // Two indicators on one roster page never share a tooltip id.
    const bar = (r: PhaseBarRead) => (
      <PhaseBarControls view={phaseBarView(r, { busy: null, confirm: null }, { nowMs: NOW })} ui={{ busy: null, confirm: null }} entityName="Castor" note={null} onAct={() => {}} onConfirm={() => {}} onCancel={() => {}} showPower={false} />
    );
    const two = renderToStaticMarkup(
      <>
        {bar(read("idle"))}
        {bar(read("work"))}
      </>,
    );
    const ids = [...two.matchAll(/<span class="ec_pb_tip" role="tooltip" id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const css = fs.readFileSync(path.join(__dirname, "entity.css"), "utf8");
    expect(css).toMatch(/\.ec_pb_ind_wrap:hover > \.ec_pb_tip,\s*\.ec_pb_ind_wrap:focus > \.ec_pb_tip \{\s*display: block;/);
    expect(css).toMatch(/\.ec_pb_tip \{\s*display: none;/);
    expect(css).toMatch(/\.ec_pb_ind\.af-chip \{\s*border-style: dashed;\s*cursor: default;/);
    // The actionable chips' hover lift never reaches an indicator.
    expect(css).toContain('.ec_pb_pill.af-chip:not(.ec_pb_lit):not([aria-pressed="true"]):not(.ec_pb_ind):hover:not(:disabled)');
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

  it("stopped, as the page draws it: the stop's sentence in the bar's own sentence line, marked stopped", () => {
    const html = render(read("stopped"), undefined, { className: "ec_pb_stopped" });
    expect(html).toContain('class="ec_phase_bar ec_pb_stopped"');
    expect(html).toMatch(/<span class="ec_pb_sentence" role="status"[^>]*>Stopped\. Nothing runs until you resume him\./);
  });

  it("the page renders the bar from the served read, with Stop / Resume; stopped, the bar's own sentence line says so (no banner: nothing shifts, backlog 0013)", () => {
    expect(view).toContain("<PhaseBarControls");
    expect(view).toContain("const phaseView = phaseBarView(phaseRead, phaseUi);");
    const bar = view.slice(view.indexOf("<PhaseBarControls"), view.indexOf("/>", view.indexOf("<PhaseBarControls")));
    expect(bar).not.toContain("showSentence");
    expect(bar).toContain('className={phaseView.stopped ? "ec_pb_stopped" : undefined}');
    expect(view).not.toContain("entity_stopped_banner");
    // The stop is said at once to a screen reader (the banner's role="alert"): an alert region always
    // present, carrying the stop's sentence while stopped.
    expect(view).toContain('<span className="sr_only" role="alert">\n            {phaseView.stopped ? phaseView.sentence : ""}\n          </span>');
    const css = fs.readFileSync(path.join(__dirname, "entity.css"), "utf8");
    expect(css).not.toContain("entity_stopped_banner");
    expect(css).toMatch(/\.ec_phase_bar\.ec_pb_stopped \.ec_pb_sentence \{[^}]*color: color-mix\(in srgb, var\(--scar\) 60%, var\(--text\)\);/);
    expect(css).toMatch(/\.ec_phase_bar\.ec_pb_stopped \.ec_pb_sentence::before \{\s*content: "⛔ " \/ "";/);
  });

  it("Stop is never held by a write in flight: the page lets it through and the lanes send it at once", () => {
    expect(view).toContain('if (act !== "stop" && phaseWritesRef.current.held()) return;');
    expect(view).toContain("phaseWritesRef.current.run(act, () => send(base, token), {");
    expect(view).toContain("phaseWritesRef.current.reset();");
    expect(view).not.toContain("phaseBusyRef");
    expect(view).toContain("const cancelPhaseConfirm = useCallback(() => setPhaseUi((u) => ({ ...u, confirm: null })), []);");
  });

  it("the acts go through the contract's routes only", () => {
    expect(view).toContain("putPhaseToggle(base, entityName, plan.key, plan.on, token)");
    expect(view).toContain('postLifecycle(base, entityName, "stop", token)');
    expect(view).toContain('postLifecycle(base, entityName, "resume", token)');
    expect(view).toContain('postLifecycle(base, entityName, "retry", token)');
    expect(view).toContain("postSleepNow(gatewayUrl.trim()");
  });

  it("live: the stream's phase marker repaints by rev and re-reads; the poll stays the fallback", () => {
    expect(view).toContain("cache.marker = highestPhaseMarker(envelopes, from, appendable ? cache.marker : null);");
    expect(view).toContain("const painted = adoptPhaseMarker(cur, marker);");
    expect(view).toContain("if (painted || cur.kind !== \"served\") readPhaseBarRef.current();");
    expect(view).toContain("setPhaseRead((cur) => adoptPhaseRead(cur, next));");
  });

  it("Resume and visit: the resume, then (once he runs again) the visit opens as the visit pill opens it", () => {
    expect(view).toMatch(/const resumeAndVisit = useCallback\([\s\S]{0,200}postLifecycle\(base, entityName, "resume", token\),[\s\S]{0,200}if \(!out\.ok \|\| !out\.bar \|\| out\.bar\.stopped\) return;[\s\S]{0,120}setVisitKnock\(\(n\) => n \+ 1\);/);
    expect(view).toContain('else if (kind === "resume_visit") resumeAndVisit();');
    // The Chat tab's offer after an open met a Stop (409 stopped_use_resume) runs the same act.
    expect(view).toContain("onResumeAndVisit={resumeAndVisit}");
    expect(drawer).toContain("props.onResumeAndVisit();");
  });

  it("the roster's tiles draw the bar without Resume (so no Resume and visit), and ask only sleep now", () => {
    expect(roster).toContain("const view = phaseBarView(tilePhaseRead(tile), ui, { resume: false });");
    expect(roster).toContain('plan.confirm === "sleep" ? setTileUi');
  });

  it("the visit pill knocks through the drawer's own open", () => {
    expect(view).toContain("knockRequest={visitKnock}");
    expect(view).toContain("setVisitKnock((n) => n + 1);");
    expect(drawer).toContain("knockRequest?: number;");
    expect(drawer).toMatch(/if \(runId \|\| busy !== "idle"\) return;[\s\S]{0,140}open\(\);/);
  });
});

describe("the Stop receipt in the bar: every row by its sentence, a failed one in the kit's warning tone", () => {
  it("rows in order; the failed rows carry the warning tone, the others the note's", () => {
    const html = render(read("stopped"), undefined, {
      note: {
        receipt: [
          { sentence: OWN_TIME_REVOKED, failed: false },
          { sentence: "The Stop stands, but its signal file could not be written; press Stop again.", failed: true },
          { sentence: "His own-time process could not be checked (its status file is denied); press Stop again.", failed: true },
        ],
      },
    });
    const note = html.match(/<span class="ec_pb_note ec_pb_receipt" role="status">[\s\S]*?<\/span><\/span>(?=<|$)/)?.[0] ?? "";
    expect(note).toContain(`<span class="ec_pb_receipt_row">${OWN_TIME_REVOKED}</span>`);
    expect(note).toContain('<span class="ec_pb_receipt_row ec_pb_receipt_failed" data-tone="warning">The Stop stands, but its signal file could not be written; press Stop again.</span>');
    expect(note).toContain('<span class="ec_pb_receipt_row ec_pb_receipt_failed" data-tone="warning">His own-time process could not be checked (its status file is denied); press Stop again.</span>');
    expect(note.match(/ec_pb_receipt_row/g)).toHaveLength(3);
    const css = fs.readFileSync(path.join(__dirname, "entity.css"), "utf8");
    expect(css).toMatch(/\.ec_pb_receipt_failed \{\s*color: var\(--warning\);/);
  });

  it("the page's Stop answers land as the receipt (phase_bar_writes: phaseNoteOf)", () => {
    const writes = fs.readFileSync(path.join(__dirname, "phase_bar_writes.ts"), "utf8");
    expect(writes).toContain("host.note(phaseNoteOf(out));");
  });
});
