/**
 * Where the graph's topics come from: the gateway's
 * GET /entities/{name}/communities (payload v2, communities.ts reads it).
 * Asked once per life, then again only when the live stream says his topics
 * changed (the `communities_changed` marker) — never polled, never on node
 * growth. A re-read keeps the shown answer until the new one lands (the
 * graph re-seats with a short transition; the viewer's selection stays).
 */
import React, { useEffect, useState } from "react";
import { joinBaseUrl } from "@abstractframework/ui-kit";

import { gatewayReadHeaders } from "./stream_source";
import { readCommunities, type CommunitiesRead } from "./communities";
import { refetchForMarker } from "./topic_map";
import type { TopicsView } from "./topics_panel";

/** Where the communities come from (gateway lives only: file/demo sources
 * have none). */
export interface TopicSource {
  baseUrl: string;
  entity: string;
}

export function communitiesUrl(baseUrl: string, entity: string): string {
  return joinBaseUrl(baseUrl, `api/gateway/entities/${encodeURIComponent(entity)}/communities`);
}

export async function fetchCommunities(baseUrl: string, entity: string, fetcher: typeof fetch = fetch): Promise<CommunitiesRead> {
  const res = await fetcher(communitiesUrl(baseUrl, entity), { headers: gatewayReadHeaders({ Accept: "application/json" }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return readCommunities((await res.json()) as unknown);
}

export type CommunitiesState = { phase: "off" } | TopicsView;

/** The topics of `source`, re-read on a newer `marker` (the newest
 * communities_changed version_seq on the stream). `retry` asks now. */
export function useServedCommunities(source: TopicSource | null, marker: number | null): { state: CommunitiesState; retry(): void } {
  const key = source ? `${source.baseUrl}\u0000${source.entity}` : null;
  const [state, setState] = useState<CommunitiesState>(source ? { kind: "loading" } : { phase: "off" });
  const sourceRef = React.useRef(source);
  sourceRef.current = source;
  const metaRef = React.useRef({ token: 0, asked: null as number | null, shown: null as CommunitiesRead | null });

  const load = React.useCallback((keepShown: boolean) => {
    const src = sourceRef.current;
    if (!src) return;
    const meta = metaRef.current;
    meta.token += 1;
    const token = meta.token;
    if (!keepShown) setState({ kind: "loading" });
    fetchCommunities(src.baseUrl, src.entity)
      .then((read) => {
        if (token !== metaRef.current.token) return;
        metaRef.current.shown = read;
        setState({ kind: "read", read });
      })
      .catch((e) => {
        if (token !== metaRef.current.token) return;
        const message = String((e as Error).message || e);
        // A failed re-read keeps what is shown.
        setState((prev) => ("kind" in prev && prev.kind === "read" ? prev : { kind: "error", message }));
      });
  }, []);

  useEffect(() => {
    const meta = metaRef.current;
    meta.token += 1; // drop any answer for the previous source
    meta.shown = null;
    meta.asked = null;
    if (!key) {
      setState({ phase: "off" });
      return;
    }
    load(false);
  }, [key, load]);

  // THE LIVE MARKER: a version newer than the one shown is read once.
  useEffect(() => {
    const meta = metaRef.current;
    if (!key || !refetchForMarker(marker, meta.shown, meta.asked)) return;
    if (meta.shown === null) return; // the first answer is still on its way: it is the newest
    meta.asked = marker;
    load(true);
  }, [key, marker, state, load]);

  const retry = React.useCallback(() => load(false), [load]);
  return { state, retry };
}
