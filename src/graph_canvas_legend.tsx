/**
 * THE GRAPH'S LEGEND (operator 2026-11-10, Entity backlog 0004: "at most 2
 * lines at the bottom, never more; interactive — click a legend item, show
 * where those nodes/edges are").
 *
 * - Two rows, never more: what the memories are (identity, memory, diary,
 *   feeling, scar, bond, then the kinds this life holds) and what the lines
 *   and colours mean (the usage scale, how old the last selection is, the
 *   born-linked relation types). Each row is one line that scrolls sideways
 *   when it holds more than the canvas is wide; a phone-width canvas keeps
 *   its one scrollable row.
 * - Every memory item and every relation type is a pressed toggle: a click
 *   lights where those memories (or the two ends of those links) are, the
 *   rest dims (the graph's one emphasis rule, intersected with a lens, a
 *   search or a topic) and the camera frames them; a second click, or
 *   Escape, lets go. The usage scale and the selection age are keys, not
 *   filters.
 *
 * The ids a pick lights are computed once per fold (legendIds), never per
 * frame.
 */
import React, { useEffect } from "react";

import { KIND_COLORS, nodeClass, type RelationGlyph, relationGlyph } from "./graph_canvas";
import { USAGE_HIGH, USAGE_LOW, USAGE_TITLE } from "./graph_usage";
import type { FoldState } from "./stream_fold";

/** The memory classes the legend names first (the canvas's colours). */
export type LegendClass = "identity" | "memory" | "diary" | "standing" | "scar" | "bond";
export type LegendPick = { kind: "class"; key: LegendClass } | { kind: "kind"; key: string } | { kind: "relation"; key: string };

export const pickKey = (p: LegendPick): string => `${p.kind}:${p.key}`;
const samePick = (a: LegendPick | null, b: LegendPick): boolean => a !== null && pickKey(a) === pickKey(b);
/** A click on `p`: picks it, or lets it go when it is the pick. */
export const nextPick = (picked: LegendPick | null, p: LegendPick): LegendPick | null => (samePick(picked, p) ? null : p);

const CLASS_ITEMS: Array<{ key: LegendClass; word: string; plural: string }> = [
  { key: "identity", word: "identity", plural: "his identity records" },
  { key: "memory", word: "memory", plural: "his memories" },
  { key: "diary", word: "diary", plural: "his diary entries" },
  { key: "standing", word: "feeling", plural: "his feelings" },
  { key: "scar", word: "scar", plural: "his scars" },
  { key: "bond", word: "bond", plural: "his bonds" },
];

/** The canvas ids a pick lights: memories of that class or kind (a feeling,
 * a scar or a bond: the diamond of a free target, or the record it is
 * about), or the two ends of every born-linked edge of that relation. */
export function legendIds(fold: FoldState, pick: LegendPick): Set<string> {
  const out = new Set<string>();
  if (pick.kind === "relation") {
    for (const se of fold.structural_edges.values()) {
      if (se.relation !== pick.key) continue;
      const a = fold.graph_to_row.get(se.source_graph_id) ?? se.source_graph_id;
      const b = fold.graph_to_row.get(se.target_graph_id) ?? se.target_graph_id;
      if (fold.nodes.has(a)) out.add(a);
      if (fold.nodes.has(b)) out.add(b);
    }
    return out;
  }
  if (pick.kind === "class" && (pick.key === "standing" || pick.key === "scar" || pick.key === "bond")) {
    for (const s of fold.standings.values()) {
      if (pick.key === "scar" && s.scars.length === 0) continue;
      if (pick.key === "bond" && s.bonds.length === 0) continue;
      const row = fold.graph_to_row.get(s.target_id) ?? s.target_id;
      out.add(fold.nodes.has(row) ? row : `standing:${s.target_id}`);
    }
    return out;
  }
  for (const node of fold.nodes.values()) {
    if (pick.kind === "kind") {
      if (!node.bookkeeping && node.kind === pick.key) out.add(node.id);
      continue;
    }
    const cls = nodeClass(node);
    if (pick.key === "identity" ? cls === "identity" : pick.key === "diary" ? cls === "diary" : cls === "memory" || cls === "episode") out.add(node.id);
  }
  return out;
}

/** Legend swatch for a typed edge: short line + the SAME glyph the canvas
 * draws at the target end (one mapping, two renderers — the legend can
 * never diverge from the graph). SVG paths mirror traceRelationGlyph. */
export function RelationGlyphSwatch({ glyph }: { glyph: RelationGlyph }): React.ReactElement {
  return (
    <svg width="30" height="12" aria-hidden="true">
      <line x1="0" y1="6" x2="20" y2="6" stroke="var(--text-dim)" strokeWidth="1" opacity="0.55" />
      <g transform="translate(27,6)" stroke="var(--text-dim)" strokeWidth="1.2" fill="none">
        {glyph === "arrow" ? <path d="M-4.5,-3.5 L0,0 L-4.5,3.5" /> : null}
        {glyph === "chevron2" ? <path d="M-7.5,-3.2 L-3.5,0 L-7.5,3.2 M-4,-3.2 L0,0 L-4,3.2" /> : null}
        {glyph === "circle" ? <circle cx="-2" cy="0" r="3" /> : null}
        {glyph === "diamond" ? <path d="M-6.5,0 L-3,-3.2 L0.5,0 L-3,3.2 Z" /> : null}
        {glyph === "square" ? <rect x="-5.6" y="-2.8" width="5.6" height="5.6" /> : null}
        {glyph === "bar" ? <path d="M-1.5,-4 L-1.5,4" /> : null}
      </g>
    </svg>
  );
}

export const kindWord = (k: string): string => (k === "world_model" ? "world" : k);

export interface GraphLegendProps {
  /** Kinds this life holds beyond the core six (lesson, world, dream…). */
  extraKinds: string[];
  /** Born-linked relation types present, most common first. */
  relationTypes: string[];
  /** How long ago he last selected a memory, when it is not "now". */
  warmthAge: string | null;
  picked: LegendPick | null;
  onPick(pick: LegendPick | null): void;
}

export function GraphLegend({ extraKinds, relationTypes, warmthAge, picked, onPick }: GraphLegendProps): React.ReactElement {
  // Escape lets a pick go (one Escape = one layer: a consumed key is left alone).
  useEffect(() => {
    if (!picked) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || ev.defaultPrevented) return;
      ev.preventDefault();
      onPick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, onPick]);
  const toggle = (p: LegendPick) => onPick(nextPick(picked, p));
  const item = (p: LegendPick, className: string, plural: string, content: React.ReactNode) => {
    const on = samePick(picked, p);
    return (
      <button
        key={pickKey(p)}
        type="button"
        className={`gc_lg_item ${className}`}
        aria-pressed={on}
        title={on ? `Showing where ${plural} are — click again (or Escape) to let go` : `Show where ${plural} are on the graph`}
        onClick={() => toggle(p)}
      >
        {content}
      </button>
    );
  };
  return (
    <div className="entity_legend gc_legend2" role="group" aria-label="Legend — click an item to show where it is on the graph">
      <div className="gc_lg_row gc_lg_row_kinds">
        {CLASS_ITEMS.map((c) => item({ kind: "class", key: c.key }, `lg lg_${c.key}`, c.plural, c.word))}
        {/* Kinds present in THIS life beyond the core six — lessons, world
          * cards, dreams… named so the colours are readable (operator
          * 2026-07-15: lesson/world_model were unnamed). */}
        {extraKinds.map((k) =>
          item({ kind: "kind", key: k }, "lg_kind", `his ${kindWord(k)} records`, (
            <>
              <i className="lg_kdot" style={{ background: KIND_COLORS[k] ?? KIND_COLORS.unknown }} aria-hidden="true" />
              {kindWord(k)}
            </>
          )),
        )}
      </div>
      <div className="gc_lg_row gc_lg_row_lines">
        {/* THE USAGE SCALE (operator 2026-11-09): one grey-to-green key for
          * memories and lines, ranked within this life (graph_usage.ts). */}
        <span className="lg_edge" title={USAGE_TITLE}>
          <i className="gc_rl_scale" aria-hidden="true" />
          {USAGE_LOW} → {USAGE_HIGH}
        </span>
        {warmthAge ? (
          <span className="lg_edge lg_stale" title="How long ago he last used a memory. The colours rank his use within his life; they do not fade while nothing runs.">
            🥶 last selection {warmthAge} ago
          </span>
        ) : null}
        {relationTypes.map((relation) =>
          item({ kind: "relation", key: relation }, "lg_edge", `the “${relation}” links`, (
            <>
              <RelationGlyphSwatch glyph={relationGlyph(relation)} />
              {relation}
            </>
          )),
        )}
      </div>
    </div>
  );
}
