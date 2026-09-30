/**
 * Guards for the phone-space pass (DESIGN §12): the list-section disclosure
 * (open by default, remembered, 44 px on touch, only where the side panel is
 * a drawer), the chat monitor folded by default on phones, and the flat phone
 * layout rules. Each test fails when the behaviour or rule it guards is
 * removed.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initialMonitorFolded } from "./cognition_wave_inline";
import { readSectionOpen, SectionDisclosure, writeSectionOpen } from "./section_disclosure";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const section = (narrow: boolean) =>
  renderToStaticMarkup(
    <SectionDisclosure id="admission:identity" title="Identity" narrow={narrow}>
      <button className="ei_link">intellectual_honesty</button>
    </SectionDisclosure>,
  );

describe("list-section disclosure", () => {
  it("is open by default in the drawer layout: a chevron button with aria-expanded=true and the list shown", () => {
    const html = section(true);
    expect(html).toMatch(/<button[^>]*class="ei_disclosure"[^>]*aria-expanded="true"/);
    expect(html).toContain("intellectual_honesty");
    expect(html).toContain("ei_disclosure_chev");
  });

  it("remembers a fold per viewer: a stored fold renders collapsed with the list hidden", () => {
    writeSectionOpen("admission:identity", false);
    expect(store.get("abstractentity_section_open_v1:admission:identity")).toBe("0");
    const html = section(true);
    expect(html).toMatch(/aria-expanded="false"/);
    expect(html).not.toContain("intellectual_honesty");
    writeSectionOpen("admission:identity", true);
    expect(section(true)).toContain("intellectual_honesty");
  });

  it("stays open when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readSectionOpen("dropped")).toBe(true);
    expect(() => writeSectionOpen("dropped", false)).not.toThrow();
  });

  it("renders the plain heading on the docked desktop panel (no button)", () => {
    const html = section(false);
    expect(html).not.toContain("<button class=\"ei_disclosure\"");
    expect(html).toMatch(/<h4>Identity<\/h4>/);
    expect(html).toContain("intellectual_honesty");
  });

  it("the inspector's list sections all use it", () => {
    const src = readFileSync(resolve(__dirname, "inspector.tsx"), "utf8");
    expect(src).not.toMatch(/className="ei_section/);
    for (const id of ['id="night"', 'id="feeling"', 'id="partners"', "id={`admission:${label}`}", 'id="dropped"']) {
      expect(src).toContain(id);
    }
  });
});

describe("chat monitor on phones", () => {
  it("starts folded on a phone and open elsewhere unless the viewer chose", () => {
    expect(initialMonitorFolded(null, true)).toBe(true);
    expect(initialMonitorFolded(null, false)).toBe(false);
    expect(initialMonitorFolded("0", true)).toBe(false);
    expect(initialMonitorFolded("1", false)).toBe(true);
  });
});

const CSS = readFileSync(resolve(__dirname, "entity.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function atBlocks(prelude: string): string {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = CSS.indexOf(prelude + " {", from);
    if (at < 0) return out.join("\n");
    let depth = 0;
    let i = CSS.indexOf("{", at);
    const start = i + 1;
    for (; i < CSS.length; i += 1) {
      if (CSS[i] === "{") depth += 1;
      else if (CSS[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(CSS.slice(start, i));
    from = i;
  }
}

function rule(text: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[}\\s,])${esc}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "g");
  return [...text.matchAll(re)].map((m) => m[1]).join("\n");
}

describe("phone layout rules (< 768 px)", () => {
  const sm = atBlocks("@media (max-width: 767.98px)");
  const coarse = atBlocks("@media (pointer: coarse)");
  const phoneTouch = atBlocks("@media (max-width: 767.98px) and (pointer: coarse)");

  it("the transcript is flat and full width", () => {
    const item = rule(sm, ".cd_thread .pc-chat-item");
    expect(item).toMatch(/border:\s*none/);
    expect(item).toMatch(/max-width:\s*100%/);
    expect(item).toMatch(/padding:\s*0/);
    expect(rule(sm, ".side_tabs_drawer .chat_drawer")).toMatch(/padding:\s*6px 12px/);
  });

  it("ledger rows fold their seq column into one line; the health caption wraps under its title", () => {
    expect(rule(sm, ".el_row")).toMatch(/flex-direction:\s*column/);
    expect(rule(sm, ".el_row_meta")).toMatch(/flex-direction:\s*row/);
    expect(rule(sm, ".hp_sub")).toMatch(/flex:\s*1 1 100%/);
  });

  it("roster entities are flat sections, not cards", () => {
    const card = rule(sm, ".eix_card");
    expect(card).toMatch(/border:\s*none/);
    expect(card).toMatch(/border-bottom:\s*1px solid/);
  });

  it("the open phone drawer hides the covered graph overlays", () => {
    expect(sm).toMatch(/\.entity_main:has\(> \.side_tabs_drawer:not\(\.side_tabs_collapsed\)\) > \.entity_canvas_wrap\s*\{\s*visibility:\s*hidden/);
  });

  it("touch: the disclosure is a 44 px target; phone panes read at 1.3x", () => {
    expect(rule(coarse, ".ei_section h4 .ei_disclosure")).toMatch(/min-height:\s*var\(--tap-min, 44px\)/);
    expect(rule(phoneTouch, ".st_panel")).toMatch(/--font-scale:\s*calc\(var\(--ent-user-scale, 1\) \* 1\.3\)/);
    expect(rule(phoneTouch, ".cd_thread .pc-md")).toMatch(/15 \/ 13/);
  });
});
