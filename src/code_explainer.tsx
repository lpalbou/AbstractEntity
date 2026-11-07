/**
 * The Cognitive Monitor's code explainer (operator 2026-11-07: the 3-letter codes are not
 * clickable; "after 0.3 s hovering on them, they should show an aesthetically pleasing modal
 * explaining what is the underlying 3-letter code").
 *
 * A code is a focusable label, never a button. Its card opens after EXPLAIN_DELAY_MS of mouse
 * hover, after the same delay on keyboard focus, and on a touch screen after a long-press of the
 * same length (a phone has no hover). It closes when the mouse leaves the code, on blur, on
 * Escape, on scroll or resize, and on any press elsewhere; one card is open at a time.
 *
 * Why not the kit's AfTooltip: it runs on one document-wide binding with a fixed 200 ms delay
 * (kit components acquire it), ignores touch by design, and cannot be opened from code, so a
 * 300 ms hover and a long-press cannot ride it; a second binding would show two cards. The card
 * reuses the kit's tooltip LOOK (theme.css `.af-tooltip`, structured layout: title, description,
 * facts, note) and its placement (afTooltipPlacement: above the code, flipped below, kept inside
 * the viewport), so it reads as the kit's card in every theme.
 */

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { afTooltipPlacement, type AfTooltipPlacement } from "@abstractframework/ui-kit";

import "./cognitive_monitor.css";

/** Hover, keyboard focus and long-press all wait this long before the card opens. */
export const EXPLAIN_DELAY_MS = 300;
/** A touch that moves farther than this before the delay is a scroll, not a long-press. */
const PRESS_SLOP_PX = 10;

export interface ExplainerContent {
  code: string;
  name: string;
  color: string;
  /** One plain sentence: what the code measures. */
  summary: string;
  /** This reply's (or turn's) value, as label/value rows. */
  facts: Array<{ label: string; value: string }>;
  /** The reason behind a "—", or how to read the number. */
  note?: string;
}

export type ExplainVia = "hover" | "focus" | "press";
export interface ExplainScheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realScheduler: ExplainScheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** The open/close rules, framework-free (the component wires DOM events to it; tests drive it
 * with a fake scheduler). `onChange` hears every open and close. */
export function createExplainerController(onChange: (via: ExplainVia | null) => void, scheduler: ExplainScheduler = realScheduler, delayMs = EXPLAIN_DELAY_MS) {
  let timer: unknown = null;
  let open: ExplainVia | null = null;
  let press: { x: number; y: number } | null = null;
  const cancel = () => {
    if (timer !== null) scheduler.clear(timer);
    timer = null;
  };
  const later = (via: ExplainVia) => {
    cancel();
    timer = scheduler.set(() => {
      timer = null;
      press = null;
      open = via;
      onChange(via);
    }, delayMs);
  };
  const hide = () => {
    cancel();
    press = null;
    if (open !== null) {
      open = null;
      onChange(null);
    }
  };
  return {
    /** Mouse or pen over the code: open after the delay. Touch never hovers. */
    pointerEnter(type: string) {
      if (type !== "touch" && open === null) later("hover");
    },
    /** Mouse leaves the code: close (and drop a pending open). A long-pressed card stays. */
    pointerLeave(type: string) {
      if (type !== "touch" && open !== "press") hide();
    },
    /** A touch on the code starts the long-press (or closes its open card); a mouse press closes. */
    pointerDown(type: string, x: number, y: number) {
      if (type !== "touch" || open !== null) {
        hide();
        return;
      }
      press = { x, y };
      later("press");
    },
    pointerMove(type: string, x: number, y: number) {
      if (type === "touch" && press && Math.hypot(x - press.x, y - press.y) > PRESS_SLOP_PX) {
        cancel();
        press = null;
      }
    },
    /** Lifted (or taken over by a scroll) before the delay: no card. */
    pointerUp() {
      if (press) {
        cancel();
        press = null;
      }
    },
    /** True while a long-press is pending (its context menu must not open). */
    pressing: () => press !== null,
    /** Keyboard focus opens after the delay; a pointer focus does nothing. */
    focus(keyboard: boolean) {
      if (keyboard && open === null) later("focus");
    },
    blur: hide,
    /** Escape, scroll, resize, a press elsewhere, unmount. */
    dismiss: hide,
    state: () => open,
  };
}

/** The card itself: the kit's structured tooltip layout (theme.css `.af-tooltip`). */
export const ExplainerCard = React.forwardRef<HTMLDivElement, { content: ExplainerContent; id?: string; style?: React.CSSProperties }>(function ExplainerCard({ content, id, style }, ref) {
  return (
    <div ref={ref} id={id} role="tooltip" className="af-tooltip cm_explainer" data-structured="true" style={style}>
      <div className="af-tooltip__title cm_explainer_title">
        <span className="cm_explainer_swatch" style={{ background: content.color }} aria-hidden="true" />
        <span className="cm_explainer_code">{content.code}</span>
        <span className="cm_explainer_name">{content.name}</span>
      </div>
      <p className="af-tooltip__description">{content.summary}</p>
      {content.facts.length ? (
        <dl className="af-tooltip__facts">
          {content.facts.map((f) => (
            <div key={f.label} className="af-tooltip__fact">
              <dt className="af-tooltip__label">{f.label}</dt>
              <dd className="af-tooltip__value">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {content.note ? <p className="af-tooltip__note">{content.note}</p> : null}
    </div>
  );
});

/** Closes the open card, so a second one never stacks on the first. */
let closeOpenCard: (() => void) | null = null;

/** A 3-letter code with its explainer card: focusable, not a button, no click action. */
export function ExplainedCode({ explain, className, style, children }: { explain: ExplainerContent; className: string; style?: React.CSSProperties; children: React.ReactNode }): React.ReactElement {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const [via, setVia] = useState<ExplainVia | null>(null);
  const [place, setPlace] = useState<AfTooltipPlacement | null>(null);
  const ctl = useMemo(() => createExplainerController(setVia), []);
  useEffect(() => () => ctl.dismiss(), [ctl]);

  // While open: the only card, closed by a press elsewhere, Escape, scroll or resize.
  useEffect(() => {
    if (via === null) return;
    const mine = () => ctl.dismiss();
    if (closeOpenCard && closeOpenCard !== mine) closeOpenCard();
    closeOpenCard = mine;
    const onDown = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) ctl.dismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); // an enclosing modal stays open for this one press
        ctl.dismiss();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", mine, true);
    window.addEventListener("resize", mine);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", mine, true);
      window.removeEventListener("resize", mine);
      if (closeOpenCard === mine) closeOpenCard = null;
    };
  }, [via, ctl]);

  // Placed once measured (the kit's rule: above the code, flipped below, inside the viewport).
  useLayoutEffect(() => {
    if (via === null) {
      setPlace(null);
      return;
    }
    const a = anchorRef.current?.getBoundingClientRect();
    const c = cardRef.current?.getBoundingClientRect();
    if (a && c) setPlace(afTooltipPlacement(a, { width: c.width, height: c.height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [via]);

  const keyboardFocus = (el: HTMLElement) => {
    try {
      return el.matches(":focus-visible");
    } catch {
      return false;
    }
  };
  return (
    <>
    <span
      ref={anchorRef}
      className={`${className} cm_explained`}
      style={style}
      tabIndex={0}
      aria-describedby={via !== null ? id : undefined}
      data-explained-open={via ?? undefined}
      onPointerEnter={(e) => ctl.pointerEnter(e.pointerType)}
      onPointerLeave={(e) => ctl.pointerLeave(e.pointerType)}
      onPointerDown={(e) => ctl.pointerDown(e.pointerType, e.clientX, e.clientY)}
      onPointerMove={(e) => ctl.pointerMove(e.pointerType, e.clientX, e.clientY)}
      onPointerUp={() => ctl.pointerUp()}
      onPointerCancel={() => ctl.pointerUp()}
      onContextMenu={(e) => {
        if (ctl.pressing() || ctl.state() === "press") e.preventDefault();
      }}
      onFocus={(e) => ctl.focus(keyboardFocus(e.currentTarget))}
      onBlur={() => ctl.blur()}
    >
      {children}
    </span>
    {/* A sibling, not a child: the card's events never reach the code through React. */}
    {via !== null && typeof document !== "undefined"
      ? createPortal(<ExplainerCard ref={cardRef} id={id} content={explain} style={{ top: place?.top ?? 0, left: place?.left ?? 0, visibility: place ? "visible" : "hidden" }} />, document.body)
      : null}
    </>
  );
}
