/**
 * The index-page law (deep-link adversary attack line 5: the fix shape is a
 * pure module every navigation derives from). No index page is
 * URL-addressable since the blueprint page went (backlog 0022).
 */
import { describe, expect, it } from "vitest";

import { searchAfterNavigate } from "./index_page";

describe("searchAfterNavigate — the URL after a navigation", () => {
  it("clears a stale ?page, an old ?page=blueprint bookmark included (roster and fleet are not addressable)", () => {
    expect(searchAfterNavigate("?page=blueprint")).toBe("");
    expect(searchAfterNavigate("?page=fleet")).toBe("");
    expect(searchAfterNavigate("")).toBe("");
  });

  it("scrubs credentials (P2-1)", () => {
    expect(searchAfterNavigate("?token=secret&gateway=http%3A%2F%2Fx")).toBe("gateway=http%3A%2F%2Fx");
    expect(searchAfterNavigate("?token=secret")).toBe("");
  });

  it("preserves unrelated params (the gateway base rides through)", () => {
    expect(searchAfterNavigate("?gateway=http%3A%2F%2Fx&page=blueprint")).toBe("gateway=http%3A%2F%2Fx");
    expect(searchAfterNavigate("?gateway=http%3A%2F%2Fx")).toBe("gateway=http%3A%2F%2Fx");
  });
});

describe("wiring pins (source-level)", () => {
  it("the blueprint page is gone: no page, no route, no roster door; resets and Back land on the roster", async () => {
    const { readFileSync } = await import("node:fs");
    const view = readFileSync(new URL("./entity_view.tsx", import.meta.url), "utf8");
    const roster = readFileSync(new URL("./entities_index.tsx", import.meta.url), "utf8");
    expect(view).not.toMatch(/BlueprintPanel|BlueprintTunables|PhaseGraphEditor|"blueprint"|bp_page|pageFromSearch/);
    expect(roster).not.toMatch(/onBlueprint|🧭 blueprint|head\.blueprint/);
    expect(view).toContain("const [indexPage, setIndexPage] = useState<IndexPage>(\"roster\");");
    // The auth/poll reset and popstate land on the roster.
    expect(view).toContain('setIndexPage("roster");');
    expect(view).toContain('navigateIndexPage("roster", { pushUrl: false });');
    // Every index navigation clears a stale ?page; no URL-identical history pushes (P1-4).
    expect(view).toContain("const qs = searchAfterNavigate(window.location.search);");
    expect(view).toContain("if (next === current) return;");
  });

  it("the toolbar's phase-rules note names no blueprint", async () => {
    const { readFileSync } = await import("node:fs");
    const view = readFileSync(new URL("./entity_view.tsx", import.meta.url), "utf8");
    expect(view).toContain("🎛 phase rules modulated (");
    expect(view).toContain("⚠ phase rules drift: {specDrift.detail}");
    expect(view).not.toMatch(/blueprint modulated|phase-graph drift/);
  });
});
