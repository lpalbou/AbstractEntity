/**
 * The vertical tab rail (maintainer's reference: blackpixel's right
 * sidebar — a narrow rail of vertical-text tabs on the panel's edge, ONE
 * panel shown at a time, clicking the active tab collapses to the rail).
 *
 * Not stacked accordions: tabs. The rail faces the canvas; the active tab
 * protrudes and carries the accent.
 *
 * Responsive (DESIGN v1 §5.2): at >= 1024 px the panel is docked beside the
 * canvas exactly as before. Below 1024 px the rail stays (the opener) and the
 * open panel OVERLAYS the canvas as a drawer — Escape, the backdrop and the
 * panel's close button collapse it, focus returns to the tab that opened it.
 * Below 768 px (and on short landscape phones) the rail turns into a
 * horizontal tab strip along the bottom of the view (CSS). A narrow first load
 * starts collapsed so the graph — the protagonist — is what a phone shows.
 */

import React, { useEffect, useReducer, useRef, useState } from "react";
import { AF_MEDIA, useAfMedia } from "@abstractframework/ui-kit";

import { ErrorBoundary } from "./error_boundary";
import { activeSideTab, initialSideTabs, persistedSideTab, sideTabsReducer } from "./side_tabs_state";

const STORAGE_KEY = "abstractentity_side_tab_v1";

export interface SideTab {
  id: string;
  icon: string;
  title: string;
  /** Small live hint rendered as a dot on the tab (e.g. visiting). */
  hint?: boolean;
  content: React.ReactNode;
}

const WIDTH_KEY = "abstractentity_side_width_v1";
const MIN_WIDTH = 300;
const MAX_WIDTH = 900;
/** The docked panel's default width (px); the graph container threshold in
 * entity.css is chosen against it (see responsive_css.test.ts). */
export const DEFAULT_WIDTH = 380;

export interface SideTabsProps {
  tabs: SideTab[];
  defaultTab?: string;
  /** Controlled active tab (roster-open lands on chat: "join its room"). */
  activeTab?: string | null;
}

export function SideTabs({ tabs, defaultTab, activeTab: controlledTab }: SideTabsProps): React.ReactElement {
  const narrow = useAfMedia(AF_MEDIA.md);
  // Two slots (side_tabs_state.ts): the docked layout's persisted choice and
  // the drawer's own state (starts closed, never persisted).
  const [tabState, dispatch] = useReducer(sideTabsReducer, undefined, () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // presentation state only
    }
    return initialSideTabs(
      stored,
      tabs.map((t) => t.id),
      defaultTab,
    );
  });
  const active = activeSideTab(tabState, narrow);
  const setActive = (next: string | null) => {
    if (next === null) dispatch({ type: "close", narrow });
    else dispatch({ type: "request", id: next, narrow });
  };

  // A parent may request a tab (e.g. "chat" when entering a room), carried
  // as "<tab>#<nonce>" so re-entering the same entity re-applies it. The
  // request only steers when it CHANGES; the user switches freely after.
  const lastRequestRef = React.useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (controlledTab !== undefined && controlledTab !== lastRequestRef.current) {
      lastRequestRef.current = controlledTab;
      const tabId = controlledTab ? controlledTab.split("#", 1)[0] : null;
      if (tabId && tabs.some((t) => t.id === tabId)) dispatch({ type: "request", id: tabId, narrow });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledTab, tabs]);

  const persisted = persistedSideTab(tabState);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, persisted);
    } catch {
      // best-effort
    }
  }, [persisted]);

  // Drawer mode (< 1024): Escape collapses, focus moves into the opened panel
  // and back to the tab that opened it on close.
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const drawerOpen = narrow && active !== null;
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // One Escape closes ONE layer: a modal opened over the drawer (the
      // app's .ev_backdrop dialogs, kit modals) owns this Escape.
      if (document.querySelector(".ev_backdrop, [aria-modal='true']")) return;
      e.preventDefault();
      setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (drawerOpen && !wasOpenRef.current) panelRef.current?.focus({ preventScroll: true });
    if (!drawerOpen && wasOpenRef.current && narrow) openerRef.current?.focus({ preventScroll: true });
    wasOpenRef.current = drawerOpen;
  }, [drawerOpen, narrow, active]);

  // Resizable width (maintainer ask, 2026-07-09: "more room for the right
  // panel, including for better conversations"). Persisted; drag the border.
  const [width, setWidth] = useState<number>(() => {
    try {
      const raw = parseInt(localStorage.getItem(WIDTH_KEY) || "", 10);
      if (!Number.isNaN(raw)) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, raw));
    } catch {
      // presentation only
    }
    return DEFAULT_WIDTH;
  });
  const dragRef = React.useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // The panel is on the RIGHT: dragging left (negative dx) widens it.
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, d.startW + (d.startX - e.clientX)));
      setWidth(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(WIDTH_KEY, String(Math.round(width)));
      } catch {
        // best-effort
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [width]);

  const activeTab = tabs.find((t) => t.id === active) ?? null;

  return (
    <div
      className={`side_tabs ${activeTab ? "" : "side_tabs_collapsed"}${narrow ? " side_tabs_drawer" : ""}`}
      style={activeTab && !narrow ? { width } : undefined}
    >
      {drawerOpen ? <div className="st_backdrop" aria-hidden="true" onClick={() => setActive(null)} /> : null}
      {activeTab && !narrow ? (
        <div
          className="st_resize"
          title="Drag to resize — more room for the conversation"
          onMouseDown={(e) => {
            dragRef.current = { startX: e.clientX, startW: width };
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            e.preventDefault();
          }}
        />
      ) : null}
      <div className="st_rail" role="tablist" aria-label="Entity panels">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={tab.id === active}
            className={`st_tab ${tab.id === active ? "st_tab_active" : ""}`}
            title={tab.id === active ? `Collapse ${tab.title}` : tab.title}
            onClick={(e) => {
              openerRef.current = e.currentTarget;
              dispatch({ type: "toggle", id: tab.id, narrow });
            }}
          >
            <span className="st_tab_label">{tab.title}</span>
            {tab.hint ? <span className="st_tab_hint" /> : null}
          </button>
        ))}
      </div>
      {/* Every panel stays MOUNTED; inactive ones hide via CSS. Unmounting
        * killed live component state — the chat drawer forgot its own open
        * session on tab switch and greeted it as a foreign visit (the
        * maintainer's live P0, and the same bug class as the AbstractFlow
        * assistant drawer keep-alive). Each panel is error-bounded: one
        * panel's render error may never take the app down (the 23:49
        * critical — a chat 409 followed by React #31 killed the whole
        * window). */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          ref={tab.id === active ? panelRef : undefined}
          className="st_panel"
          role={narrow ? "dialog" : undefined}
          aria-label={narrow ? tab.title : undefined}
          tabIndex={narrow ? -1 : undefined}
          style={tab.id === active ? undefined : { display: "none" }}
        >
          {narrow && tab.id === active ? (
            <div className="st_drawer_head">
              <span className="st_drawer_title">{tab.title}</span>
              <button type="button" className="st_drawer_close" onClick={() => setActive(null)} aria-label={`Close ${tab.title}`} title={`Close ${tab.title}`}>
                ✕
              </button>
            </div>
          ) : null}
          <ErrorBoundary label={`the ${tab.title.toLowerCase()} panel`}>{tab.content}</ErrorBoundary>
        </div>
      ))}
    </div>
  );
}
