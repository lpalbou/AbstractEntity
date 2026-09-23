/**
 * The deep-link matrix, unit-tested on the pure law (deep-link adversary
 * attack line 5: the P0 was an effect-ordering interaction no source pin
 * could hold — the testable fix shape is this module; every effect
 * derives from it, so the matrix here IS the behavior).
 */
import { describe, expect, it } from "vitest";

import { pageFromSearch, searchAfterNavigate } from "./index_page";

describe("pageFromSearch — the URL's recorded intent", () => {
  it("boot lands on the blueprint when the param says so", () => {
    expect(pageFromSearch("?page=blueprint")).toBe("blueprint");
    expect(pageFromSearch("?page=Blueprint")).toBe("blueprint");
  });

  it("the entity param WINS over page (an entity view is not the map)", () => {
    expect(pageFromSearch("?entity=ephemeral&page=blueprint")).toBe("roster");
  });

  it("absence, junk words, and fleet are the roster (fleet is deliberately not URL-addressable)", () => {
    expect(pageFromSearch("")).toBe("roster");
    expect(pageFromSearch("?page=fleet")).toBe("roster");
    expect(pageFromSearch("?page=zzz")).toBe("roster");
  });
});

describe("searchAfterNavigate — the URL after a navigation", () => {
  it("blueprint sets the param; roster and fleet clear it (a stale ?page never contradicts the screen)", () => {
    expect(searchAfterNavigate("", "blueprint")).toBe("page=blueprint");
    expect(searchAfterNavigate("?page=blueprint", "roster")).toBe("");
    expect(searchAfterNavigate("?page=blueprint", "fleet")).toBe("");
  });

  it("scrubs credentials from the one URL the feature invites the operator to SHARE (P2-1)", () => {
    expect(searchAfterNavigate("?token=secret&gateway=http%3A%2F%2Fx", "blueprint")).toBe("gateway=http%3A%2F%2Fx&page=blueprint");
  });

  it("preserves unrelated params (gateway base rides through)", () => {
    expect(searchAfterNavigate("?gateway=http%3A%2F%2Fx&page=blueprint", "roster")).toBe("gateway=http%3A%2F%2Fx");
  });

  it("the invariant: navigating to page P then reading the search back yields P (roster/blueprint round-trip)", () => {
    for (const page of ["roster", "blueprint"] as const) {
      const qs = searchAfterNavigate("?gateway=g", page);
      expect(pageFromSearch(qs ? `?${qs}` : "")).toBe(page);
    }
  });
});

describe("wiring pins (source-level: every landing derives from the ONE law)", () => {
  it("the reset effect and the popstate handler derive from pageFromSearch — never a hardcoded roster", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./entity_view.tsx", import.meta.url), "utf8");
    // P0-1: the auth/poll reset lands on the URL's recorded intent.
    expect(src).toContain("setIndexPage(pageFromSearch(window.location.search))");
    // P1-2: popstate goes through the law both directions.
    expect(src).toContain('navigateIndexPage(pageFromSearch(window.location.search), { pushUrl: false })');
    // P1-4: no URL-identical history pushes.
    expect(src).toContain("if (next === current) return;");
  });
});
