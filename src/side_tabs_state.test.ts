import { describe, expect, it } from "vitest";

import { activeSideTab, initialSideTabs, persistedSideTab, sideTabsReducer } from "./side_tabs_state";

const TABS = ["chat", "detail", "ledger"];

describe("side panel state (two slots: docked choice vs drawer)", () => {
  it("narrow first load: the drawer starts closed even when a desktop tab is saved", () => {
    const s = initialSideTabs("ledger", TABS, "ledger");
    expect(activeSideTab(s, true)).toBeNull();
    expect(activeSideTab(s, false)).toBe("ledger");
  });

  it("restores the saved desktop choice: a tab, collapsed-by-choice, or the default for unknown/missing", () => {
    expect(initialSideTabs("detail", TABS, "ledger").desktop).toBe("detail");
    expect(initialSideTabs("", TABS, "ledger").desktop).toBeNull();
    expect(initialSideTabs("gone", TABS, "ledger").desktop).toBe("ledger");
    expect(initialSideTabs(null, TABS).desktop).toBe("chat");
  });

  it("drawer actions never touch the saved desktop choice (a narrow load widened past 1024 gets it back)", () => {
    let s = initialSideTabs("detail", TABS, "ledger");
    s = sideTabsReducer(s, { type: "toggle", id: "chat", narrow: true });
    expect(activeSideTab(s, true)).toBe("chat");
    s = sideTabsReducer(s, { type: "close", narrow: true });
    expect(activeSideTab(s, true)).toBeNull();
    // Crossing 1024 px up: the docked layout shows the saved tab, and that is what persists.
    expect(activeSideTab(s, false)).toBe("detail");
    expect(persistedSideTab(s)).toBe("detail");
  });

  it("docked actions change and persist the desktop slot only", () => {
    let s = initialSideTabs("detail", TABS, "ledger");
    s = sideTabsReducer(s, { type: "toggle", id: "detail", narrow: false });
    expect(persistedSideTab(s)).toBe("");
    expect(s.drawer).toBeNull();
    s = sideTabsReducer(s, { type: "request", id: "chat", narrow: false });
    expect(persistedSideTab(s)).toBe("chat");
  });

  it("toggle opens a tab and collapses the open one; a request opens without toggling", () => {
    let s = initialSideTabs(null, TABS);
    s = sideTabsReducer(s, { type: "toggle", id: "ledger", narrow: true });
    expect(s.drawer).toBe("ledger");
    s = sideTabsReducer(s, { type: "toggle", id: "ledger", narrow: true });
    expect(s.drawer).toBeNull();
    s = sideTabsReducer(s, { type: "request", id: "chat", narrow: true });
    s = sideTabsReducer(s, { type: "request", id: "chat", narrow: true });
    expect(s.drawer).toBe("chat");
  });
});
