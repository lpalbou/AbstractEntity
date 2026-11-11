/**
 * The conduct gauge's code row (operator 2026-11-07: "some values are missing? see if we can
 * retrieve them"). Real data path: the kit's own conductAxes over the turn facts the chat drawer
 * builds, then the app's conductCell.
 *
 * - No value prints "—" (operator 2026-11-07: "I am ok with '—' when there is no value, it's
 *   less crowded"), RIG on a turn without tool calls included; the code's hover card says why.
 * - The per-call success the visit lane serves (tool_details[].success) reaches the gauge as `ok`
 *   (failure ticks on ACT, retries on RIG); it used to be dropped.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conductAxes, type ConductFacts, type ConductToolCall } from "@abstractframework/ui-kit";

import { CONDUCT_AXES, conductCell, conductExplainer } from "./cognitive_monitor";
import { toolCallsOf } from "./cognition_wave_inline";

const cells = (facts: ConductFacts | null, tools: ConductToolCall[] | null) => {
  const axes = conductAxes(facts, tools, {});
  return Object.fromEntries(CONDUCT_AXES.map((a) => [a.id, conductCell(axes.find((x) => x.id === a.id), facts, tools)]));
};

describe("conductCell: a value, or — with its reason on the card", () => {
  it("the operator's screenshot turn (40.1 s, no tool calls, 44 recalled, 1 formed): RIG prints —, its card says why", () => {
    const c = cells({ think_ms: 40_100, tool_rounds: 0, memories_recalled: 44, memories_formed: 1 }, null);
    expect(Object.values(c).map((x) => x?.short)).toEqual(["40.1s", "0", "44+1", "—"]);
    expect(c.rigor).toEqual({ short: "—", value: "—", reason: "This turn made no tool calls; rigor reads the names of its calls." });
    expect(c.effort).toEqual({ short: "40.1s", value: "40.1s", reason: "First turns — no session baseline yet." });
    expect(c.attention).toMatchObject({ short: "44+1", value: "44 recalled · +1 formed" });
  });

  it("no facts served at all: every code is — and its card says which fact is missing", () => {
    const c = cells(null, null);
    expect(Object.values(c).map((x) => x?.short)).toEqual(["—", "—", "—", "—"]);
    expect(c.effort?.reason).toBe("No timing/volume fact this turn.");
    expect(c.action?.reason).toBe("No tool facts this turn.");
    expect(c.attention?.reason).toBe("No recall fact this turn.");
    // the kit says "zero calls this turn" here; no tool fact was served, so that is not known
    expect(c.rigor?.reason).toBe("No tool facts were served for this turn.");
  });

  it("tool rounds counted without call names: rigor is — and its card says so", () => {
    expect(cells({ tool_rounds: 2 }, null).rigor).toEqual({ short: "—", value: "—", reason: "2 tool rounds counted, but no call names were served." });
    expect(cells({ tool_rounds: 1 }, []).rigor?.reason).toBe("1 tool round counted, but no call names were served.");
  });

  it("with calls, the kit's reads pass through: failure ticks and a retry show once ok is known", () => {
    const tools = [{ name: "web_search", ok: false }, { name: "web_search", ok: true }, { name: "write_file" }];
    const c = cells({ think_ms: 900, tool_rounds: 3 }, tools);
    expect(c.action?.short).toBe("3·1✕");
    expect(c.rigor).toEqual({ short: "2/3", value: "2/3 verify-shaped · 1 retry" });
    expect(c.effort?.short).toBe("900ms");
  });

  it("a — always has its reason; before the gauge reports there is no cell", () => {
    for (const facts of [null, {}, { think_ms: 1 }, { tool_rounds: 0 }, { memories_recalled: 3 }] as Array<ConductFacts | null>) {
      for (const cell of Object.values(cells(facts, null))) {
        if (cell?.short === "—") expect(cell.reason).toMatch(/^[A-Z0-9].{10,}\.$/);
      }
    }
    expect(conductCell(undefined, { tool_rounds: 0 }, null)).toBeNull();
  });

  it("a conduct code's card: what it measures, this turn's read, the reason", () => {
    const rigor = CONDUCT_AXES.find((a) => a.id === "rigor")!;
    expect(conductExplainer(rigor, cells({ tool_rounds: 0 }, null).rigor)).toEqual({
      // The conduct goes by its name (backlog 0036): no code on its card.
      code: "",
      name: "rigor",
      color: rigor.color,
      summary: "The share of his tool calls that are verification-shaped (read, check, search), by their names.",
      facts: [{ label: "This turn", value: "—" }],
      note: "This turn made no tool calls; rigor reads the names of its calls.",
    });
    const action = CONDUCT_AXES.find((a) => a.id === "action")!;
    const withCalls = cells({ tool_rounds: 3 }, [{ name: "web_search", ok: false }, { name: "read_file" }, { name: "x" }]);
    expect(conductExplainer(action, withCalls.action)).toMatchObject({ facts: [{ label: "This turn", value: "3 rounds · 3 calls · 1 fail" }] });
    expect(conductExplainer(rigor, cells({ tool_rounds: 1 }, [{ name: "read_file" }]).rigor)).not.toHaveProperty("note");
    expect(conductExplainer(rigor, null)).toMatchObject({ facts: [{ label: "This turn", value: "—" }], note: "Not read yet." });
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

  it("the mounts use them: the drawer feeds toolCallsOf, the monitor's conduct list prints conductCell over the kit's reads and explains it on hover", () => {
    const drawer = readFileSync(new URL("./chat_drawer.tsx", import.meta.url), "utf8");
    const inline = readFileSync(new URL("./cognition_wave_inline.tsx", import.meta.url), "utf8");
    expect(drawer).toMatch(/return toolCallsOf\(d\);/);
    // The kit's reads as its gauge computed them (backlog 0040: the list, no drawing).
    expect(inline).toContain("const axes = conductAxes(effort ?? null, tools ?? [], baseline);");
    expect(inline).toMatch(/conductCell\(axes\.find\(\(g\) => g\.id === a\.id\), effort, tools\)/);
    expect(inline).toMatch(/<span className="cm_tone_val">\{cell\?\.short \?\? "—"\}<\/span>/);
    expect(inline).toMatch(/<ExplainedCode key=\{a\.id\} className="cm_tone_item" style=\{\{ color: a\.color \}\} explain=\{conductExplainer\(a, cell\)\}>/);
  });
});
