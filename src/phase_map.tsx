/**
 * THE STATE GRAPH, drawn and interactive (operator verdict c4995: "no way
 * to interact with the graph, so no way to edit it").
 *
 * Four phase nodes, the 22 transitions as fanned curves bundled per
 * (from,to) pair — hand-tuned geometry, never auto-layout (the multigraph
 * spaghetti lesson). Hover highlights an edge and shows its cause; click
 * SELECTS it — the editor rows below follow the selection (and vice
 * versa). Pan with drag, zoom with wheel or buttons, one reset. Edge
 * color carries the honesty tier (enforced / door fact / operator act /
 * his election); staged edits tint: removed = red dashed, redirected =
 * redrawn to the new target in accent, added = amber dashed.
 */
import React, { useMemo, useRef, useState } from "react";

import { honestyLabel, type RowState, type SpecTransition } from "./edge_ops";

const NODE: Record<string, { x: number; y: number }> = {
  visit: { x: 450, y: 80 },
  sleep: { x: 130, y: 300 },
  work: { x: 770, y: 300 },
  personal: { x: 450, y: 520 },
};
const R = 46;

const TIER_COLOR: Record<string, string> = {
  enforced: "#6ecf8e",
  fact: "#8a94a6",
  act: "#7a8fd8",
  election: "#c084dd",
  proposed: "#e7b45a",
};

interface MapRow {
  t: SpecTransition;
  state: RowState;
  rowKey: string;
}

function edgePath(from: string, to: string, fan: number): { d: string; mid: { x: number; y: number } } {
  const a = NODE[from];
  const b = NODE[to];
  if (!a || !b) return { d: "", mid: { x: 0, y: 0 } };
  if (from === to) {
    // self-loop: a small circle beside the node
    const cx = a.x + R + 26;
    const cy = a.y - R - 6 + fan * 26;
    return { d: `M ${a.x + R * 0.8} ${a.y - R * 0.6} A 24 24 0 1 1 ${a.x + R} ${a.y + 6}`, mid: { x: cx + 6, y: cy } };
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // P0 fold (UX pass): the perpendicular is computed in the CANONICAL
  // (undirected) frame — sorted node order — so a lane index means the
  // same physical offset for BOTH directions and no two edges of one
  // pair can ever coincide (opposite-direction same-parity fans used to
  // land on exactly the same path, leaving the underdrawn edge
  // unhoverable and unclickable).
  const canonical = from < to ? 1 : -1;
  const px = (-dy / len) * canonical;
  const py = (dx / len) * canonical;
  const off = fan * 30;
  const mx = (a.x + b.x) / 2 + px * off;
  const my = (a.y + b.y) / 2 + py * off;
  // trim ends to the node circle
  const t0 = R / len;
  const sx = a.x + dx * t0 + px * off * 0.35;
  const sy = a.y + dy * t0 + py * off * 0.35;
  const ex = b.x - dx * t0 + px * off * 0.35;
  const ey = b.y - dy * t0 + py * off * 0.35;
  return { d: `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`, mid: { x: (sx + 2 * mx + ex) / 4, y: (sy + 2 * my + ey) / 4 } };
}

export function PhaseMap({
  rows,
  selected,
  onSelect,
  onSelectPhase,
  hint = "drag to pan · ⌘/ctrl+wheel to zoom · click an edge to edit it below",
}: {
  rows: MapRow[];
  selected: string | null;
  onSelect(rowKey: string | null): void;
  onSelectPhase?(phase: string): void;
  hint?: string;
}): React.ReactElement {
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const edges = useMemo(() => {
    // Fan indices over the UNDIRECTED pair (P0 fold): both directions
    // share one lane ordering, so every edge gets a distinct offset.
    const byPair = new Map<string, Array<{ r: MapRow; from: string; to: string }>>();
    for (const r of rows) {
      const to = r.state.kind === "redirected" ? r.state.to : r.t.to;
      const from = r.t.from;
      const k = [from, to].sort().join("~");
      if (!byPair.has(k)) byPair.set(k, []);
      byPair.get(k)!.push({ r, from, to });
    }
    const out: Array<{ r: MapRow; d: string; mid: { x: number; y: number }; color: string; dash: string | undefined; effTo: string }> = [];
    for (const group of byPair.values()) {
      group.forEach(({ r, from, to }, i) => {
        const fan = group.length === 1 ? 0 : i - (group.length - 1) / 2;
        const { d, mid } = edgePath(from, to, fan);
        const tier = r.state.kind === "added" ? "proposed" : honestyLabel(r.t).tier;
        const color = r.state.kind === "removed" ? "#e07a6a" : r.state.kind === "redirected" ? "#6ea8fe" : (TIER_COLOR[tier] ?? "#8a94a6");
        const dash = r.state.kind === "removed" || r.state.kind === "added" ? "6 5" : undefined;
        out.push({ r, d, mid, color, dash, effTo: to });
      });
    }
    return out;
  }, [rows]);

  // P1 fold (UX pass): React wheel handlers can be passive — a plain
  // wheel over a hero that fills the fold would scroll AND zoom. Map
  // convention instead: plain wheel scrolls the page; ctrl/cmd+wheel
  // zooms, attached native + non-passive so preventDefault is real.
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((v) => ({ ...v, k: Math.min(3.5, Math.max(0.5, v.k * factor)) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const down = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const s = dragRef.current;
    setView((v) => ({ ...v, x: s.vx + (e.clientX - s.x), y: s.vy + (e.clientY - s.y) }));
  };
  const up = () => {
    dragRef.current = null;
  };

  return (
    <div className="pm_wrap">
      <div className="pm_controls">
        <button className="eix_refresh pe_btn" onClick={() => setView((v) => ({ ...v, k: Math.min(3.5, v.k * 1.2) }))} title="zoom in">＋</button>
        <button className="eix_refresh pe_btn" onClick={() => setView((v) => ({ ...v, k: Math.max(0.5, v.k / 1.2) }))} title="zoom out">－</button>
        <button className="eix_refresh pe_btn" onClick={() => setView({ x: 0, y: 0, k: 1 })} title="reset view">⤾ fit</button>
        <span className="pm_hint">{hint}</span>
      </div>
      <svg
        ref={svgRef}
        className="pm_svg"
        viewBox="0 0 900 600"
        role="img"
        aria-label="The entity's state graph: visit, work, personal, sleep, and every ruled transition between them"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      >
        <defs>
          {Object.entries(TIER_COLOR).map(([k, c]) => (
            <marker key={k} id={`pm_arr_${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
            </marker>
          ))}
          <marker id="pm_arr_sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#dbe2ee" />
          </marker>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {edges.map(({ r, d, mid, color, dash }) => {
            const id = r.rowKey;
            const isSel = selected === id;
            const isHover = hover === id;
            const lit = isSel || isHover;
            const tier = r.state.kind === "added" ? "proposed" : honestyLabel(r.t).tier;
            return (
              <g key={id} className="pm_edge" onPointerDown={(e) => e.stopPropagation()}>
                {/* fat invisible hit path so hover/click is forgiving */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ cursor: "pointer" }}
                  onPointerEnter={() => setHover(id)}
                  onPointerLeave={() => setHover((h) => (h === id ? null : h))}
                  onClick={() => onSelect(isSel ? null : id)}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={lit ? "#dbe2ee" : color}
                  strokeOpacity={lit ? 1 : 0.75}
                  strokeWidth={lit ? 2.6 : 1.6}
                  strokeDasharray={dash}
                  markerEnd={`url(#pm_arr_${lit ? "sel" : tier in TIER_COLOR ? tier : "fact"})`}
                  pointerEvents="none"
                />
                {lit ? (
                  <g pointerEvents="none">
                    {(() => {
                      const effTo = r.state.kind === "redirected" ? r.state.to : r.t.to;
                      const label = `${r.t.from} → ${effTo} · #${r.t.cause}`;
                      const w = label.length * 6.4 + 14;
                      return (
                        <>
                          <rect x={mid.x - w / 2} y={mid.y - 11} width={w} height={18} rx={4} fill="#10141c" fillOpacity={0.94} stroke={color} strokeOpacity={0.6} strokeWidth={0.6} />
                          <text x={mid.x} y={mid.y + 2.5} textAnchor="middle" fontSize={10.5} fill="#dbe2ee" fontFamily="ui-monospace, Menlo, monospace">
                            {label}
                          </text>
                        </>
                      );
                    })()}
                  </g>
                ) : null}
              </g>
            );
          })}
          {Object.entries(NODE).map(([name, p]) => (
            <g
              key={name}
              style={{ cursor: onSelectPhase ? "pointer" : "default" }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSelectPhase?.(name)}
            >
              <circle cx={p.x} cy={p.y} r={R} fill="#141a26" stroke="#4a5670" strokeWidth={1.4} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={15} fontWeight={600} fill="#dbe2ee">
                {name}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div className="pm_legend">
        <span style={{ color: TIER_COLOR.enforced }}>— machine law (editable here)</span>
        <span style={{ color: TIER_COLOR.fact }}>— door fact (read-only)</span>
        <span style={{ color: TIER_COLOR.act }}>— operator act (read-only)</span>
        <span style={{ color: TIER_COLOR.election }}>— his election (protected)</span>
        {rows.some((r) => r.state.kind === "removed") ? <span style={{ color: "#e07a6a" }}>┅ staged removal</span> : null}
        {rows.some((r) => r.state.kind === "redirected") ? <span style={{ color: "#6ea8fe" }}>— staged redirect</span> : null}
        {rows.some((r) => r.state.kind === "added") ? <span style={{ color: TIER_COLOR.proposed }}>┅ staged addition</span> : null}
      </div>
    </div>
  );
}
