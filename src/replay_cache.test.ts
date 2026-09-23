/**
 * Life-cache correctness: the pure halves (key identity, lineage check).
 * The IDB plumbing degrades to null on absence by construction (tested via
 * loadCachedLife in a node env, where indexedDB does not exist).
 */
import { describe, expect, it } from "vitest";
import { cacheKey, deltaSignalsEdgeGrowth, loadCachedLife, sameLineage } from "./replay_cache";
import type { ReplayEnvelope } from "./stream_types";

function env(seq: number, family = "event", observed_at = "2026-07-15T10:00:00.000001+00:00"): ReplayEnvelope {
  return { stream: "s", stream_version: 1, seq, family, observed_at, scope: "", owner_id: "", trace_id: null, turn_id: null, run_id: null, payload: {} } as unknown as ReplayEnvelope;
}

describe("cacheKey", () => {
  it("one identity per (origin, entity, display version), case-insensitive on the name", () => {
    // The ::dN suffix is the display-shape version: serving-end display
    // upgrades rewrite HISTORY, so bumping it must orphan old entries
    // (ENRICHED-STALENESS — stale "a diary entry" titles lived forever).
    expect(cacheKey("http://10.0.0.2:8080", "Castor")).toBe(cacheKey("http://10.0.0.2:8080/", "castor"));
    expect(cacheKey("http://10.0.0.2:8080", "Castor")).toMatch(/^http:\/\/10\.0\.0\.2:8080::castor::d\d+$/);
  });

  it("different gateways never share an entry (same name, two doors)", () => {
    expect(cacheKey("http://a:8080", "castor")).not.toBe(cacheKey("http://b:8080", "castor"));
  });
});

describe("sameLineage", () => {
  it("matches when the journal head is the cached first envelope", () => {
    const first = env(1);
    expect(sameLineage(first, [env(1)])).toBe(true);
  });

  it("skips host markers in the served head (fractional pre-journal marker)", () => {
    const first = env(1);
    const marker = env(0.001, "host");
    expect(sameLineage(first, [marker, env(1)])).toBe(true);
  });

  it("refuses a reborn life (same name, different first record)", () => {
    const cachedFirst = env(1, "event", "2026-07-01T00:00:00.000001+00:00");
    const rebornHead = env(1, "event", "2026-07-15T09:00:00.000002+00:00");
    expect(sameLineage(cachedFirst, [rebornHead])).toBe(false);
  });

  it("refuses on empty head or missing cached first (fail closed)", () => {
    expect(sameLineage(env(1), [])).toBe(false);
    expect(sameLineage(undefined, [env(1)])).toBe(false);
  });
});

describe("deltaSignalsEdgeGrowth (the confirm_relation staleness signal)", () => {
  function ev(family: string, payload: Record<string, unknown>): ReplayEnvelope {
    return { ...env(10), family, payload } as unknown as ReplayEnvelope;
  }

  it('fires on kind="cited" events (memory commons#2427: two per endpoint)', () => {
    expect(deltaSignalsEdgeGrowth([ev("event", { kind: "cited", record_id: "ex:old-1" })])).toBe(true);
  });

  it("fires on provenance.confirmed_relation regardless of kind", () => {
    expect(deltaSignalsEdgeGrowth([ev("event", { kind: "selected", provenance: { confirmed_relation: "rel-1" } })])).toBe(true);
  });

  it("stays quiet on ordinary usage events and non-event families", () => {
    expect(deltaSignalsEdgeGrowth([ev("event", { kind: "selected", record_id: "x" })])).toBe(false);
    // Bindings CARRY edges but signal nothing stale — the fold reads them.
    expect(deltaSignalsEdgeGrowth([ev("binding", { kind: "cited" })])).toBe(false);
    expect(deltaSignalsEdgeGrowth([])).toBe(false);
  });

  it("tolerates malformed provenance (scalar, null)", () => {
    expect(deltaSignalsEdgeGrowth([ev("event", { provenance: "oops" })])).toBe(false);
    expect(deltaSignalsEdgeGrowth([ev("event", { provenance: null })])).toBe(false);
  });
});

describe("IDB absence degrades silently", () => {
  it("loadCachedLife resolves null in a node env (no indexedDB)", async () => {
    await expect(loadCachedLife("http://x", "castor")).resolves.toBeNull();
  });
});
