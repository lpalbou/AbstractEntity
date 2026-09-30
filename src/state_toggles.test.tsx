/**
 * On/off settings are kit switches labelled by the feature (state-toggles
 * rule, 2026-09-30): the switch position IS the state, it applies at once,
 * and there is no Save button for a switch. The package ships no DOM for
 * tests, so components render with react-dom/server and the assertions read
 * the markup; the immediate-apply write is pinned through its pure helper.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { findVerbToggleLabels } from "@abstractframework/ui-kit";
import { describe, expect, it } from "vitest";

import { FrameworkCheckSwitch } from "./create_entity_form";
import type { ToolPolicyInfo } from "./stream_source";
import { ToolGrantsView, toolSwitchChange } from "./workspace_panel";

const POLICY: ToolPolicyInfo = {
  phases: {
    visit: { tools: ["recall", "web_search"], source: "file", notes: [] },
    own_time: { tools: ["recall"], source: "file", notes: [] },
  },
  all_tools: ["recall", "web_search", "execute_command"],
  tiers: { tier1: ["recall"] },
};

function draftOf(p: ToolPolicyInfo): Record<string, Set<string>> {
  const d: Record<string, Set<string>> = {};
  for (const [phase, info] of Object.entries(p.phases)) d[phase] = new Set(info.tools);
  return d;
}

function switches(html: string): string[] {
  return [...html.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);
}

describe("Tools tab: grants are switches, applied at once", () => {
  it("renders one switch per tool and phase with its state and accessible name, no checkbox and no save button", () => {
    const html = renderToStaticMarkup(
      <ToolGrantsView policy={POLICY} draft={draftOf(POLICY)} error={null} saved={null} busyCell={null} onToggle={() => {}} />,
    );
    const all = switches(html);
    expect(all).toHaveLength(POLICY.all_tools.length * Object.keys(POLICY.phases).length);
    const web = all.find((t) => t.includes('aria-label="web_search in'));
    expect(web).toBeTruthy();
    expect(web).toContain('aria-checked="true"');
    const exec = all.filter((t) => t.includes('aria-label="execute_command in'));
    expect(exec.every((t) => t.includes('aria-checked="false"'))).toBe(true);
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toMatch(/save policy/i);
  });

  it("while one change saves, that switch is busy and the others wait", () => {
    const html = renderToStaticMarkup(
      <ToolGrantsView policy={POLICY} draft={draftOf(POLICY)} error={null} saved={null} busyCell="visit/recall" onToggle={() => {}} />,
    );
    const all = switches(html);
    expect(all.filter((t) => t.includes('aria-busy="true"'))).toHaveLength(1);
    expect(all.filter((t) => t.includes('aria-disabled="true"'))).toHaveLength(all.length - 1);
  });

  it("names the new state after a change", () => {
    const html = renderToStaticMarkup(
      <ToolGrantsView policy={POLICY} draft={draftOf(POLICY)} error={null} saved="web_search is off for Visit — the next summon obeys it" busyCell={null} onToggle={() => {}} />,
    );
    expect(html).toContain("web_search is off for Visit");
  });

  it("a flip writes the touched phase only, in the policy's tool order", () => {
    const change = toolSwitchChange(POLICY.all_tools, draftOf(POLICY), "visit", "execute_command", true);
    expect(change.body).toEqual({ visit: ["recall", "web_search", "execute_command"] });
    expect([...change.draft.own_time]).toEqual(["recall"]);
    const off = toolSwitchChange(POLICY.all_tools, draftOf(POLICY), "own_time", "recall", false);
    expect(off.body).toEqual({ own_time: [] });
  });
});

describe("Create entity: the framework check is a switch", () => {
  it("renders a switch labelled by the feature with its state", () => {
    const on = renderToStaticMarkup(<FrameworkCheckSwitch checked={true} onChange={() => {}} />);
    expect(switches(on)[0]).toContain('aria-checked="true"');
    expect(on).toContain(">Framework check<");
    const off = renderToStaticMarkup(<FrameworkCheckSwitch checked={false} onChange={() => {}} />);
    expect(switches(off)[0]).toContain('aria-checked="false"');
  });

  it("the form uses it (no checkbox left in the form)", () => {
    const src = fs.readFileSync(path.join(__dirname, "create_entity_form.tsx"), "utf8");
    expect(src).toContain("<FrameworkCheckSwitch checked={framework} onChange={setFramework} />");
    expect(src).not.toContain('type="checkbox"');
  });
});

describe("source guard", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (name === "vendor" || name === "fixtures") continue;
      if (fs.statSync(p).isDirectory()) walk(p, out);
      else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
    }
    return out;
  }

  it("no verb-swap toggle labels anywhere in src (kit findVerbToggleLabels)", () => {
    const hits = walk(__dirname).flatMap((file) =>
      findVerbToggleLabels(fs.readFileSync(file, "utf8")).map((h) => `${path.relative(__dirname, file)}:${h.line} ${h.labels.join(" / ")}`),
    );
    expect(hits).toEqual([]);
  });

  it("the guard flags a verb swap (it is not decoration)", () => {
    expect(findVerbToggleLabels('x ? "Disable" : "Enable"')).toHaveLength(1);
  });
});
