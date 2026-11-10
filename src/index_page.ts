/**
 * The index-page ↔ URL mapping, PURE (deep-link adversary P0-1: the
 * page↔URL logic lived scattered across effects; this module is the
 * testable law the navigation derives from).
 *
 * No index page is URL-addressable: the roster is the home, fleet is
 * deliberately not addressable (a refresh on fleet lands on the roster,
 * documented in the CHANGELOG), and the blueprint page went (operator
 * 2026-11-10, backlog 0022), so a stale ?page=blueprint bookmark lands on
 * the roster and the next navigation clears it.
 */

export type IndexPage = "roster" | "fleet";

/** The query string after navigating to an index page (any: none is
 * URL-addressable) — clears a stale
 * ?page and scrubs credentials (P2-1: a URL the operator may share must
 * never carry a token; the sibling push sites already scrub). Returns the
 * new search WITHOUT the leading "?", "" when empty. */
export function searchAfterNavigate(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("page");
  params.delete("token");
  return params.toString();
}
