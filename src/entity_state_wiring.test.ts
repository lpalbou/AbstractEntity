/**
 * SOURCE PINS for the dm#94 exclusivity wiring (render adversary pins 8-9,
 * blueprint-style readFileSync checks): the derive machine was already
 * exclusive when the incident happened — the defect was what the machine
 * was FED (a hardcoded-null visit axis) and what the header rendered
 * BESIDE it (phase words from other endpoints). These pins keep the
 * wiring from silently regressing to the blind configuration.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./entity_view.tsx", import.meta.url), "utf8");
const roster = readFileSync(new URL("./entities_index.tsx", import.meta.url), "utf8");
const drawer = readFileSync(new URL("./chat_drawer.tsx", import.meta.url), "utf8");

describe("dm#94 wiring pins — the machine is never fed blind, the strip has no second phase vocabulary", () => {
  it("entity_view feeds the drawer's visit signal into deriveLifeState (no literal-null visit axis)", () => {
    const calls = view.match(/deriveLifeState\(([^)]*)\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      // The third argument (the visit axis) must be a bound variable, not
      // the literal null amputation that blinded the machine (P0-2).
      expect(call, call).not.toMatch(/deriveLifeState\([^)]*,\s*null\s*,/);
    }
    expect(view).toContain("clientVisit");
    expect(view).toContain("onVisitStateChange={handleVisitStateChange}");
  });

  it("the roster names its honest absence (it conducts no chat) instead of a bare null", () => {
    // The roster genuinely has no first-hand visit knowledge — the named
    // constant records the reasoning; the served chat_open belt covers it.
    expect(roster).toContain("rosterHoldsNoChat");
    expect(roster).not.toMatch(/deriveLifeState\([^)]*,\s*null\s*,/);
  });

  it("the drawer reports its visit state upward (the first-hand truth is not trapped)", () => {
    expect(drawer).toContain("onVisitStateChange?(signal: ClientVisitSignal | null): void");
    expect(drawer).toContain("ownVisitSignal(status, runId, busy)");
  });

  it("the header strip has no bare 'working' phase word sourced from cognition (P1-5)", () => {
    // The activity chip renders an activity word; "work" belongs to the
    // ONE phase chip. The pin targets the JSX render form ("● word{…")
    // so the incident-history comment quoting the old chip stays legal.
    expect(view).not.toMatch(/● working\{/);
    expect(view).toContain("● thinking{");
  });

  it("the chat tab hint rides the ONE machine, not the raw trio mode (P2-9)", () => {
    expect(view).toContain("hint: life.visiting");
    expect(view).not.toMatch(/hint:\s*entityState\?\.mode/);
  });

  it("the settling chip and the day-cause line are suppressed under a visit (P2-8/P2-10)", () => {
    expect(view).toMatch(/cognition\?\.settling && !life\.visiting/);
    expect(view).toMatch(/if \(life\.visiting\) return null;\s*\n\s*const line = dayCauseLine/);
  });
});
