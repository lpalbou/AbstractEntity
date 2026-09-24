/**
 * The roster's first-run law, PURE (mission JJ, operator 2026-09-24: "if
 * there are no entities summoned yet, maybe give a button to create one").
 *
 * - `wantsCreateFlow` — the `#new` deep link: opening the app on it opens
 *   the creation form directly. The gateway console's Entity card uses it
 *   ("Create your first entity", through the signed-in handover).
 * - `rosterMode` — which of the roster's screens applies right now.
 * - `rosterHeadActions` — which head-row buttons make sense in that mode:
 *   with no entity there is nothing to watch or convene, and the empty
 *   state's own button is the one way to create.
 */

/** The creation deep link (`/#new`). `#/new` is accepted too (router-style
 * links people type by habit); anything else is not a creation request. */
export const CREATE_HASH = "#new";

export function wantsCreateFlow(hash: string | null | undefined): boolean {
  const h = String(hash || "").trim().toLowerCase();
  return h === "#new" || h === "#/new";
}

export type RosterMode = "loading" | "signin" | "error" | "empty" | "list";

export function rosterMode(input: { rowCount: number | null; authNeeded: boolean; error: string | null }): RosterMode {
  if (input.authNeeded) return "signin";
  if (input.rowCount === null) return input.error ? "error" : "loading";
  return input.rowCount === 0 ? "empty" : "list";
}

export interface RosterHeadActions {
  watchAll: boolean;
  convene: boolean;
  blueprint: boolean;
  refresh: boolean;
  /** The head's "+ new entity" toggle. In the empty state the centred card
   * carries the (one) create button instead. */
  newEntity: boolean;
}

export function rosterHeadActions(mode: RosterMode): RosterHeadActions {
  const some = mode === "list";
  return {
    watchAll: some,
    convene: some,
    // The blueprint is the cognition machine, the same for every entity:
    // it makes sense before the first one exists.
    blueprint: mode === "list" || mode === "empty",
    refresh: true,
    newEntity: some,
  };
}
