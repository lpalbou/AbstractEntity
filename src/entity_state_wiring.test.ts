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
  it("entity_view's visit truth is the served phase OR the drawer's own signal (never one amputated)", () => {
    // The phase bar (2026-11-08) replaced the client derive on this page: the served life_state is
    // the phase, and the drawer's first-hand open visit still counts (dm#94 P0-2).
    expect(view).not.toContain("deriveLifeState(");
    expect(view).toContain('const visiting = (phaseRead.kind === "served" && phaseRead.bar.phase === "visit") || Boolean(clientVisit?.open);');
    expect(view).toContain("onVisitStateChange={handleVisitStateChange}");
  });

  it("the roster reads the same served phase as the entity page (no client derive of its own)", () => {
    expect(roster).not.toContain("deriveLifeState(");
    expect(roster).toContain("life: (slug) => getPhaseBar(baseUrl, slug).then(phaseBarRead),");
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

  it("the chat tab hint rides the ONE visit truth, not the raw trio mode (P2-9)", () => {
    expect(view).toContain("hint: visiting");
    expect(view).not.toMatch(/hint:\s*entityState\?\.mode/);
  });

  it("the settling chip and the day-cause line are suppressed under a visit (P2-8/P2-10)", () => {
    expect(view).toMatch(/cognition\?\.settling && !visiting/);
    expect(view).toMatch(/if \(visiting\) return null;\s*\n\s*const line = dayCauseLine/);
  });
});
