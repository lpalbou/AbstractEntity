/**
 * Topic communities — where the graph's topics come from (operator ask
 * 2026-07-17: "regroup memories on a same topic"; 2026-11-07: topics are
 * the graph's NATURAL layout, not a separate view).
 *
 * Communities are computed DURABLY at the runtime level
 * (abstractruntime.identity.communities — deterministic Louvain over the
 * store's engraved relations + weak keyword bridges) and served by the
 * gateway (GET /entities/{name}/communities). This module fetches them
 * and keeps them fresh as the life grows (useCommunities); the geometry
 * is topic_layout.ts, the drawing graph_canvas.tsx.
 */

import React, { useEffect, useState } from "react";

import { gatewayReadHeaders } from "./stream_source";
import { joinBaseUrl } from "@abstractframework/ui-kit";

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

export function fetchCommunities(baseUrl: string, entity: string): Promise<TopicsPayload> {
  return fetch(joinBaseUrl(baseUrl, `api/gateway/entities/${encodeURIComponent(entity)}/communities`), {
    headers: gatewayReadHeaders({ Accept: "application/json" }),
  }).then((res) => (res.ok ? (res.json() as Promise<TopicsPayload>) : Promise.reject(new Error(`HTTP ${res.status}`))));
}

/** Where the communities come from (gateway lives only — the door
 * computes them; file/demo sources have none). */
export interface TopicSource {
  baseUrl: string;
  entity: string;
}

export type CommunitiesState =
  | { phase: "off" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: TopicsPayload };

/** A growing life asks for fresh topics at most this often (the door
 * caches them until the life grows; new memories sit among their
 * relations until then). */
export const COMMUNITIES_REFRESH_MS = 120_000;

/** When to ask again (ms from now), or null: only when the life GREW past
 * what the last answer covered, and never sooner than the refresh floor. */
export function communitiesRefetchDelay(args: { nodeCount: number; countAtFetch: number; lastFetchAt: number; now: number }): number | null {
  if (args.nodeCount <= args.countAtFetch) return null;
  return Math.max(0, args.lastFetchAt + COMMUNITIES_REFRESH_MS - args.now);
}

/** The communities for the graph's layout: fetched once per source, then
 * again when the life grows (throttled). A refresh keeps the previous
 * answer on screen until the new one lands (no layout flapping); a failed
 * refresh keeps it too. `retry` asks now. */
export function useCommunities(source: TopicSource | null, nodeCount: number): { state: CommunitiesState; retry(): void } {
  const key = source ? `${source.baseUrl}\u0000${source.entity}` : null;
  const [state, setState] = useState<CommunitiesState>(source ? { phase: "loading" } : { phase: "off" });
  const sourceRef = React.useRef(source);
  sourceRef.current = source;
  const countRef = React.useRef(nodeCount);
  countRef.current = nodeCount;
  const metaRef = React.useRef({ countAtFetch: 0, lastFetchAt: 0, token: 0, timer: null as number | null });

  const load = React.useCallback((keepData: boolean) => {
    const src = sourceRef.current;
    const meta = metaRef.current;
    if (!src) return;
    meta.token += 1;
    const token = meta.token;
    meta.countAtFetch = countRef.current;
    meta.lastFetchAt = Date.now();
    if (!keepData) setState({ phase: "loading" });
    fetchCommunities(src.baseUrl, src.entity)
      .then((data) => {
        if (token === metaRef.current.token) setState({ phase: "ready", data });
      })
      .catch((e) => {
        if (token !== metaRef.current.token) return;
        const message = String((e as Error).message || e);
        setState((prev) => (prev.phase === "ready" ? prev : { phase: "error", message }));
      });
  }, []);

  useEffect(() => {
    const meta = metaRef.current;
    if (meta.timer !== null) window.clearTimeout(meta.timer);
    meta.timer = null;
    meta.token += 1; // drop any answer for the previous source
    if (!key) {
      setState({ phase: "off" });
      return;
    }
    load(false);
    return () => {
      if (metaRef.current.timer !== null) window.clearTimeout(metaRef.current.timer);
      metaRef.current.timer = null;
    };
  }, [key, load]);

  useEffect(() => {
    const meta = metaRef.current;
    if (!key || state.phase !== "ready" || meta.timer !== null) return;
    const delay = communitiesRefetchDelay({ nodeCount, countAtFetch: meta.countAtFetch, lastFetchAt: meta.lastFetchAt, now: Date.now() });
    if (delay === null) return;
    meta.timer = window.setTimeout(() => {
      metaRef.current.timer = null;
      load(true);
    }, delay);
  }, [key, nodeCount, state.phase, load]);

  const retry = React.useCallback(() => load(false), [load]);
  return { state, retry };
}
