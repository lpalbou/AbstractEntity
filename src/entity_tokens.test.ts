/**
 * The entity-semantic token ALIAS PIN (theme-compliance refactor, operator
 * 2026-07-15 (b): the whole app must obey the shared abstractuic themes).
 *
 * ONE visual vocabulary, now enforced STRUCTURALLY rather than by a
 * byte-copy drift check: the app's :root no longer hardcodes the seven
 * entity-semantic hexes — it ALIASES the kit's `--entity-*` tokens
 * (`var(--entity-identity, <fallback>)`, …). So switching theme via the
 * shared AfAppearanceDialog recolours the graph/panels with the app, and
 * drift is impossible by construction (there is no second copy to wander —
 * the one-source-imported-never-copied rule, upgraded from "copied but
 * pinned equal" to "referenced, never copied"). This pin asserts the alias
 * is intact and the kit still defines the target tokens. The fallback hex
 * is checked equal to the kit's dark value so a bare (kit-CSS-less) load
 * still renders in the shipped palette.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_CSS = resolve(__dirname, "entity.css");
// Repo split 2026-07-12: src/ sits one level shallower than the old
// abstractobserver/src/entity home, so the workspace sibling is ../../.
const KIT_CSS = resolve(__dirname, "../../abstractuic/ui-kit/src/theme.css");

/** this app's entity.css :root name -> ui-kit semantic token name. */
const TOKEN_MAP: Record<string, string> = {
  "--identity": "--entity-identity",
  "--memory": "--entity-memory",
  "--diary": "--entity-diary",
  "--standing": "--entity-standing",
  "--scar": "--entity-scar",
  "--bond": "--entity-bond",
  // App-prefixed name: the kit's per-theme classes define a GENERIC
  // `--accent` (red/mauve/…) at :root.theme-* specificity, which beat the
  // app's :root alias and split the page into two accent systems on light
  // themes (adversarial round 2, NEW-2). `--ea-accent` is collision-free.
  "--ea-accent": "--entity-accent",
};

/** First :root block's declarations (the dark set — both files lead with it). */
function rootTokens(css: string): Record<string, string> {
  const root = css.match(/:root\s*\{([^}]*)\}/);
  if (!root) return {};
  const out: Record<string, string> = {};
  for (const line of root[1].split(";")) {
    const m = line.match(/(--[\w-]+)\s*:\s*([^;]+)/);
    if (m) out[m[1].trim()] = m[2].trim().toLowerCase();
  }
  return out;
}

/** Parse a `var(--token, fallback)` reference. */
function parseAlias(value: string): { token: string; fallback: string } | null {
  const m = value.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
  if (!m) return null;
  return { token: m[1].trim(), fallback: (m[2] || "").trim().toLowerCase() };
}

describe("entity-semantic tokens: entity app ALIASES ui-kit (theme compliance)", () => {
  it("each app token aliases the correct kit --entity-* token, with the kit's dark value as fallback", () => {
    const ours = rootTokens(readFileSync(APP_CSS, "utf-8"));
    const kit = rootTokens(readFileSync(KIT_CSS, "utf-8"));
    for (const [ourName, kitName] of Object.entries(TOKEN_MAP)) {
      const alias = parseAlias(ours[ourName] || "");
      expect(alias, `entity app ${ourName} must be a var() alias, got "${ours[ourName]}"`).toBeTruthy();
      expect(alias!.token, `${ourName} must alias ${kitName}`).toBe(kitName);
      expect(kit[kitName], `ui-kit ${kitName} must exist`).toBeTruthy();
      // The fallback keeps a bare load in the shipped palette — it must
      // equal the kit's dark value so with-and-without-kit render the same.
      expect(alias!.fallback, `${ourName} fallback drifted from ${kitName}`).toBe(kit[kitName]);
    }
  });

  it("the kit carries the full seven-token vocabulary (no partial set)", () => {
    const kit = rootTokens(readFileSync(KIT_CSS, "utf-8"));
    const entityTokens = Object.keys(kit).filter((k) => k.startsWith("--entity-"));
    for (const name of Object.values(TOKEN_MAP)) {
      expect(entityTokens, `kit is missing ${name}`).toContain(name);
    }
  });
});
