import { describe, expect, it } from "vitest";

import { compareSpecs, sha256Hex } from "./spec_sync";

// The compare logic is the load-bearing half of the one-graph consumer
// check (dm#79 mechanism, sha amendment c3565): byte comparison via the
// gateway's DECLARED sha; absent sha degrades to a labeled version-level
// check (hashing our re-serialization would compare formatting, not
// content).

const specV6 = JSON.stringify({ version: 6, phases: { sleep: {} } }, null, 2);
const specV7 = JSON.stringify({ version: 7, phases: { sleep: {} } }, null, 2);

describe("compareSpecs", () => {
  it("byte-identical copies match on the declared sha", async () => {
    const sha = await sha256Hex(specV6);
    const r = await compareSpecs(specV6, specV6, sha);
    expect(r.status).toBe("match");
    expect(r.bundled.version).toBe(6);
  });

  it("a declared sha that differs is DRIFT even at the same version (the reformat-noise class)", async () => {
    const editedSameVersion = specV6.replace("sleep", "sleep_");
    const sha = await sha256Hex(editedSameVersion);
    const r = await compareSpecs(specV6, specV6, sha);
    expect(r.status).toBe("drift");
    expect(r.detail).toContain("same version");
  });

  it("version skew names which side is behind", async () => {
    const wireSha = await sha256Hex(specV7);
    const r = await compareSpecs(specV6, specV7, wireSha);
    expect(r.status).toBe("drift");
    expect(r.detail).toContain("behind a spec bump");
    const r2 = await compareSpecs(specV7, specV6, await sha256Hex(specV6));
    expect(r2.status).toBe("drift");
    expect(r2.detail).toContain("missed a same-day re-vendor");
  });

  it("an operator-edited served copy is MODULATED, never drift (v11 PUT lane — 'a rev bump is laurent modulating, not a seat lagging')", async () => {
    const r = await compareSpecs(specV7, specV7 + " ", "some-other-sha", true, 3);
    expect(r.status).toBe("modulated");
    expect(r.detail).toContain("rev 3");
    // operator_edited with IDENTICAL bytes still matches (no edit in effect).
    const same = await compareSpecs(specV7, specV7, await sha256Hex(specV7), true, 3);
    expect(same.status).toBe("match");
  });

  it("absent wire sha degrades to a LABELED version-level check, never a formatting false-drift", async () => {
    // Same content, different serialization (the false-drift the sha
    // fallback would have produced if we hashed our own re-serialization).
    const wireCompact = JSON.stringify(JSON.parse(specV6));
    const r = await compareSpecs(specV6, wireCompact, null);
    expect(r.status).toBe("match");
    expect(r.detail).toContain("version level");
    const r2 = await compareSpecs(specV6, JSON.stringify(JSON.parse(specV7)), null);
    expect(r2.status).toBe("drift");
    expect(r2.detail).toContain("version mismatch");
  });
});
