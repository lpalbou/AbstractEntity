/**
 * THE CARD TINTS KEEP THE TEXT READABLE (Entity backlog 0014, validation:
 * "a contrast check of the text on all twelve tints, dark and light"). For
 * every topic colour (TOPIC_COLORS) the card's tint — the strengths read
 * from topics_panel.css, the colour mixed over the panel surface — is
 * composited on the panel of the app's dark theme (observer-night, its
 * default) and of the kit's light theme, the token values read from the
 * kit's theme.css through entity.css's own names; then the text the card
 * carries is held to WCAG AA (4.5:1): the titles and paths (--text), the
 * summary, facts, head and counts (--text-dim), and the focused topic's
 * title (--ea-accent) on the selected row. Nothing is hard-coded but the
 * bar: a token, a theme or a tint this test cannot read fails it.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { TOPIC_COLORS } from "./topic_layout";

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const THEME = read("../node_modules/@abstractframework/ui-kit/src/theme.css");
const ENTITY = read("entity.css");
const CARD = read("topics_panel.css");
const ENTITY_VIEW = fs.readFileSync(path.resolve(__dirname, "entity_view.tsx"), "utf8");

/** The custom properties of every rule whose selector list includes `selector` exactly, in source order. */
function declarations(css: string, selector: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of css.split("}")) {
    const [sel, body] = block.split("{");
    if (body === undefined || !sel.split(",").some((one) => one.trim() === selector)) continue;
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  }
  return out;
}

/** A theme's tokens as the app sees them: the kit's :root, then the theme's own rules (shared ones first, as the kit lists them). */
function themeTokens(theme: string): Map<string, string> {
  const tokens = new Map(declarations(THEME, ":root"));
  for (const [k, v] of declarations(THEME, `:root.theme-${theme}`)) tokens.set(k, v);
  return tokens;
}

/** An app token (entity.css :root: `--text-dim: var(--text-secondary, #8593a5)`) resolved to a hex colour in `theme`. */
function colour(token: string, theme: string): string {
  const app = declarations(ENTITY, ":root");
  const kit = themeTokens(theme);
  let value = app.get(token) ?? kit.get(token);
  for (let i = 0; i < 8 && value !== undefined; i++) {
    const v = value.match(/^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/);
    if (!v) break;
    value = kit.get(v[1]) ?? app.get(v[1]) ?? v[2];
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${token} in ${theme} is not a hex colour: ${value}`);
  return value.toLowerCase();
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (c: number[]) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** color-mix(in srgb, topic p%, transparent) composited on the opaque panel. */
const tint = (topic: string, panel: string, p: number) => rgb(topic).map((t, i) => Math.round(t * p + rgb(panel)[i] * (1 - p)));

/** The tint strength (0..1) a card rule paints. */
function strength(selector: string): number {
  const body = CARD.split("}").find((b) => b.split("{")[0].split(/,\s*\n/).some((one) => one.trim() === selector));
  const m = body?.match(/background: color-mix\(in srgb, var\(--gc-tp-color\) (\d+(?:\.\d+)?)%, transparent\);/);
  if (!m) throw new Error(`no tint in ${selector}`);
  return Number(m[1]) / 100;
}
const CARD_TINT = strength(".gc_topics .gc_tp_card::before");
const SELECTED_TINT = strength(".gc_topics .gc_tp_list .af-disclosure__row--selected[data-depth] .gc_tp_card::before");
const AA = 4.5;

describe("the twelve card tints keep every text at 4.5:1 (backlog 0014)", () => {
  it("reads what it checks: the app's default dark theme, both tints, twelve colours", () => {
    expect(ENTITY_VIEW).toContain('useAppearanceSettings("abstractentity", { defaults: { theme: "observer-night" } })');
    expect(TOPIC_COLORS).toHaveLength(12);
    expect(CARD_TINT).toBe(0.09);
    expect(SELECTED_TINT).toBeGreaterThan(CARD_TINT);
    expect(colour("--bg-panel", "observer-night")).toBe("#10161e");
    expect(colour("--bg-panel", "light")).toBe("#ffffff");
  });

  for (const theme of ["observer-night", "light"]) {
    it(`${theme}: titles, dim text and the focused title on every card and selected tint`, () => {
      const panel = colour("--bg-panel", theme);
      const text = rgb(colour("--text", theme));
      const dim = rgb(colour("--text-dim", theme));
      const accent = rgb(colour("--ea-accent", theme));
      const failures: string[] = [];
      for (const topic of TOPIC_COLORS) {
        for (const [where, p] of [["card", CARD_TINT], ["selected", SELECTED_TINT]] as const) {
          const bg = tint(topic, panel, p);
          const checks: Array<[string, number[]]> = [["--text", text], ["--text-dim", dim]];
          if (where === "selected") checks.push(["--ea-accent (focused title)", accent]);
          for (const [name, fg] of checks) {
            const r = contrast(fg, bg);
            if (r < AA) failures.push(`${topic} ${where} ${Math.round(p * 100)} % ${name}: ${r.toFixed(2)}:1`);
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it("the check bites: the 18 % selected tint the first cut shipped fails the dim text in the dark theme", () => {
    const panel = colour("--bg-panel", "observer-night");
    const dim = rgb(colour("--text-dim", "observer-night"));
    const worst = Math.min(...TOPIC_COLORS.map((t) => contrast(dim, tint(t, panel, 0.18))));
    expect(worst).toBeLessThan(AA);
    expect(Math.min(...TOPIC_COLORS.map((t) => contrast(dim, tint(t, panel, SELECTED_TINT))))).toBeGreaterThanOrEqual(AA);
  });
});
