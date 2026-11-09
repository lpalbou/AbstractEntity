/**
 * THE CONTEXT LEGEND (operator live test 2026-11-09: "when i click on
 * context, it shows [rings: 6 present by right, 11 continuity, 14 matched]
 * but i am unsure how to interpret it?"). Where the recall line already
 * lived, over the graph: the summary counts the rings; unfolded it says,
 * in his words, what each ring colour means, what the lit lines are, and
 * the grey-to-green fill. Compact: open on a wide screen, folded on a phone.
 */
import React from "react";

import { USAGE_HIGH, USAGE_LOW, USAGE_TITLE } from "./graph_usage";
import { recallLegendParts, recallLegendRows, TRAVELLED_LEGEND, TRAVELLED_TITLE, type RecallEmphasis } from "./recall_emphasis";

export function ContextLegend({ recall, open, onToggle }: { recall: RecallEmphasis; open: boolean; onToggle(open: boolean): void }): React.ReactElement {
  const { head, parts } = recallLegendParts(recall);
  return (
    <details className="gc_recall_legend" open={open} onToggle={(ev) => onToggle((ev.currentTarget as HTMLDetailsElement).open)}>
      <summary className="gc_rl_summary" role="status" aria-live="polite">
        <span className="gc_rl_head">{head}</span>
        {parts.length ? <span className="gc_rl_colon">:</span> : null}
        {parts.map((part, i) => (
          <span key={part.cls} className="gc_rl_part">
            <i className={`gc_rl_ring gc_rl_${part.cls}`} aria-hidden="true" />
            {part.text}
            {i < parts.length - 1 ? <span className="gc_rl_sep" aria-hidden="true">·</span> : null}
          </span>
        ))}
      </summary>
      <div className="gc_rl_key">
        {recallLegendRows(recall).map((row) => (
          <div key={row.cls} className="gc_rl_row">
            <i className={`gc_rl_ring gc_rl_${row.cls}`} aria-hidden="true" />
            <span className="gc_rl_name">{row.name}:</span>
            <span className="gc_rl_meaning">{row.meaning}</span>
          </div>
        ))}
        <div className="gc_rl_row" title={TRAVELLED_TITLE}>
          <i className="gc_rl_line" aria-hidden="true" />
          <span className="gc_rl_meaning">{TRAVELLED_LEGEND}</span>
        </div>
        <div className="gc_rl_row" title={USAGE_TITLE}>
          <i className="gc_rl_scale" aria-hidden="true" />
          <span className="gc_rl_meaning">
            fill: dark grey = {USAGE_LOW} · green = {USAGE_HIGH}
          </span>
        </div>
      </div>
    </details>
  );
}
