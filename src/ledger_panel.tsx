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

/** The live follow after a scroll event. At the bottom it follows; only a
 * scroll that moved UP (the reader) detaches it. Lines landing grow the
 * list without moving it and our own jump to the bottom only moves down,
 * so judging by the distance alone detached a follow nobody had left. */
export function followAfterScroll(following: boolean, m: { gap: number; top: number; lastTop: number }): boolean {
  if (m.gap <= FOLLOW_SLACK_PX) return true;
  if (m.top < m.lastTop) return false;
  return following;
}

interface FollowRefs {
  stick: { current: boolean };
  lastTop: { current: number };
}

type ScrollList = Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight" | "addEventListener" | "removeEventListener">;

function jumpToBottom(el: ScrollList, lastTop: FollowRefs["lastTop"]): void {
  el.scrollTop = el.scrollHeight;
  lastTop.current = el.scrollTop;
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
): () => void {
  const onScroll = () => {
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    refs.stick.current = followAfterScroll(refs.stick.current, { gap, top: el.scrollTop, lastTop: refs.lastTop.current });
    if (refs.stick.current && gap <= FOLLOW_SLACK_PX) onAtBottom();
    refs.lastTop.current = el.scrollTop;
  };
  const revealed = new Observer(() => {
    if (refs.stick.current && el.clientHeight > 0) jumpToBottom(el, refs.lastTop);
  });
  refs.stick.current = true;
  jumpToBottom(el, refs.lastTop);
  revealed.observe(el as unknown as Element);
  el.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    revealed.disconnect();
    el.removeEventListener("scroll", onScroll);
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
  const seenRef = useRef({ rows: renderItems.length, showQuiet });
  const [missedBelow, setMissedBelow] = useState(0);
  useEffect(() => {
    const el = listRef.current;
    if (!el || !props.live) return;
    return attachLiveFollow(el, { stick: stickRef, lastTop: lastTopRef }, () => setMissedBelow(0));
  }, [props.live]);
  useEffect(() => {
    // Runs on every visible LINE (a weave grows in place, its row count
    // does not move); the pill counts ROWS, what the reader will see. A
    // filter toggle is not a landing: it only resyncs the count.
    const seen = seenRef.current;
    const landed = seen.showQuiet === showQuiet ? renderItems.length - seen.rows : 0;
    seenRef.current = { rows: renderItems.length, showQuiet };
    if (!props.live) return;
    const el = listRef.current;
    if (!el) return;
    if (stickRef.current) {
      jumpToBottom(el, lastTopRef);
      setMissedBelow(0);
    } else if (landed > 0) {
      setMissedBelow((n) => n + landed);
    }
  }, [visible.length, renderItems.length, showQuiet, props.live]);

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
              className={`el_row el_tone_${weaveTone} el_weave ${reached ? "" : "el_row_future"}`}
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
          key={`${line.seq}-${rowIdx}`}
          className={`el_row el_tone_${line.tone} ${reached ? "" : "el_row_future"} ${isCurrent ? "el_row_current" : ""} ${target ? "el_row_open" : ""}`}
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
      <div className="el_list" ref={listRef}>
        {windowed.hiddenBefore > 0 ? (
          <div className="el_window_note">
            <WordsLine text={`${windowed.hiddenBefore} earlier lines — scrub the timeline to bring them into view`} />
          </div>
        ) : null}
        {windowed.rows.map((renderItem, rowIdx) => {
          const day = dayUtc(rowStamp(renderItem));
          const prevDay = rowIdx > 0 ? dayUtc(rowStamp(windowed.rows[rowIdx - 1])) : "";
          const row = renderRow(renderItem, rowIdx);
          return day && day !== prevDay ? (
            <React.Fragment key={`d-${day}-${rowIdx}`}>
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
  );
}
