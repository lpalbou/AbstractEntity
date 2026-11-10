/**
 * The roster's width and columns (operator 2026-11-10, backlog 0024: "UI should be responsive
 * (desktop+phone). but on a desktop, i would probably put at least 3 entities per row"). The
 * package has no DOM for tests, so the column steps are read from entities_index.css and the card
 * widths computed from its own numbers (the page width, the gutter, roster_cards.css's gap); the
 * hermetic browser run measures the same at 1440, 1920, 1024 and 400 px.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EntitiesIndex } from "./entities_index";

const read = (name: string) => fs.readFileSync(path.join(__dirname, name), "utf8");
const css = read("entities_index.css");
const cardsCss = read("roster_cards.css");

/** The declarations of the first rule whose selector is exactly `selector`, outside any @media. */
function topRule(sheet: string, selector: string): string {
  const flat = sheet.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = flat.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule ${selector}`);
  return m[1];
}
const px = (decl: string, prop: string) => {
  const m = decl.match(new RegExp(`${prop}:\\s*([\\d.]+)px`));
  if (!m) throw new Error(`no ${prop} in ${decl}`);
  return Number(m[1]);
};

const page = topRule(css, ".entities_index.eix_roster");
const MAX = px(page, "max-width");
const gutter = page.match(/padding:\s*[\d.]+px\s+clamp\(([\d.]+)px,\s*([\d.]+)vw,\s*([\d.]+)px\)/);
const GAP = px(topRule(cardsCss, ".eix_grid.eix_cards"), "gap");
/** The column steps: [min window width, columns], from the sheet's own media queries. */
const STEPS: Array<[number, number]> = [...css.matchAll(/@media \(min-width: (\d+)px\) \{\s*\.eix_roster \{\s*--eix-cols: (\d+);/g)].map((m) => [Number(m[1]), Number(m[2])]);

function columnsAt(width: number): number {
  let cols = 1;
  for (const [min, n] of STEPS) if (width >= min) cols = n;
  return cols;
}
function cardWidthAt(width: number): number {
  if (!gutter) throw new Error("no gutter clamp");
  const pad = Math.min(Number(gutter[3]), Math.max(Number(gutter[1]), (Number(gutter[2]) * width) / 100));
  const cols = columnsAt(width);
  return (Math.min(width, MAX) - 2 * pad - (cols - 1) * GAP) / cols;
}

describe("roster grid (0024)", () => {
  it("the roster carries the sheet: imported, and its root wears the class every rule keys on", () => {
    expect(read("entities_index.tsx")).toContain('import "./entities_index.css";');
    const html = renderToStaticMarkup(<EntitiesIndex baseUrl="http://gw.test" token={null} onOpen={() => undefined} />);
    expect(html).toMatch(/^<div class="entities_index eix_roster">/);
  });

  it("the grid's columns follow the steps, one per row by default", () => {
    expect(topRule(css, ".eix_roster .eix_grid.eix_cards")).toMatch(/grid-template-columns:\s*repeat\(var\(--eix-cols, 1\), minmax\(0, 1fr\)\)/);
    expect(STEPS).toEqual([
      [768, 2],
      [1200, 3],
      [1700, 4],
    ]);
  });

  it("the operator's windows: three per row at 1440, four at 1920, two at 1024, one on a 400 px phone", () => {
    expect(columnsAt(1440)).toBe(3);
    expect(columnsAt(1920)).toBe(4);
    expect(columnsAt(1024)).toBe(2);
    expect(columnsAt(400)).toBe(1);
    // The phone layout (entity.css's 767.98 px queries) is exactly the one-column range.
    expect(columnsAt(767)).toBe(1);
    expect(css).toContain("@media (max-width: 767.98px)");
  });

  it("no step makes a card narrower than 320 px, at its first window or anywhere up to 2560", () => {
    for (let w = 768; w <= 2560; w += 1) expect(cardWidthAt(w), `${w} px`).toBeGreaterThanOrEqual(320);
    expect(Math.floor(cardWidthAt(1700))).toBe(390);
    // The page widens: at 1440 the grid is no longer the old 740 px column.
    expect(cardWidthAt(1440) * 3 + 2 * GAP).toBeGreaterThan(1300);
  });

  it("the forms and prompts keep their reading width while the grid takes the page", () => {
    expect(css).toMatch(/\.eix_roster > \.create_entity,\s*\.eix_roster > \.eix_signin,\s*\.eix_roster > \.eix_howto \{\s*max-width:\s*760px;/);
  });
});
