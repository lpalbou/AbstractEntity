/**
 * The remodelled Settings modal (operator 2026-11-07): nine sections in four groups, one map for the
 * side list and the phone's select, the kit's modal chrome with a named close button, every section
 * still mounted, every write still the same call, and the layout's phone switch in the stylesheet.
 */
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SETTINGS_GROUPS, SETTINGS_SECTIONS, settingsSection, settingsSectionOptions, type SettingsSection } from "./settings_sections";
import { SettingsPanel, layerLabel } from "./workspace_panel";

function panel(section: SettingsSection): string {
  return renderToStaticMarkup(
    <SettingsPanel
      baseUrl="http://gw.test"
      entity="nerin"
      entityName="nerin"
      token={null}
      substrate={null}
      onSubstrateChange={() => {}}
      initialSection={section}
      onClose={() => {}}
    />,
  );
}

describe("settings map: four groups, nine sections", () => {
  it("groups the sections in this order", () => {
    expect(SETTINGS_GROUPS.map((g) => [g.label, g.sections.map((s) => s.id)])).toEqual([
      ["Mind & voice", ["mind", "voice"]],
      ["Identity & record", ["identity", "record"]],
      ["Workspace", ["files", "mounts", "tools", "skills"]],
      ["Prompt", ["prompt"]],
    ]);
    expect(new Set(SETTINGS_SECTIONS.map((s) => s.id)).size).toBe(9);
  });

  it("every section says in one line what it is for, naming the entity", () => {
    for (const s of SETTINGS_SECTIONS) {
      const line = s.lede("Castor");
      expect(line, s.id).toContain("Castor");
      expect(line.split(/(?<=\.)\s/).length, s.id).toBeLessThanOrEqual(2);
    }
  });

  it("the phone select lists the same sections, grouped like the side list", () => {
    expect(settingsSectionOptions()).toEqual(SETTINGS_SECTIONS.map((s) => ({ value: s.id, label: s.label, group: settingsSection(s.id).group.label })));
    expect(settingsSection("tools").group.label).toBe("Workspace");
    expect(() => settingsSection("nope" as SettingsSection)).toThrow(/Unknown settings section/);
  });
});

describe("the modal", () => {
  it("is the kit's modal: a dialog titled Settings + the entity's name, with a named close button", () => {
    const html = panel("mind");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('class="af-modal af-modal--wide stg_modal"');
    expect(html).toMatch(/af-modal__title[^>]*>.*Settings.*nerin/);
    expect(html).toContain('aria-label="Close settings"');
  });

  it("the side list holds every section under its group caption, the open one marked", () => {
    const html = panel("skills");
    const items = [...html.matchAll(/class="stg_nav_item" data-section="([a-z]+)"( aria-current="page")?/g)];
    expect(items.map((m) => m[1])).toEqual(SETTINGS_SECTIONS.map((s) => s.id));
    expect(items.filter((m) => m[2]).map((m) => m[1])).toEqual(["skills"]);
    for (const g of SETTINGS_GROUPS) expect(html).toContain(`>${g.label.replace("&", "&amp;")}</p>`);
  });

  it("each section opens with its group, title and one line, and mounts its own panel", () => {
    const marks: Record<SettingsSection, string> = {
      mind: 'data-testid="entity-mind-picker"',
      voice: 'data-testid="listener-voice-settings"',
      identity: 'data-testid="identity-settings"',
      record: 'data-testid="track-record"',
      files: 'data-action="up"',
      mounts: 'data-action="grant-mount"',
      tools: "Reading…",
      skills: "Reading its shelf…",
      prompt: "Reading…",
    };
    for (const s of SETTINGS_SECTIONS) {
      const html = panel(s.id);
      expect(html, s.id).toContain(`data-section="${s.id}"`);
      expect(html, s.id).toMatch(new RegExp(`class="stg_page_title"[^>]*>${s.label}<`));
      expect(html, s.id).toContain(s.lede("nerin").replace(/'/g, "&#x27;").replace(/&(?!#x27;)/g, "&amp;"));
      expect(html, s.id).toContain(marks[s.id]);
    }
  });

  it("the voice section points to Identity for the voice it speaks with", () => {
    expect(panel("voice")).toContain('data-action="open-identity"');
  });

  it("mounts: the access choice is the kit's select and nothing can be granted before the list is read", () => {
    const html = panel("mounts");
    expect(html).toMatch(/aria-label="Access"/);
    expect(html).toMatch(/<button[^>]*data-action="grant-mount"[^>]*disabled=""/);
  });
});

describe("what each control writes is unchanged", () => {
  const src = fs.readFileSync(path.join(__dirname, "workspace_panel.tsx"), "utf8");
  it("one write per section, with the same arguments", () => {
    for (const call of [
      "putWorkspaceMounts(baseUrl, entity, next, token)",
      "putToolPolicy(baseUrl, entity, change.body, token)",
      "putEntitySkills(baseUrl, entity, skills, token)",
      "putEntityPrompt(baseUrl, entity, draft, token)",
    ]) {
      expect(src.split(call).length - 1, call).toBe(1);
    }
    expect(src).toContain("onSaved={(s) => onSubstrateChange(substrateChoiceOf(s))}");
    expect(src).toContain("save([...mounts, { name, path, mode: newMode }]);");
  });
});

describe("prompt layers the app has no words for", () => {
  it("read as their key, capitalised", () => {
    expect(layerLabel("personal")).toBe("Personal");
    expect(layerLabel("own_time")).toBe("Own time");
    expect(layerLabel("")).toBe("");
  });
});

describe("layout: side list on desktop, the select on a phone", () => {
  const css = fs.readFileSync(path.join(__dirname, "settings_modal.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const phone = css.slice(css.indexOf("@media (max-width: 767.98px)"));
  const block = (text: string, sel: string) => new RegExp(`(^|\\n)\\s*${sel.replace(/\./g, "\\.")} \\{([^}]*)\\}`).exec(text)?.[2] ?? "";
  it("desktop: the select is hidden; phone: the side list is hidden and the select shown", () => {
    expect(block(css, ".stg_jump")).toMatch(/display:\s*none/);
    expect(phone.length).toBeGreaterThan(0);
    expect(block(phone, ".stg_nav")).toMatch(/display:\s*none/);
    expect(block(phone, ".stg_jump")).toMatch(/display:\s*block/);
  });
  it("small text reads through the app's type floor", () => {
    const sizes = [...css.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim());
    expect(sizes.length).toBeGreaterThan(10);
    expect(sizes.filter((v) => !v.includes("var(--ent-type-floor"))).toEqual([]);
  });
});
