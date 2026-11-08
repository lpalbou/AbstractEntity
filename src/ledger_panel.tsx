/**
 * The memory ledger beside the graph (the fork monitor's right panel,
 * with the WHY visible): one human line per envelope up to the scrub
 * position. Clicking a line scrubs to it; lines about a node select it.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import { AF_MEDIA, AfMemoryHintChip, useAfMedia } from "@abstractframework/ui-kit";

import { isDiaryGraphId } from "./stream_fold";

import { clockUtc, dayLabelUtc, dayUtc, foldLedgerLines, lineTarget, rowHint, type IndexedLine, type LedgerLineFold } from "./ledger_lines";
import type { ReplayEnvelope } from "./stream_types";
import { fromLink, WordsLine } from "./words_line";

export interface LedgerPanelProps {
  envelopes: ReplayEnvelope[];
  scrubIndex: number;
  onJump(index: number): void;
  onSelectSubject(id: string | null): void;
  /** Hide quiet lines (considered/audit) by default. */
  showQuiet: boolean;
  onToggleQuiet(): void;
  /** Progressive-load status ("loading his life… 42,000 events · 60 MB").
   * A half-loaded ledger must SAY so — mid-flight it otherwise reads as
   * amnesia (maintainer, 2026-07-09 morning: "40k -> <1000"). */
  loadingNote?: string | null;
  /** Live tail mode: the panel follows the BOTTOM as envelopes land (B3,
   * laurent 04:58 — "events pop in the graph and nothing gets updated in
   * the ledger": the old follow keyed on `.el_row_current`, which a
   * collapsed usage weave never carries, so auto-follow silently died
   * during exactly the bursts that make the graph pulse). Scrolling up
   * pauses the follow (reading is respected); a pill counts what landed
   * below and one click resumes. */
  live?: boolean;
}

/** Rows drawn at once. A 24/7 life accumulates tens of thousands of
 * envelopes; unbounded DOM rows jank the browser long before the fold
 * does (adversarial scale review 2.2). The window slides with the scrub. */
const RENDER_WINDOW = 600;

/** A render item: one line, or a collapsed BURST of same-kind lines.
 * ONE recall deposits one `selected` event per shelf record AND one
 * `co_selected` event per pair; a line per event reads as a wall of
 * "Used"/"Used together" sameness (maintainer, 2026-07-10 20:09+20:50).
 * Consecutive lines of the same groupKind from the SAME recall
 * (trace_id) collapse into one row naming the distinct memories; the
 * individual events stay reachable by expanding the row.
 * "repeat" runs (identical-title host markers, e.g. dozens of operator
 * diary reads from one scoring pass) fold on TITLE identity instead of
 * trace (host markers carry no trace) — maintainer 2026-07-15: "the book
 * was read is super repetitive and should at least be folded". */
type WeaveGroup = "use" | "pair" | "repeat";
type RenderItem = { kind: "line"; item: IndexedLine } | { kind: "weave"; key: string; group: WeaveGroup; items: IndexedLine[] };

function groupPairRuns(visible: IndexedLine[]): RenderItem[] {
  const out: RenderItem[] = [];
  let run: IndexedLine[] = [];
  const flush = () => {
    if (run.length >= 2) {
      out.push({ kind: "weave", key: `w-${run[0].line.seq}`, group: run[0].line.groupKind as WeaveGroup, items: run });
    } else {
      for (const item of run) out.push({ kind: "line", item });
    }
    run = [];
  };
  for (const item of visible) {
    const g = item.line.groupKind;
    const prev = run.length > 0 ? run[run.length - 1].line : null;
    const sameRun =
      g !== undefined &&
      prev !== null &&
      prev.groupKind === g &&
      // Recall bursts share a trace; repeat bursts share a TITLE (host
      // markers have no trace — identity is the repeated line itself).
      (g === "repeat" ? prev.title === item.line.title : prev.trace_id === item.line.trace_id);
    if (g !== undefined && (run.length === 0 || sameRun)) {
      run.push(item);
    } else {
      flush();
      if (g !== undefined) run.push(item);
      else out.push({ kind: "line", item });
    }
  }
  flush();
  return out;
}

/** The stamp a row is dated by (a weave: its first line). */
function rowStamp(item: RenderItem): string {
  return item.kind === "line" ? item.item.line.observed_at : item.items[0].line.observed_at;
}

/** Every distinct member of a weave, in full (the row's hover). */
function weaveMembers(items: IndexedLine[]): string {
  const all: string[] = [];
  for (const it of items) for (const m of it.line.members ?? [it.line.detail]) if (m && !all.includes(m)) all.push(m);
  return all.join("\n");
}

function weaveSummary(group: WeaveGroup, items: IndexedLine[]): { title: string; detail: string } {
  if (group === "repeat") {
    // Count distinct details ("operator — book" x12, "… cognition
    // calibration" x9) so the folded row still says WHO and WHY.
    const counts = new Map<string, number>();
    for (const it of items) {
      for (const m of it.line.members ?? [it.line.detail]) {
        counts.set(m, (counts.get(m) ?? 0) + 1);
      }
    }
    const parts = [...counts.entries()].map(([d, n]) => (n > 1 ? `${d} ×${n}` : d));
    return {
      title: `${items[0].line.title} ×${items.length}`,
      detail: parts.slice(0, 4).join(" · ") + (parts.length > 4 ? ` · and ${parts.length - 4} more` : ""),
    };
  }
  const members: string[] = [];
  for (const it of items) {
    for (const m of it.line.members ?? []) {
      if (!members.includes(m)) members.push(m);
    }
  }
  const shown = members.slice(0, 5);
  const more = members.length - shown.length;
  const list = `${shown.join(" · ")}${more > 0 ? ` · and ${more} more` : ""}`;
  if (group === "pair") {
    return {
      title: `🕸 Woven together — ${items.length} association${items.length === 1 ? "" : "s"} deepened`,
      detail: `${members.length} memories served this moment side by side: ${list}`,
    };
  }
  return {
    title: `🔦 Used — ${members.length} memor${members.length === 1 ? "y" : "ies"} served this moment`,
    detail: list,
  };
}

/** A row's time: the clock on screen; the date, tick and event number on
 * hover and for screen readers (touch has no hover — the row's own text
 * and the date separators carry what a reader needs). */
function TimeCell({ iso, hint }: { iso: string; hint: string }): React.ReactElement {
  return (
    <div className="el_row_meta" title={hint}>
      <time className="el_time" dateTime={iso} aria-hidden="true">
        {clockUtc(iso)}
      </time>
      <span className="sr_only">{hint}</span>
    </div>
  );
}

/** What each colour means, in plain words (operator 2026-11-07: "the
 * colour code is not explained"). The tones are ledger_lines' `tone`. */
const LEDGER_KEY: Array<{ tone: string; label: string }> = [
  { tone: "formation", label: "memory formed or changed" },
  { tone: "usage", label: "memories drawn on" },
  { tone: "context", label: "came to mind, held in mind" },
  { tone: "feeling", label: "feeling" },
  { tone: "revision", label: "memory revised" },
  { tone: "session", label: "visits, phases, actions" },
];

const KEY_OPEN_STORAGE = "entity.ledger.keyOpen";

function LedgerKey(props: { showQuiet: boolean }): React.ReactElement {
  const narrow = useAfMedia(AF_MEDIA.md);
  const items = props.showQuiet ? [...LEDGER_KEY, { tone: "quiet", label: "audit detail" }] : LEDGER_KEY;
  // Your last choice wins; until you make one it is open on a wide screen
  // and folded on a phone.
  const [stored, setStored] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem(KEY_OPEN_STORAGE);
      return v === null ? null : v === "1";
    } catch {
      return null;
    }
  });
  const open = stored ?? !narrow;
  return (
    <details
      className="el_key"
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        if (next === open) return;
        setStored(next);
        try {
          localStorage.setItem(KEY_OPEN_STORAGE, next ? "1" : "0");
        } catch {
          // a remembered fold is a convenience only
        }
      }}
    >
      <summary>Colour key · times are UTC</summary>
      <div className="el_key_items" aria-label="What the colours mean">
        {items.map((k) => (
          <span key={k.tone} className={`el_key_item el_tone_${k.tone}`}>
            <span className="el_key_dot" aria-hidden="true" />
            {k.label}
          </span>
        ))}
        <span className="el_key_item el_key_mark">— day · tick —</span>
        <span className="el_key_item el_key_note">hover a time: its date, tick and event number</span>
      </div>
    </details>
  );
}

/** Distance from the bottom that still counts as "at the bottom". */
const FOLLOW_SLACK_PX = 80;

/** How long a landed row keeps its flash class (the CSS fade is shorter). */
export const LANDING_FLASH_MS = 4000;

/** One commit of the landing baseline. `settled` is the newest line index
 * seen while the ledger was live and caught up (null while it streams in, or
 * is not live); a landing flashes only the lines past a SETTLED baseline —
 * the commit that ends the catch-up stream is a baseline, never a landing
 * (adversarial review 2026-11-08: every row flashed when loading ended). */
export function landingStep(settled: number | null, top: number, unsettled: boolean): { settled: number | null; flashAfter: number | null } {
  if (unsettled) return { settled: null, flashAfter: null };
  if (settled !== null && top > settled) return { settled: top, flashAfter: settled };
  return { settled: top, flashAfter: null };
}

/** Indices of the lines that landed after `prevTop` (the newest index the
 * reader had seen). Pure, so the flash set is testable without a DOM. */
export function landedIndices(lines: ReadonlyArray<{ index: number }>, prevTop: number): number[] {
  const out: number[] = [];
  for (let i = lines.length - 1; i >= 0 && lines[i].index > prevTop; i--) out.push(lines[i].index);
  return out.reverse();
}

/** How long after a reader's upward gesture a scroll still counts as theirs. */
export const GESTURE_WINDOW_MS = 250;

/** The live follow after a scroll event. At the bottom it follows. Only a
 * scroll that moved UP *because the reader moved it* (a wheel, a finger, a
 * key, a scrollbar drag within GESTURE_WINDOW_MS) detaches it. The list
 * also shrinks ABOVE the reader on its own — recall lines collapse into
 * one weave row as they arrive, the render window drops old rows — and the
 * browser then clamps scrollTop: that looked like a scroll up and let the
 * follow go while the reader sat at the bottom (operator 2026-11-08,
 * screenshot with the "2 new lines below" pill). Such a drift keeps the
 * follow, and the caller snaps back to the bottom. */
export function followAfterScroll(following: boolean, m: { gap: number; top: number; lastTop: number; userUp: boolean }): boolean {
  if (m.gap <= FOLLOW_SLACK_PX) return true;
  if (m.top < m.lastTop && m.userUp) return false;
  return following;
}

interface FollowRefs {
  stick: { current: boolean };
  lastTop: { current: number };
}

type ScrollList = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight" | "clientWidth" | "addEventListener" | "removeEventListener">;

function jumpToBottom(el: ScrollList, lastTop: FollowRefs["lastTop"]): void {
  el.scrollTop = el.scrollHeight;
  lastTop.current = el.scrollTop;
}

/** The reader's upward gestures, the only thing that may detach the follow:
 * wheel up, a finger dragging down (content up), the keys that move up, and
 * a press on the scrollbar (right of the client box) until release. */
export function isUpwardKey(key: string, shift = false): boolean {
  return key === "ArrowUp" || key === "PageUp" || key === "Home" || (key === " " && shift);
}

/** The strip at the list's right edge where a scrollbar lives — a classic
 * bar sits beyond clientWidth, a macOS overlay bar INSIDE it (adversarial
 * review 2026-11-08: dragging an overlay bar never left the bottom). */
export const SCROLLBAR_STRIP_PX = 16;
export function isScrollbarPress(offsetX: number, clientWidth: number): boolean {
  return offsetX >= clientWidth - SCROLLBAR_STRIP_PX;
}

/** Live follow on the ledger list: start at the bottom, judge each scroll
 * with `followAfterScroll`, and land on the newest line whenever the list
 * is revealed — the drawer hides inactive tabs with display:none, where
 * scrolling is a no-op, so opening the Ledger tab otherwise showed
 * wherever the hidden list was left (adversarial review 2026-11-07).
 * Returns the detach function. */
export function attachLiveFollow(
  el: ScrollList,
  refs: FollowRefs,
  onAtBottom: () => void,
  Observer: typeof ResizeObserver = ResizeObserver,
  content?: Element | null,
  now: () => number = () => Date.now(),
): () => void {
  let upAt = -Infinity; // when the reader last gestured upward
  let barHeld = false; // the scrollbar is being dragged
  let touchY: number | null = null;
  const userUp = () => barHeld || now() - upAt <= GESTURE_WINDOW_MS;
  const onScroll = () => {
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    refs.stick.current = followAfterScroll(refs.stick.current, { gap, top: el.scrollTop, lastTop: refs.lastTop.current, userUp: userUp() });
    if (refs.stick.current && gap > FOLLOW_SLACK_PX) {
      jumpToBottom(el, refs.lastTop); // the list moved under the reader; stay at the bottom
      return;
    }
    if (refs.stick.current && gap <= FOLLOW_SLACK_PX) onAtBottom();
    refs.lastTop.current = el.scrollTop;
  };
  const onWheel = (e: Event) => {
    if ((e as WheelEvent).deltaY < 0) upAt = now();
  };
  const onKey = (e: Event) => {
    const k = e as KeyboardEvent;
    if (isUpwardKey(k.key, k.shiftKey)) upAt = now();
  };
  const onTouchStart = (e: Event) => {
    touchY = (e as TouchEvent).touches[0]?.clientY ?? null;
  };
  const onTouchMove = (e: Event) => {
    const y = (e as TouchEvent).touches[0]?.clientY;
    if (y !== undefined && touchY !== null && y > touchY) upAt = now();
    if (y !== undefined) touchY = y;
  };
  const onPointerDown = (e: Event) => {
    if (isScrollbarPress((e as MouseEvent).offsetX, el.clientWidth)) barHeld = true;
  };
  const onPointerUp = () => {
    barHeld = false;
  };
  // Fires when the list is revealed (its own box changes) AND when its
  // CONTENT grows (operator 2026-11-08: "keep tracking the last events"):
  // a landed row renders its Markdown a beat after the row count moved,
  // and a line that grows in place moves no count at all — observing the
  // container alone missed both, so the follow fell a few lines short.
  const revealed = new Observer(() => {
    if (refs.stick.current && el.clientHeight > 0) jumpToBottom(el, refs.lastTop);
  });
  refs.stick.current = true;
  jumpToBottom(el, refs.lastTop);
  revealed.observe(el as unknown as Element);
  if (content) revealed.observe(content);
  el.addEventListener("scroll", onScroll, { passive: true });
  el.addEventListener("wheel", onWheel, { passive: true });
  el.addEventListener("keydown", onKey);
  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchmove", onTouchMove, { passive: true });
  el.addEventListener("mousedown", onPointerDown);
  const win: Pick<Window, "addEventListener" | "removeEventListener"> | null = typeof window === "undefined" ? null : window;
  win?.addEventListener("mouseup", onPointerUp);
  return () => {
    revealed.disconnect();
    el.removeEventListener("scroll", onScroll);
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("keydown", onKey);
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchmove", onTouchMove);
    el.removeEventListener("mousedown", onPointerDown);
    win?.removeEventListener("mouseup", onPointerUp);
  };
}

export function LedgerPanel(props: LedgerPanelProps): React.ReactElement {
  const { envelopes, scrubIndex, showQuiet } = props;
  const listRef = useRef<HTMLDivElement | null>(null);
  // Incremental line fold (ledger_lines.foldLedgerLines): appends extend
  // it, a mid-array host-marker insert rebuilds it, and every change
  // yields a NEW lines array so the memos below see the live tail.
  const foldRef = useRef<LedgerLineFold | null>(null);
  const lines: IndexedLine[] = useMemo(() => {
    foldRef.current = foldLedgerLines(foldRef.current, envelopes);
    return foldRef.current.lines;
  }, [envelopes]);

  const visible = useMemo(() => {
    const out: IndexedLine[] = [];
    for (const item of lines) {
      if (!showQuiet && item.line.tone === "quiet") continue;
      out.push(item);
    }
    return out;
  }, [lines, showQuiet]);

  // Collapse consecutive pair-trail lines (same recall) into weave rows;
  // expansion is per-row, remembered while the panel lives.
  const [expandedWeaves, setExpandedWeaves] = useState<Set<string>>(() => new Set());
  const renderItems = useMemo(() => groupPairRuns(visible), [visible]);

  // Honest emptiness (night-watch finding, 0010 2026-07-08): a stream tail
  // of pure recall bookkeeping (listed/selected/co_selected) rendered as
  // SILENCE with audit lines off — and a tired human read "corrupted".
  // Count what the filter hid at the tail and SAY it.
  const hiddenQuietTail = useMemo(() => {
    if (showQuiet) return 0;
    const lastShownIdx = visible.length > 0 ? lines.lastIndexOf(visible[visible.length - 1]) : -1;
    let count = 0;
    for (let i = lastShownIdx + 1; i < lines.length; i++) {
      if (lines[i].line.tone === "quiet") count++;
    }
    return count;
  }, [lines, visible, showQuiet]);

  // Sliding render window centered on the scrub position (over render
  // items — a collapsed weave counts as ONE row, which is the point).
  const windowed = useMemo(() => {
    const indexOf = (it: RenderItem) => (it.kind === "line" ? it.item.index : it.items[0].index);
    if (renderItems.length <= RENDER_WINDOW) return { rows: renderItems, hiddenBefore: 0, hiddenAfter: 0 };
    let anchor = renderItems.length - 1;
    for (let i = 0; i < renderItems.length; i++) {
      if (indexOf(renderItems[i]) > scrubIndex) {
        anchor = Math.max(0, i - 1);
        break;
      }
    }
    const start = Math.max(0, Math.min(anchor - Math.floor(RENDER_WINDOW * 0.75), renderItems.length - RENDER_WINDOW));
    const rows = renderItems.slice(start, start + RENDER_WINDOW);
    return { rows, hiddenBefore: start, hiddenAfter: renderItems.length - (start + rows.length) };
  }, [renderItems, scrubIndex]);

  useEffect(() => {
    if (props.live) return; // live mode follows the bottom, not the scrub row
    const el = listRef.current?.querySelector(".el_row_current");
    el?.scrollIntoView({ block: "nearest" });
  }, [scrubIndex, props.live]);

  // Live-follow (B3): stick to the bottom while the operator is AT the
  // bottom; new lines land in view the moment the graph pulses. Scrolling
  // up detaches; the pill below re-attaches. `.el_row_current` cannot carry
  // this job — weave rows and boundary rows have no current marker.
  const stickRef = useRef(true);
  const lastTopRef = useRef(0);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const seenRef = useRef({ rows: renderItems.length, showQuiet });
  const [missedBelow, setMissedBelow] = useState(0);
  // Lines that landed while the reader watched live: their rows get the
  // landing flash (a discreet accent wash that fades). The first fold and
  // the catch-up stream are not landings — nothing flashes until his life
  // has streamed in; the set forgets a line after the flash has faded so a
  // row remounted later (a window slide) does not flash again.
  const freshRef = useRef<Set<number>>(new Set());
  const topIndexRef = useRef<number | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el || !props.live) return;
    return attachLiveFollow(el, { stick: stickRef, lastTop: lastTopRef }, () => setMissedBelow(0), ResizeObserver, innerRef.current);
  }, [props.live]);
  useEffect(() => {
    // Runs on every visible LINE (a weave grows in place, its row count
    // does not move); the pill counts ROWS, what the reader will see. A
    // filter toggle is not a landing: it only resyncs the count.
    const seen = seenRef.current;
    const landed = seen.showQuiet === showQuiet ? renderItems.length - seen.rows : 0;
    seenRef.current = { rows: renderItems.length, showQuiet };
    const top = lines.length > 0 ? lines[lines.length - 1].index : -1;
    const step = landingStep(topIndexRef.current, top, Boolean(props.loadingNote) || !props.live);
    topIndexRef.current = step.settled;
    if (!props.live) return;
    if (step.flashAfter !== null) {
      const fresh = freshRef.current;
      const added = landedIndices(lines, step.flashAfter);
      added.forEach((i) => fresh.add(i));
      window.setTimeout(() => added.forEach((i) => fresh.delete(i)), LANDING_FLASH_MS);
    }
    const el = listRef.current;
    if (!el) return;
    if (stickRef.current) {
      jumpToBottom(el, lastTopRef);
      setMissedBelow(0);
    } else if (landed > 0) {
      setMissedBelow((n) => n + landed);
    }
  }, [lines, visible.length, renderItems.length, showQuiet, props.live, props.loadingNote]);

  const renderRow = (renderItem: RenderItem, rowIdx: number): React.ReactElement => {
      if (renderItem.kind === "weave") {
        const { key, group, items } = renderItem;
        const expanded = expandedWeaves.has(key);
        const first = items[0];
        const last = items[items.length - 1];
        const reached = first.index <= scrubIndex;
        const summary = weaveSummary(group, items);
        const weaveTone = group === "repeat" ? first.line.tone : "usage";
        return (
          <React.Fragment key={key}>
            <div
              className={`el_row el_tone_${weaveTone} el_weave ${reached ? "" : "el_row_future"} ${freshRef.current.has(last.index) ? "el_row_new" : ""}`}
              onClick={(e) => {
                if (fromLink(e)) return;
                setExpandedWeaves((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              title={expanded ? "Collapse the pairings" : "Expand to see each pairing"}
            >
              <TimeCell iso={first.line.observed_at} hint={rowHint(first.line.seq, last.line.seq, first.line.turn_id, first.line.observed_at, first.own)} />
              <div className="el_row_body">
                <div className="el_title">
                  <WordsLine text={summary.title} inline /> {expanded ? "▾" : "▸"}
                  {first.line.trace_id ? (
                    <button
                      className="el_open_btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onSelectSubject(`beat:${first.line.trace_id}`);
                      }}
                    >
                      open →
                    </button>
                  ) : null}
                </div>
                <div className="el_detail" title={weaveMembers(items)}>
                  <WordsLine text={summary.detail} inline />
                </div>
              </div>
            </div>
            {expanded
              ? items.map(({ line, index, own }, i) => (
                  <div
                    key={`${key}-${i}`}
                    className={`el_row el_tone_usage el_weave_member ${index <= scrubIndex ? "" : "el_row_future"}`}
                    onClick={(e) => {
                      if (fromLink(e)) return;
                      props.onJump(index);
                      if (line.subject_id) props.onSelectSubject(line.subject_id);
                    }}
                  >
                    <TimeCell iso={line.observed_at} hint={rowHint(line.seq, null, line.turn_id, line.observed_at, own)} />
                    <div className="el_row_body">
                      <div className="el_detail">
                        <WordsLine text={line.detail} />
                      </div>
                    </div>
                  </div>
                ))
              : null}
          </React.Fragment>
        );
      }
      const { line, index } = renderItem.item;
      const reached = index <= scrubIndex;
      const isCurrent = index === scrubIndex && line.family !== "boundary";
      if (line.family === "boundary") {
        // Day/tick rhythm rows: centered, no meta column — the shape
        // of his own time, readable at a glance.
        return (
          <div
            key={`b-${line.seq}-${rowIdx}`}
            className={`el_row el_boundary ${reached ? "" : "el_row_future"}`}
            onClick={(e) => !fromLink(e) && props.onJump(index)}
          >
            <div className="el_boundary_title">
              <WordsLine text={line.title} />
            </div>
            {line.detail ? (
              <div className="el_boundary_detail">
                <WordsLine text={line.detail} />
              </div>
            ) : null}
          </div>
        );
      }
      const target = lineTarget(line);
      return (
        <div
          // Keyed by the line's place in the fold, not its place in the
          // window: a window slide must not remount (and re-flash) rows.
          key={`${line.seq}-${index}`}
          className={`el_row el_tone_${line.tone} ${reached ? "" : "el_row_future"} ${isCurrent ? "el_row_current" : ""} ${target ? "el_row_open" : ""} ${freshRef.current.has(index) ? "el_row_new" : ""}`}
          title={
            target
              ? target.startsWith("beat:")
                ? "Open what came to mind at this moment"
                : isDiaryGraphId(target)
                  ? "Show this entry in his Book, marked (reading its words there is a separate click, recorded in his biography)"
                  : "Open this memory in Detail"
              : // nothing to open: the whole text is at least on hover (the row clamps it)
                [line.title, line.detail].filter(Boolean).join("\n")
          }
          onClick={(e) => {
            if (fromLink(e)) return;
            props.onJump(index);
            if (target) props.onSelectSubject(target);
          }}
        >
          <TimeCell iso={line.observed_at} hint={rowHint(line.seq, null, line.turn_id, line.observed_at, renderItem.item.own)} />
          <div className="el_row_body">
            <div className="el_title">
              <WordsLine text={line.title} />
            </div>
            {line.detail ? (
              <div className="el_detail">
                <WordsLine text={line.detail} />
              </div>
            ) : null}
            {line.hint && line.subject_id ? (
              // G1's render half on the biography itself (plan c2596:
              // "the hint of writing must carry the direct link").
              // uic's chip — rule zero structural (click-to-open, no
              // resolve-on-display); the transport is the Detail tab,
              // whose inline verbatim already reads through the diary
              // door with cache + marker honesty (dm#28 surface).
              <AfMemoryHintChip
                label="reopen his words"
                entryId={line.hint.entry_id}
                kind={line.hint.kind}
                title={`Open this entry in the Detail tab (book key ${line.hint.entry_id})`}
                onOpen={() => props.onSelectSubject(line.subject_id)}
              />
            ) : null}
          </div>
        </div>
      );
  };

  return (
    <div className="entity_ledger">
      {props.loadingNote ? (
        <div className="el_loading_note" title="His life is still streaming in — this ledger is a partial view until the counter disappears.">
          <WordsLine text={`⏳ ${props.loadingNote} — partial view while his life streams in`} />
        </div>
      ) : null}
      <LedgerKey showQuiet={showQuiet} />
      {/* tabIndex −1: a click gives the list keyboard focus, so ArrowUp /
          PageUp / Home scroll it and count as the reader's own gesture. */}
      <div className="el_list" ref={listRef} tabIndex={-1}>
       <div className="el_list_inner" ref={innerRef}>
        {windowed.hiddenBefore > 0 ? (
          <div className="el_window_note">
            <WordsLine text={`${windowed.hiddenBefore} earlier lines — scrub the timeline to bring them into view`} />
          </div>
        ) : null}
        {windowed.rows.map((renderItem, rowIdx) => {
          const day = dayUtc(rowStamp(renderItem));
          const prevDay = rowIdx > 0 ? dayUtc(rowStamp(windowed.rows[rowIdx - 1])) : "";
          const row = renderRow(renderItem, rowIdx);
          const firstIndex = renderItem.kind === "line" ? renderItem.item.index : renderItem.items[0].index;
          return day && day !== prevDay ? (
            <React.Fragment key={`d-${day}-${firstIndex}`}>
              <div className="el_date">{dayLabelUtc(rowStamp(renderItem))}</div>
              {row}
            </React.Fragment>
          ) : (
            row
          );
        })}
        {windowed.hiddenAfter > 0 ? (
          <div className="el_window_note">
            <WordsLine text={`${windowed.hiddenAfter} later lines`} />
          </div>
        ) : null}
        {props.live && missedBelow > 0 ? (
          <button
            className="el_window_note el_quiet_note el_follow_pill"
            onClick={() => {
              const el = listRef.current;
              stickRef.current = true;
              setMissedBelow(0);
              if (el) el.scrollTop = el.scrollHeight;
            }}
          >
            ▾ {missedBelow} new line{missedBelow === 1 ? "" : "s"} below — click to follow live again
          </button>
        ) : null}
        {hiddenQuietTail > 0 ? (
          <button className="el_window_note el_quiet_note" onClick={props.onToggleQuiet}>
            {hiddenQuietTail} recall-audit event{hiddenQuietTail === 1 ? "" : "s"} after the last shown line — the memory is
            working, not silent. Click to show audit lines.
          </button>
        ) : null}
        {visible.length === 0 ? (
          lines.length > 0 ? (
            <button className="el_empty el_quiet_note" onClick={props.onToggleQuiet}>
              All {lines.length} events here are recall audit (considered/selected/co-used) — hidden by the audit-lines
              filter. Click to show them.
            </button>
          ) : (
            <div className="el_empty">
              <WordsLine text="No events yet." />
            </div>
          )
        ) : null}
       </div>
      </div>
    </div>
  );
}
