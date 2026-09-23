/**
 * foldSkillsSelection — the matrix+patches → whole-document PUT fold
 * (Settings skills tab; gateway PUT is a whole-doc replace).
 */
import { describe, expect, it } from "vitest";

import { foldSkillsSelection } from "./workspace_panel";

const PHASES = [{ id: "visit" }, { id: "work" }, { id: "personal" }, { id: "sleep" }];

function matrix(items: Array<{ id: string; cells: Record<string, { assigned?: boolean; resolved_value?: boolean }> }>) {
  return { schema_version: 1, phases: PHASES, sections: [{ id: "skills", items }] };
}

const OFF = { assigned: false, resolved_value: false };
const ON = { assigned: true, resolved_value: true };

describe("foldSkillsSelection", () => {
  it("keeps stored selections when no patches", () => {
    const m = matrix([{ id: "entity-self-knowledge", cells: { visit: ON, work: ON, personal: ON, sleep: ON } }]);
    expect(foldSkillsSelection(m, [])).toEqual([{ name: "entity-self-knowledge" }]);
  });

  it("subset of phases serializes the phases list", () => {
    const m = matrix([{ id: "s1", cells: { visit: ON, work: OFF, personal: ON, sleep: OFF } }]);
    expect(foldSkillsSelection(m, [])).toEqual([{ name: "s1", phases: ["visit", "personal"] }]);
  });

  it("grant patch selects; deny/clear deselects the stored word", () => {
    const m = matrix([{ id: "s1", cells: { visit: ON, work: OFF, personal: OFF, sleep: OFF } }]);
    const out = foldSkillsSelection(m, [
      { section: "skills", item: "s1", phase: "work", op: "grant" },
      { section: "skills", item: "s1", phase: "visit", op: "clear" },
    ]);
    expect(out).toEqual([{ name: "s1", phases: ["work"] }]);
  });

  it("fully deselected skills drop from the document", () => {
    const m = matrix([{ id: "s1", cells: { visit: ON, work: OFF, personal: OFF, sleep: OFF } }]);
    expect(foldSkillsSelection(m, [{ section: "skills", item: "s1", phase: "visit", op: "deny" }])).toEqual([]);
  });

  it("resolved-but-unassigned cells are shelf defaults, never the operator's word", () => {
    const m = matrix([{ id: "s1", cells: { visit: { assigned: false, resolved_value: true }, work: OFF, personal: OFF, sleep: OFF } }]);
    expect(foldSkillsSelection(m, [])).toEqual([]);
  });

  it("all four via patches folds to a global entry", () => {
    const m = matrix([{ id: "s1", cells: { visit: OFF, work: OFF, personal: OFF, sleep: OFF } }]);
    const patches = PHASES.map((p) => ({ section: "skills", item: "s1", phase: p.id, op: "grant" as const }));
    expect(foldSkillsSelection(m, patches)).toEqual([{ name: "s1" }]);
  });
});
