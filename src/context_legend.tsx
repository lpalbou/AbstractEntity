/**
 * THE CONTEXT LEGEND (operator live test 2026-11-09: "when i click on
 * context, it shows [rings: 6 present by right, 11 continuity, 14 matched]
 * but i am unsure how to interpret it?"). Where the recall line already
 * lived, over the graph: the summary counts the rings; unfolded it says,
 * in his words, what each ring colour means, what the lit lines are (and
 * which way they read: from what he held in mind to what he recalled), and
 * the grey-to-green fill. Compact: open on a wide screen, folded on a phone.
 *
 * Its fold control is a real disclosure (review S3, 2026-11-09): a button
 * with aria-expanded controlling the key. The count is announced once,
 * after a scrub settles (a quiet live region), never at every step and
 * never by the control itself. Every row says what it means in words a
 * finger and a keyboard reach (review N4): no meaning lives only in a
 * tooltip.
 */
import React, { useEffect, useId, useState } from "react";

import { USAGE_HIGH, USAGE_LOW, USAGE_RANK, USAGE_TITLE } from "./graph_usage";
import { recallLegendParts, recallLegendRows, recallLegendText, TRAVELLED_DIRECTION, TRAVELLED_LEGEND, TRAVELLED_TITLE, type RecallEmphasis } from "./recall_emphasis";

/** How long the count rests before the live region says it (a scrub
 * through ten recalls is announced once, at the one it stops on). */
export const LEGEND_ANNOUNCE_MS = 900;

/** `text`, once it has stayed the same for `ms` (the live region's words). */
export function useSettledText(text: string, ms: number = LEGEND_ANNOUNCE_MS): string {
  const [said, setSaid] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSaid(text), ms);
    return () => window.clearTimeout(timer);
  }, [text, ms]);
  return said;
}

export function ContextLegend({ recall, open, onToggle }: { recall: RecallEmphasis; open: boolean; onToggle(open: boolean): void }): React.ReactElement {
  const { head, parts } = recallLegendParts(recall);
  const keyId = useId();
  const announced = useSettledText(recallLegendText(recall));
  return (
    <div className={`gc_recall_legend${open ? " gc_rl_open" : ""}`}>
      <button type="button" className="gc_rl_summary" aria-expanded={open} aria-controls={keyId} onClick={() => onToggle(!open)}>
        <span className="gc_rl_head">{head}</span>
        {parts.length ? <span className="gc_rl_colon">:</span> : null}
        {parts.map((part, i) => (
          <span key={part.cls} className="gc_rl_part">
            <i className={`gc_rl_ring gc_rl_${part.cls}`} aria-hidden="true" />
            {part.text}
            {i < parts.length - 1 ? <span className="gc_rl_sep" aria-hidden="true">·</span> : null}
          </span>
        ))}
      </button>
      <span className="gc_rl_live" role="status" aria-live="polite">
        {announced}
      </span>
      <div className="gc_rl_key" id={keyId} hidden={!open}>
        {recallLegendRows(recall).map((row) => (
          <div key={row.cls} className="gc_rl_row">
            <i className={`gc_rl_ring gc_rl_${row.cls}`} aria-hidden="true" />
            <span className="gc_rl_name">{row.name}:</span>
            <span className="gc_rl_meaning">{row.meaning}</span>
          </div>
        ))}
        <div className="gc_rl_row" title={TRAVELLED_TITLE}>
          <i className="gc_rl_line" aria-hidden="true" />
          <span className="gc_rl_meaning">
            {TRAVELLED_LEGEND}
            <span className="gc_rl_more">{TRAVELLED_DIRECTION}</span>
          </span>
        </div>
        <div className="gc_rl_row" title={USAGE_TITLE}>
          <i className="gc_rl_scale" aria-hidden="true" />
          <span className="gc_rl_meaning">
            fill: dark grey = {USAGE_LOW} · green = {USAGE_HIGH}
            <span className="gc_rl_more">{USAGE_RANK}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
