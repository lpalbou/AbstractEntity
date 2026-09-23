/**
 * The index-page ↔ URL mapping, PURE (deep-link adversary P0-1: the
 * page↔URL logic lived scattered across effects, and the reset effect's
 * raw setIndexPage("roster") clobbered a deep-linked boot during the
 * demo→gateway→auth-verified window — an effect-ordering defect no
 * source pin could hold. This module is the testable law; every effect
 * derives from it instead of hardcoding a landing).
 *
 * Only the BLUEPRINT is URL-addressable (laurent dm#147 approved exactly
 * that); fleet is deliberately not — a refresh on fleet lands on the
 * roster, documented in the CHANGELOG.
 */

export type IndexPage = "roster" | "fleet" | "blueprint";

/** The page the URL records — the recorded intent a boot, a reset, or a
 * re-auth must land on. Fleet never appears here (not URL-addressable). */
export function pageFromSearch(search: string): "roster" | "blueprint" {
  const params = new URLSearchParams(search);
  // An entity view is never the blueprint: the entity param wins.
  if ((params.get("entity") || "").trim()) return "roster";
  return (params.get("page") || "").trim().toLowerCase() === "blueprint" ? "blueprint" : "roster";
}

/** The query string after navigating to `page` — sets/clears the param and
 * scrubs credentials (P2-1: the one URL the feature invites the operator
 * to SHARE must never carry a token; the sibling push sites already
 * scrub). Returns the new search WITHOUT the leading "?", "" when empty. */
export function searchAfterNavigate(search: string, page: IndexPage): string {
  const params = new URLSearchParams(search);
  if (page === "blueprint") params.set("page", "blueprint");
  else params.delete("page");
  params.delete("token");
  return params.toString();
}
