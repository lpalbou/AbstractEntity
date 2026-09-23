/**
 * Topic map — the community view of a life (operator ask 2026-07-17:
 * "regroup memories on a same topic and provide a much nicer
 * visualization"; KEPT beside the raw graph, never replacing it).
 *
 * Communities are computed DURABLY at the runtime level
 * (abstractruntime.identity.communities — deterministic Louvain over the
 * store's engraved relations + weak keyword bridges) and served by the
 * gateway (GET /entities/{name}/communities). This component only
 * RENDERS: deterministic spiral circle-packing (no RNG, no force sim —
 * the same life always draws the same map; spatial memory is an operator
 * artifact), always-visible topic labels (the legibility the raw graph
 * cannot give), faint inter-topic ties, click → filter the raw graph to
 * that community's members (the existing emphasis/dim mechanism).
 */

import React, { useEffect, useMemo, useState } from "react";

import type { FoldState } from "./stream_fold";
import { gatewayReadHeaders } from "./stream_source";

export interface TopicCommunity {
  id: number;
  label: string;
  keywords: string[];
  exemplar_id: string;
  exemplar_title: string;
  size: number;
  kinds: Record<string, number>;
  member_ids: string[];
}

export interface TopicsPayload {
  algorithm: string;
  node_count: number;
  edge_count: number;
  communities: TopicCommunity[];
  unclustered: string[];
  links: Array<{ a: number; b: number; weight: number }>;
  params: Record<string, unknown>;
  journal_seq?: number;
}

/** Stable, theme-adjacent palette — index-keyed so a community keeps its
 * color across reloads (ids are deterministic engine-side). */
const TOPIC_COLORS = [
  "#79c7ff",
  "#7bd88a",
  "#e7b45a",
  "#c084dd",
  "#5eead4",
  "#f28fad",
  "#a8c66c",
  "#8fb8de",
  "#e8a54a",
  "#9d8cff",
  "#6fd6c3",
  "#d98fbf",
];

interface PackedCircle {
  c: TopicCommunity;
  x: number;
  y: number;
  r: number;
}

/** Deterministic spiral packing: biggest bubble at the center, each next
 * walks a golden-angle spiral outward until it clears every placed
 * circle. O(n²·steps) — fine at topic counts (≤40). */
export function packCircles(communities: TopicCommunity[]): PackedCircle[] {
  const sorted = [...communities].sort((a, b) => b.size - a.size || a.id - b.id);
  const placed: PackedCircle[] = [];
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const r = 26 + Math.sqrt(Math.max(0, c.size)) * 9;
    if (placed.length === 0) {
      placed.push({ c, x: 0, y: 0, r });
      continue;
    }
    let best: { x: number; y: number } | null = null;
    for (let step = 0; step < 4000 && !best; step++) {
      const angle = i * 2.39996 + step * GOLDEN * 0.11;
      const dist = 8 + step * 1.9;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist * 0.78; // slight vertical squash — screens are wide
      const clear = placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + 14);
      if (clear) best = { x, y };
    }
    placed.push({ c, x: best?.x ?? 0, y: best?.y ?? (placed.length * 30), r });
  }
  return placed;
}

export function fetchCommunities(baseUrl: string, entity: string): Promise<TopicsPayload> {
  return fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/communities`, {
    headers: gatewayReadHeaders({ Accept: "application/json" }),
  }).then((res) => (res.ok ? (res.json() as Promise<TopicsPayload>) : Promise.reject(new Error(`HTTP ${res.status}`))));
}

export interface TopicMapProps {
  baseUrl: string;
  entity: string;
  fold: FoldState | null;
  /** Click a topic → the raw graph filters to its members (row ids) and
   * the view switches back to the graph; null clears. */
  onPickTopic(rowIds: Set<string> | null, label: string | null): void;
}

type MapState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: TopicsPayload };

export function TopicMap({ baseUrl, entity, fold, onPickTopic }: TopicMapProps): React.ReactElement {
  const [state, setState] = useState<MapState>({ phase: "loading" });
  const [hover, setHover] = useState<number | null>(null);

  const load = React.useCallback(() => {
    setState({ phase: "loading" });
    fetchCommunities(baseUrl, entity)
      .then((data) => setState({ phase: "ready", data }))
      .catch((e) => setState({ phase: "error", message: String((e as Error).message || e) }));
  }, [baseUrl, entity]);

  useEffect(() => {
    load();
  }, [load]);

  const packed = useMemo(() => (state.phase === "ready" ? packCircles(state.data.communities) : []), [state]);

  const bounds = useMemo(() => {
    if (packed.length === 0) return { x: -200, y: -150, w: 400, h: 300 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of packed) {
      minX = Math.min(minX, p.x - p.r);
      minY = Math.min(minY, p.y - p.r);
      maxX = Math.max(maxX, p.x + p.r);
      maxY = Math.max(maxY, p.y + p.r);
    }
    const pad = 40;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [packed]);

  if (state.phase === "loading") {
    return <div className="tm_note">regrouping his memories by topic…</div>;
  }
  if (state.phase === "error") {
    return (
      <div className="tm_note tm_error">
        topic view unavailable — {state.message}
        <button className="tm_retry" onClick={load}>
          retry
        </button>
      </div>
    );
  }

  const data = state.data;
  const centers = new Map(packed.map((p) => [p.c.id, p]));
  const maxLink = Math.max(1, ...data.links.map((l) => l.weight));

  // Map a community's GRAPH ids to fold ROW ids for the filter hand-off
  // (the canvas emphasis set keys on row ids).
  const rowIdsOf = (c: TopicCommunity): Set<string> => {
    const out = new Set<string>();
    for (const gid of c.member_ids) {
      const rid = fold?.graph_to_row.get(gid);
      if (rid) out.add(rid);
      else if (fold?.nodes.has(gid)) out.add(gid);
    }
    return out;
  };

  return (
    <div className="tm_wrap">
      <div className="tm_head">
        <span className="tm_title">
          {data.communities.length} topics · {data.node_count} memories
          {data.unclustered.length ? ` · ${data.unclustered.length} unclustered` : ""}
        </span>
        <span
          className="tm_algo"
          title={`${data.algorithm} — resolution ${String(data.params?.resolution ?? "?")}; computed at the runtime level over engraved relations + digest-keyword bridges; deterministic (the same life always maps the same).`}
        >
          ⓘ how
        </span>
        <button className="tm_retry" onClick={load} title="Recompute from the current life (cached until the life grows)">
          ⟲ refresh
        </button>
      </div>
      <svg className="tm_svg" viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} preserveAspectRatio="xMidYMid meet">
        {/* Inter-topic ties under the bubbles — faint by ruling (edges
          * stay quiet; the topics are the message). */}
        {data.links.map((l, i) => {
          const a = centers.get(l.a);
          const b = centers.get(l.b);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="currentColor"
              strokeOpacity={0.06 + 0.16 * (l.weight / maxLink)}
              strokeWidth={1 + 2.4 * (l.weight / maxLink)}
            />
          );
        })}
        {packed.map((p, i) => {
          const color = TOPIC_COLORS[i % TOPIC_COLORS.length];
          const isHover = hover === p.c.id;
          const kindsLine = Object.entries(p.c.kinds)
            .sort((x, y) => y[1] - x[1])
            .slice(0, 3)
            .map(([k, n]) => `${n} ${k === "world_model" ? "world" : k}${n === 1 ? "" : "s"}`)
            .join(" · ");
          return (
            <g
              key={p.c.id}
              className="tm_bubble"
              transform={`translate(${p.x},${p.y})`}
              onMouseEnter={() => setHover(p.c.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPickTopic(rowIdsOf(p.c), p.c.label)}
              role="button"
              aria-label={`Topic: ${p.c.label} — ${p.c.size} memories. Click to light these up on the graph.`}
            >
              <title>{`${p.c.keywords.join(", ")}\n${kindsLine}\nexemplar: ${p.c.exemplar_title || p.c.exemplar_id}\nclick → light these ${p.c.size} up on the graph`}</title>
              <circle r={p.r} fill={color} fillOpacity={isHover ? 0.34 : 0.18} stroke={color} strokeOpacity={0.8} strokeWidth={isHover ? 2.2 : 1.2} />
              <text className="tm_label" textAnchor="middle" dy={-4} fill="currentColor">
                {p.c.label.length > 34 ? `${p.c.label.slice(0, 33)}…` : p.c.label}
              </text>
              <text className="tm_count" textAnchor="middle" dy={14} fill="currentColor" fillOpacity={0.72}>
                {p.c.size} memories
              </text>
            </g>
          );
        })}
      </svg>
      <p className="tm_foot">
        Topics are computed from his memory graph itself — engraved relations plus shared digest keywords; deterministic, no
        model call. Click a topic to light its memories on the graph; the raw graph stays the full truth.
      </p>
    </div>
  );
}
