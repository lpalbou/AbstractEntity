/**
 * The side panel's open/closed state, kept as TWO independent slots
 * (responsive pass, review round 4):
 *
 * - `desktop` — the docked layout's choice (>= 1024 px). Restored from and
 *   persisted to localStorage; only a docked-layout action changes it.
 * - `drawer` — the overlay drawer's state below 1024 px. Never persisted and
 *   always starts closed, so a phone opens on the graph.
 *
 * Crossing 1024 px in either direction simply reads the other slot: a narrow
 * first load that is later widened gets the user's saved desktop panel back
 * (the old single slot wrote the phone's "closed" over it).
 */

export interface SideTabsState {
  desktop: string | null;
  drawer: string | null;
}

export type SideTabsAction =
  /** A tab button: opens that tab, or collapses it when it is the open one. */
  | { type: "toggle"; id: string; narrow: boolean }
  /** Escape / backdrop / close button. */
  | { type: "close"; narrow: boolean }
  /** A parent request ("join its room" -> chat). */
  | { type: "request"; id: string; narrow: boolean };

/** The persisted desktop choice: "" = collapsed by choice, an id, or nothing
 * stored (null) -> the default tab. Unknown ids fall back to the default. */
export function initialSideTabs(stored: string | null, tabIds: readonly string[], defaultTab?: string): SideTabsState {
  let desktop: string | null;
  if (stored === "") desktop = null;
  else if (stored && tabIds.includes(stored)) desktop = stored;
  else desktop = defaultTab ?? tabIds[0] ?? null;
  return { desktop, drawer: null };
}

export function activeSideTab(state: SideTabsState, narrow: boolean): string | null {
  return narrow ? state.drawer : state.desktop;
}

export function sideTabsReducer(state: SideTabsState, action: SideTabsAction): SideTabsState {
  const slot = action.narrow ? "drawer" : "desktop";
  switch (action.type) {
    case "toggle":
      return { ...state, [slot]: state[slot] === action.id ? null : action.id };
    case "close":
      return state[slot] === null ? state : { ...state, [slot]: null };
    case "request":
      return state[slot] === action.id ? state : { ...state, [slot]: action.id };
    default:
      return state;
  }
}

/** The value written to localStorage: the desktop slot only ("" = collapsed). */
export function persistedSideTab(state: SideTabsState): string {
  return state.desktop ?? "";
}
