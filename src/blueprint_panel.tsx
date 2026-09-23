/**
 * THE MEMORY BLUEPRINT (operator directive, laurent dm#118 via c3900:
 * "the global map MUST be part of the entity app... a memory blueprint
 * page showing the flow. it is the same for all").
 *
 * This page renders the COGNITION MACHINE — the pathway graph the room
 * assembled (plans/cognitive-memory-pathways.md v5) — as a fixed diagram:
 * stores, acts, and the verb-labeled highways between them. It is the
 * MACHINE, not his data: identical for every entity, static per build,
 * and consuming NOTHING from the stream (a pinned purity contract — a
 * blueprint that read live data would be a dashboard, not a blueprint).
 *
 * Render laws carried in (observer's seam notes, c3901):
 * - FIXED world-coordinate layout, hand-tuned once — never a force sim
 *   (spatial memory is an operator artifact; anchors are world constants).
 * - Edges carry their VERB visibly (the "3 associations" lesson: unlabeled
 *   arrows read as decoration, not a graph).
 * - ABSENCE renders honestly: spec-only/not-yet-built pathways are dashed
 *   and badged "not built" — the blueprint teaches what EXISTS vs what is
 *   planned (a blueprint vs an aspiration).
 * - The anti-edge (a dream never feeds its own proof) renders as the
 *   loop-breaker it is: dashed red with a cross-head.
 */

import React from "react";

import cognitionGraph from "../spec/cognition_graph.json";

/** Graph vintage — MUST equal the vendored map's header version
 * (spec/cognitive-memory-pathways.vendored.md); the handshake test pins
 * it, so a map bump without a panel review fails the suite instead of
 * drifting (the adversary's finding 10 — the diary_type-clamp class). */
export const BLUEPRINT_VERSION = "v7 · 2026-07-21";

/** The graph-as-data artifact's version (theme-3 build, c4109): the ONE
 * source the render derives from. To be served versioned+sha like the
 * phase graph (gateway lane, routed — bundled-only until then). */
export const COGNITION_GRAPH_VERSION: number = (cognitionGraph as { version: number }).version;

type NodeKind = "store" | "act" | "gate" | "sleep";

interface BpNode {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: NodeKind;
}

type EdgeKind = "live" | "missing" | "anti";

interface BpEdge {
  from: string;
  to: string;
  /** The ruled verb register (semantics: feeds/triggers/lands-in/offers/
   * solicits/names) + the plain-words qualifier. */
  label: string;
  kind: EdgeKind;
  /** Optional label position nudge along the edge (0..1, default 0.5). */
  t?: number;
  /** Route via an elbow point instead of a straight line. */
  via?: { x: number; y: number };
}

/** DERIVED FROM THE ARTIFACT (graph-as-data, c4109): the arrays below
 * are views over spec/cognition_graph.json — the ONE source. No hand-tuned
 * row survives beside the data (the two-copies class); layout coords ride
 * the artifact as world constants (spatial memory is an operator
 * artifact). Edge status maps to the render kinds: wired=live,
 * declared=missing(dashed), anti=the loop-breaker. */
interface GraphNodeRow {
  id: string;
  label: string;
  sub?: string;
  kind: NodeKind;
  owner: string;
  lane: string;
  layout: { x: number; y: number; w: number; h: number };
}
interface GraphEdgeRow {
  id: string;
  from: string;
  to: string;
  label: string;
  label_class?: string;
  status: "wired" | "declared" | "anti";
  owner: string;
  protection?: string;
  toggle?: string;
  off_behavior?: string;
  receipts?: string[];
  layout_t?: number;
  layout_via?: { x: number; y: number };
}

const GRAPH = cognitionGraph as unknown as { version: number; nodes: GraphNodeRow[]; edges: GraphEdgeRow[] };

// LOAD-TIME VALIDATION (wave adversary P2: through the double cast a
// typo'd status rendered as a LIVE edge with the live arrow — the most
// dangerous default possible; a typo'd kind rendered SVG-black). Unknown
// words warn loudly once and DEGRADE SAFE: unknown status renders as
// declared (dashed — never paints a live highway that may not exist),
// unknown kind falls to "act". Matters more the day served/proposed rows
// arrive; cheap now.
const KNOWN_STATUS = new Set(["wired", "declared", "anti"]);
const KNOWN_KIND = new Set(["store", "act", "gate", "sleep"]);
for (const n of GRAPH.nodes) {
  if (!KNOWN_KIND.has(n.kind)) {
    console.warn(`#FALLBACK cognition_graph: node ${n.id} has unknown kind "${n.kind}" — rendered as act`);
    n.kind = "act" as NodeKind;
  }
}
for (const e of GRAPH.edges) {
  if (!KNOWN_STATUS.has(e.status)) {
    console.warn(`#FALLBACK cognition_graph: edge ${e.id} has unknown status "${e.status}" — rendered as declared (never live)`);
    e.status = "declared";
  }
}

export const BLUEPRINT_NODES: BpNode[] = GRAPH.nodes.map((n) => ({
  id: n.id,
  label: n.label,
  sub: n.sub || undefined,
  x: n.layout.x,
  y: n.layout.y,
  w: n.layout.w,
  h: n.layout.h,
  kind: n.kind,
}));

const STATUS_TO_KIND: Record<GraphEdgeRow["status"], EdgeKind> = { wired: "live", declared: "missing", anti: "anti" };

export const BLUEPRINT_EDGES: BpEdge[] = GRAPH.edges.map((e) => ({
  from: e.from,
  to: e.to,
  label: e.label,
  kind: STATUS_TO_KIND[e.status],
  t: e.layout_t,
  via: e.layout_via,
}));

const KIND_FILL: Record<NodeKind, string> = {
  store: "rgba(110, 168, 216, 0.13)",
  act: "rgba(123, 201, 140, 0.12)",
  gate: "rgba(231, 180, 90, 0.16)",
  sleep: "rgba(143, 124, 232, 0.14)",
};
const KIND_STROKE: Record<NodeKind, string> = {
  store: "#6ea8d8",
  act: "#7bc98c",
  gate: "#e7b45a",
  sleep: "#8f7ce8",
};

function center(n: BpNode): { x: number; y: number } {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

/** Intersect the line from the node's center toward (tx,ty) with the
 * node's rectangle border, so arrows land on edges, never mid-box. */
function borderPoint(n: BpNode, tx: number, ty: number): { x: number; y: number } {
  const c = center(n);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx !== 0 ? n.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? n.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

function edgePath(from: BpNode, to: BpNode, via?: { x: number; y: number }): { d: string; mid: (t: number) => { x: number; y: number } } {
  if (from.id === to.id) {
    // Self-loop (the next-cue highway): a small arc off the node's right
    // edge — the tick handing a note to its own next moment.
    const x = from.x + from.w;
    const y = from.y + from.h / 2;
    const r = 26;
    const d = `M ${x} ${y - 12} C ${x + r + 14} ${y - 26}, ${x + r + 14} ${y + 26}, ${x} ${y + 12}`;
    return { d, mid: () => ({ x: x + r + 8, y }) };
  }
  if (via) {
    const p0 = borderPoint(from, via.x, via.y);
    const p2 = borderPoint(to, via.x, via.y);
    const d = `M ${p0.x} ${p0.y} Q ${via.x} ${via.y} ${p2.x} ${p2.y}`;
    const mid = (t: number) => {
      const mt = 1 - t;
      return {
        x: mt * mt * p0.x + 2 * mt * t * via.x + t * t * p2.x,
        y: mt * mt * p0.y + 2 * mt * t * via.y + t * t * p2.y,
      };
    };
    return { d, mid };
  }
  const cTo = center(to);
  const cFrom = center(from);
  const p0 = borderPoint(from, cTo.x, cTo.y);
  const p1 = borderPoint(to, cFrom.x, cFrom.y);
  const d = `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;
  const mid = (t: number) => ({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t });
  return { d, mid };
}

export function BlueprintPanel(): React.ReactElement {
  const byId = new Map(BLUEPRINT_NODES.map((n) => [n.id, n]));
  return (
    <div className="bp_panel">
      <div className="bp_head">
        <span className="bp_title">🧭 Memory blueprint</span>
        <span
          className="bp_vintage"
          title="This page renders the cognition MACHINE — the pathway graph the room assembled (plans/cognitive-memory-pathways.md). It is identical for every entity and reads nothing from this entity's stream: the machine, not his data. Solid arrows are LIVE highways; dashed gray ones are named gaps (not built); the dashed red cross is the anti-edge (derived artifacts never feed the passes that derive them)."
        >
          the machine, same for all · map {BLUEPRINT_VERSION} · data v{COGNITION_GRAPH_VERSION}
        </span>
      </div>
      <div className="bp_legend">
        <span className="bp_lg" style={{ borderColor: KIND_STROKE.store }}>stores</span>
        <span className="bp_lg" style={{ borderColor: KIND_STROKE.act }}>acts</span>
        <span className="bp_lg" style={{ borderColor: KIND_STROKE.gate }}>the gate</span>
        <span className="bp_lg" style={{ borderColor: KIND_STROKE.sleep }}>the night</span>
        <span className="bp_lg bp_lg_missing">not built</span>
        <span className="bp_lg bp_lg_anti">anti-edge</span>
      </div>
      <p className="bp_editable_note">
        THE graph (operator correction c5070): the memory-cognition machine — passive and active construction and what it
        creates. Structural editing lands HERE next (the widened artifact: identity-update lane, lesson miner, world-model
        nodes — build in flight); today the dials below are law, and the phase-transition editor lives in its section underneath.
      </p>
      <div className="bp_scroll">
        <svg viewBox="0 0 1060 1080" className="bp_svg" role="img" aria-label="The cognition machine: stores, acts and the labeled pathways between them">
          <defs>
            <marker id="bp_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a94a6" />
            </marker>
            <marker id="bp_arrow_missing" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#5d6a7a" />
            </marker>
            <marker id="bp_cross" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 1 1 L 9 9 M 9 1 L 1 9" stroke="#d87a7a" strokeWidth="1.8" fill="none" />
            </marker>
          </defs>
          {BLUEPRINT_EDGES.map((e, i) => {
            const from = byId.get(e.from);
            const to = byId.get(e.to);
            if (!from || !to) return null;
            const { d, mid } = edgePath(from, to, e.via);
            const lp = mid(e.t ?? 0.5);
            const cls = e.kind === "anti" ? "bp_edge_anti" : e.kind === "missing" ? "bp_edge_missing" : "bp_edge";
            const marker = e.kind === "anti" ? "url(#bp_cross)" : e.kind === "missing" ? "url(#bp_arrow_missing)" : "url(#bp_arrow)";
            return (
              <g key={i}>
                <path d={d} className={cls} markerEnd={marker} fill="none" />
                {/* Verb labels ride every edge (observer lesson 2: an
                  * unlabeled arrow is decoration). Halo keeps them
                  * readable over crossings without a filled box. */}
                <text x={lp.x} y={lp.y - 3} className={`bp_elabel ${e.kind === "anti" ? "bp_elabel_anti" : ""} ${e.kind === "missing" ? "bp_elabel_missing" : ""}`} textAnchor="middle">
                  {e.label}
                </text>
              </g>
            );
          })}
          {BLUEPRINT_NODES.map((n) => (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={9} fill={KIND_FILL[n.kind]} stroke={KIND_STROKE[n.kind]} strokeWidth={1.3} />
              <text x={n.x + n.w / 2} y={n.y + 20} textAnchor="middle" className="bp_nlabel">
                {n.label}
              </text>
              {n.sub ? (
                <foreignObject x={n.x + 6} y={n.y + 26} width={n.w - 12} height={n.h - 28}>
                  <div className="bp_nsub">{n.sub}</div>
                </foreignObject>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
      <p className="bp_footnote">
        The laws the arrows obey: presence ≠ use (identity and continuity seats deposit NOTHING — and the v6 footnote had the
        rest backwards; the law in the engine-owner&apos;s confirmed words, memory c-t-i #383: every read surface is PURE — his
        deliberate reach via search, read, probe deposits nothing, pure reads; strengthening has exactly ONE path, commit,
        and what the stimulus surfaces strengthens AUTOMATICALLY at commit on the handles DISPLAYED into the prompt — what
        strengthens is what the mind actually held in front of it, not what was searched, not what was reachable, not what
        a tool touched); feelings are ELECTED, never automatic (a named v1
        boundary); offer, never inject (cues and elections are ignorable at zero cost); structure decides, feelings color
        (valence tints, never selects); grouping presents, never merges; the night proposes, waking evidence disposes. Dashed
        gray = a named gap, honestly absent (two more gaps have no anchor here: G7 alias fold, G8 entity↔entity; and the prompt
        overlay remains the FORCE DOOR the room watches). Painted numerals that shadow dials are stripped — served values
        arrive with the params lane. Full map with receipts: <code>plans/cognitive-memory-pathways.md</code> (commons).
      </p>
    </div>
  );
}
