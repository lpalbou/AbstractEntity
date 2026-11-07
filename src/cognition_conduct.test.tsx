/**
 * The conduct gauge's code row (operator 2026-11-07: "some values are missing? see if we can
 * retrieve them"). Real data path: the kit's own conductAxes over the turn facts the chat drawer
 * builds, then the app's conductCell.
 *
 * - RIG on a turn without tool calls is not missing data: rigor does not apply, so it reads "n/a"
 *   with its reason; a "—" is left only where a fact was not served, and every "—" says why.
 * - The per-call success the visit lane serves (tool_details[].success) reaches the gauge as `ok`
 *   (failure ticks on ACT, retries on RIG); it used to be dropped.
 */
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { conductAxes, type ConductFacts, type ConductToolCall } from "@abstractframework/ui-kit";

import { CONDUCT_AXES, conductCell, conductNow, MonitorInfoModal } from "./cognitive_monitor";
import { toolCallsOf } from "./cognition_wave_inline";

const cells = (facts: ConductFacts | null, tools: ConductToolCall[] | null) => {
  const axes = conductAxes(facts, tools, {});
  return Object.fromEntries(CONDUCT_AXES.map((a) => [a.id, conductCell(axes.find((x) => x.id === a.id), facts, tools)]));
};

describe("conductCell: every code shows a value or says why not", () => {
  it("the operator's screenshot turn (40.1 s, no tool calls, 44 recalled, 1 formed): RIG reads n/a, not —", () => {
    const c = cells({ think_ms: 40_100, tool_rounds: 0, memories_recalled: 44, memories_formed: 1 }, null);
    expect(Object.values(c).map((x) => x?.short)).toEqual(["40.1s", "0", "44+1", "n/a"]);
    expect(c.rigor?.now).toBe("n/a, this turn made no tool calls (rigor reads the names of its calls)");
    expect(c.effort?.now).toBe("40.1s (first turns — no session baseline yet)");
    expect(c.action?.now).toBe("0 rounds (first turns — no session baseline yet)");
  });

  it("no facts served at all: every code is — and says which fact is missing", () => {
    const c = cells(null, null);
    expect(Object.values(c).map((x) => x?.short)).toEqual(["—", "—", "—", "—"]);
    expect(c.effort?.now).toBe("not read (no timing/volume fact this turn)");
    expect(c.action?.now).toBe("not read (no tool facts this turn)");
    expect(c.attention?.now).toBe("not read (no recall fact this turn)");
    // the kit says "zero calls this turn" here; no tool fact was served, so that is not known
    expect(c.rigor?.now).toBe("not read, no tool facts were served for this turn");
  });

  it("tool rounds counted without call names: rigor is — and says so", () => {
    expect(cells({ tool_rounds: 2 }, null).rigor).toEqual({ short: "—", now: "not read, 2 tool rounds counted but no call names were served" });
    expect(cells({ tool_rounds: 1 }, []).rigor?.now).toBe("not read, 1 tool round counted but no call names were served");
  });

  it("with calls, the kit's reads pass through: failure ticks and a retry show once ok is known", () => {
    const tools = [{ name: "web_search", ok: false }, { name: "web_search", ok: true }, { name: "write_file" }];
    const c = cells({ think_ms: 900, tool_rounds: 3 }, tools);
    expect(c.action?.short).toBe("3·1✕");
    expect(c.rigor).toEqual({ short: "2/3", now: "2/3 verify-shaped · 1 retry" });
    expect(c.effort?.short).toBe("900ms");
  });

  it("a — never stands without its reason; before the gauge reports there is no cell", () => {
    for (const facts of [null, {}, { think_ms: 1 }, { tool_rounds: 0 }, { memories_recalled: 3 }] as Array<ConductFacts | null>) {
      for (const cell of Object.values(cells(facts, null))) {
        if (cell?.short === "—") expect(cell.now).toMatch(/^not read[ ,(].{10,}/);
      }
    }
    expect(conductCell(undefined, { tool_rounds: 0 }, null)).toBeNull();
    expect(conductNow(null)).toBe("This turn: not read yet.");
    expect(conductNow({ short: "n/a", now: "n/a, x" })).toBe("This turn: n/a, x.");
  });

  it("a conduct axis window states the turn's read without hover (touch path); other mounts pass none", () => {
    const rigor = CONDUCT_AXES.find((a) => a.id === "rigor")!;
    const conduct = cells({ tool_rounds: 0 }, null);
    const html = renderToStaticMarkup(<MonitorInfoModal axis={rigor} onClose={() => undefined} conduct={conduct} />);
    expect(html).toContain('<p class="cm_modal_now">This turn: n/a, this turn made no tool calls (rigor reads the names of its calls).</p>');
    // a conduct read is the turn's report, never "his words"
    expect(html).toContain("Read from the turn&#x27;s report");
    expect(html).not.toContain("Read from his words only");
    const warmth = renderToStaticMarkup(<MonitorInfoModal axis={{ id: "warmth", code: "WAR", name: "warmth", color: "#000", description: "x" }} onClose={() => undefined} />);
    expect(warmth).toContain("Read from his words only");
    expect(renderToStaticMarkup(<MonitorInfoModal axis={rigor} onClose={() => undefined} />)).not.toContain("This turn");
  });
});

describe("toolCallsOf: the turn report's calls, with their served success", () => {
  it("tool_details carry ok from success; tools_ran adds the names no detail covers", () => {
    expect(
      toolCallsOf({
        tool_details: [{ name: "web_search", success: false }, { name: "read_file", success: true }, { name: "diary_read" }],
        tools_ran: ["web_search", "write_file"],
      }),
    ).toEqual([{ name: "web_search", ok: false }, { name: "read_file", ok: true }, { name: "diary_read" }, { name: "write_file" }]);
    expect(toolCallsOf({ tools_ran: ["web_search"] })).toEqual([{ name: "web_search" }]);
  });

  it("a turn without calls is null (the gauge's no-call branch), never an empty list", () => {
    expect(toolCallsOf({})).toBeNull();
    expect(toolCallsOf({ tool_details: [], tools_ran: [] })).toBeNull();
  });

  it("the mounts use them: the drawer feeds toolCallsOf, the code row and the axis window read conductCell", () => {
    const drawer = readFileSync(new URL("./chat_drawer.tsx", import.meta.url), "utf8");
    const inline = readFileSync(new URL("./cognition_wave_inline.tsx", import.meta.url), "utf8");
    expect(drawer).toMatch(/return toolCallsOf\(d\);/);
    expect(inline).toMatch(/conductCell\(gaugeAxes\.find\(\(g\) => g\.id === a\.id\), effort, tools\)/);
    expect(inline).toMatch(/<span className="cm_gauge_val">\{cell\?\.short \?\? ""\}<\/span>/);
    expect(inline).toMatch(/conduct=\{conduct\}/);
  });
});
