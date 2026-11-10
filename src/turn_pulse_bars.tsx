/**
 * The live activity panel (operator 2026-11-10, root backlog 1196 / app backlog 0010): what he is
 * doing, row by row, while a turn runs — what came to mind, each step of his loop, each tool with
 * what it asked for, the memories he went looking for, what he formed or wrote — then, once the
 * turn is over, folded into one line (open it to see the rows again). Pixels only; the rows come
 * from live_activity.ts (pure, tested) through use_live_activity.ts.
 *
 * Replaces the 2026-08-01 pulse bars (turns pips / recall shelf / recall tokens): quantities without
 * what he was doing. Clickable where something can be opened: a formed memory opens in Detail, the
 * memories that came to mind list out (each opens in Detail), a tool row shows what it returned.
 * No own aria-live: the drawer's thinking block is already a polite region.
 */

import React, { useCallback, useState } from "react";

import { formatSeconds, turnSummary, type ActivityRow, type TurnActivity } from "./live_activity";
import { ToolCall } from "./turn_probe_views";
import { WordsLine } from "./words_line";
import "./live_activity.css";

/** Rows shown while a turn runs before the earlier ones fold ("N earlier"). */
export const LIVE_ROWS = 5;

export interface TurnActivityPanelProps {
  activity: TurnActivity;
  /** The turn is running (rows live) or over (one folded line). */
  live: boolean;
  /** Open a record in Detail by graph id; false = it is not in the view yet. */
  onOpenRecord(graphId: string): boolean;
}

function RowLine({ row, onOpenRecord }: { row: ActivityRow; onOpenRecord(graphId: string): boolean }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const target = row.open;
  const body = (
    <>
      <span className="la_mark" aria-hidden="true" />
      {/* Plain text: the row is a button, and a link inside it (a fetched URL) would be a second
        * control in one (review 2b-4); the opened detail keeps its links. */}
      <span className="la_text">{row.text}</span>
      {row.detail || row.seconds !== null ? (
        <span className="la_meta">
          {row.detail ? <span className="la_detail">{row.detail}</span> : null}
          {row.seconds !== null ? <span className="la_time">{formatSeconds(row.seconds)}</span> : null}
        </span>
      ) : null}
    </>
  );
  const onClick = useCallback(() => {
    if (!target) return;
    if (target.type === "record") onOpenRecord(target.graphId);
    else setOpen((v) => !v);
  }, [target, onOpenRecord]);
  return (
    <li className="la_row" data-kind={row.kind} data-state={row.state}>
      {target ? (
        <button
          type="button"
          className="la_line la_line_open"
          onClick={onClick}
          aria-expanded={target.type === "record" ? undefined : open}
          title={target.type === "record" ? "Open in Detail" : target.type === "tool" ? "What it asked and what it returned" : "The memories that came to mind"}
        >
          {body}
        </button>
      ) : (
        <div className="la_line">{body}</div>
      )}
      {open && target?.type === "tool" ? (
        <div className="la_more">
          <ToolCall t={target.tool} />
        </div>
      ) : null}
      {open && target?.type === "records" ? (
        <ul className="la_more la_records">
          {target.items.map((m, i) => (
            <li key={`${m.graphId ?? "x"}:${i}`}>
              {m.graphId ? (
                <button type="button" className="la_record" onClick={() => onOpenRecord(m.graphId!)} title="Open in Detail">
                  {m.title}
                </button>
              ) : (
                <span className="la_record">
                  <WordsLine text={m.title} inline />
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Rows({ rows, onOpenRecord }: { rows: ActivityRow[]; onOpenRecord(graphId: string): boolean }): React.ReactElement {
  return (
    <ol className="la_rows">
      {rows.map((r) => (
        <RowLine key={r.key} row={r} onOpenRecord={onOpenRecord} />
      ))}
    </ol>
  );
}

export const TurnActivityPanel = React.memo(function TurnActivityPanel({ activity, live, onOpenRecord }: TurnActivityPanelProps): React.ReactElement {
  const [showAll, setShowAll] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  if (live) {
    const hidden = showAll ? 0 : Math.max(0, activity.rows.length - LIVE_ROWS);
    const rows = hidden ? activity.rows.slice(hidden) : activity.rows;
    // What he is doing now = the running rows (bold, pulsing). The head line speaks only while no
    // row says it: before the turn's first act, and between two acts.
    const idleNow = !activity.rows.some((r) => r.state === "running");
    return (
      <section className="la_panel" data-live="true" aria-label="What he is doing">
        {idleNow ? (
          <div className="la_head">
            <span className="la_pulse" aria-hidden="true" />
            <span className="la_now">{activity.rows.length ? "Working…" : "Starting…"}</span>
          </div>
        ) : null}
        {hidden ? (
          <button type="button" className="la_earlier" onClick={() => setShowAll(true)}>
            {hidden} earlier
          </button>
        ) : null}
        {rows.length ? <Rows rows={rows} onOpenRecord={onOpenRecord} /> : null}
      </section>
    );
  }
  return (
    <section className="la_panel" data-live="false" aria-label="What he did this turn">
      <button type="button" className="la_summary" aria-expanded={unfolded} onClick={() => setUnfolded((v) => !v)} title={unfolded ? "Fold" : "What he did, step by step"}>
        <span className="la_chev" aria-hidden="true">
          {unfolded ? "▾" : "▸"}
        </span>
        <span className="la_summary_text">Last turn: {turnSummary(activity)}</span>
      </button>
      {unfolded && activity.rows.length ? <Rows rows={activity.rows} onOpenRecord={onOpenRecord} /> : null}
    </section>
  );
});
