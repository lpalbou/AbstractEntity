/**
 * HIS TOPIC MAP, LIVE.
 *
 * - THE MARKER: memory forms a new version of his topics in his sleep; the
 *   gateway's live tail carries ONE host marker per version (payload
 *   {kind: "communities_changed", version_seq}), never a community node. The
 *   graph re-reads its topics on a marker newer than the version it shows
 *   (communities_source.ts) and re-seats with a short transition — no
 *   polling, no full reload.
 * - THE PLACEMENTS: a memory formed since the version is placed in its
 *   provisional community at formation (memory's place_record) and its
 *   `placed` event rides the stream (family "event", payload {kind:
 *   "placed", record_id, provenance: {community_key, version_seq, …}}). The
 *   graph seats it at its circle's rim with the badge "placed until his next
 *   sleep" until the next version lists it — no re-read.
 */
import { useMemo, useRef } from "react";

import type { CommunitiesRead } from "./communities";
import type { ReplayEnvelope } from "./stream_types";

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const COMMUNITIES_CHANGED = "communities_changed";

/** The newest `communities_changed` marker on the stream (a host envelope,
 * payload {kind: "communities_changed", version_seq}) from index `from`,
 * folded onto `prev`: its version_seq, or null when none. */
export function latestCommunitiesMarker(envelopes: readonly ReplayEnvelope[], from = 0, prev: number | null = null): number | null {
  let best = prev;
  for (let i = Math.max(0, from); i < envelopes.length; i++) {
    const env = envelopes[i];
    if (env.family !== "host") continue;
    const p = env.payload as { kind?: unknown; version_seq?: unknown } | null;
    if (!p || p.kind !== COMMUNITIES_CHANGED || !isNum(p.version_seq)) continue;
    if (best === null || p.version_seq > best) best = p.version_seq;
  }
  return best;
}

/** Re-read on a marker? Only for a version newer than the one shown, and
 * once per marker (a gateway still caching the old version is not asked
 * again until the next marker). */
export function refetchForMarker(marker: number | null, shown: CommunitiesRead | null, asked: number | null): boolean {
  if (marker === null || marker === asked) return false;
  const seen = shown?.kind === "served" ? shown.data.versionSeq : -Infinity;
  return marker > seen;
}

/** The newest marker over the whole stream (never the scrub position: his
 * topics are his topics now). Incremental: appends from where it left off,
 * rebuilds only when the array shrank or its covered tail moved (a
 * retrograde host insert). Null when not enabled (file/demo sources). */
export function useCommunitiesMarker(envelopes: readonly ReplayEnvelope[], enabled: boolean): number | null {
  const cacheRef = useRef<{ upTo: number; tailSeq: number; marker: number | null }>({ upTo: 0, tailSeq: -Infinity, marker: null });
  return useMemo(() => {
    const cache = cacheRef.current;
    const lastCovered = cache.upTo > 0 && cache.upTo <= envelopes.length ? envelopes[cache.upTo - 1] : null;
    const appendable = cache.upTo <= envelopes.length && (cache.upTo === 0 || (lastCovered !== null && lastCovered.seq === cache.tailSeq));
    cache.marker = latestCommunitiesMarker(envelopes, appendable ? cache.upTo : 0, appendable ? cache.marker : null);
    cache.upTo = envelopes.length;
    cache.tailSeq = envelopes.length > 0 ? envelopes[envelopes.length - 1].seq : -Infinity;
    return enabled ? cache.marker : null;
  }, [envelopes, enabled]);
}

// ------------------------------------------------------------ placements

export const PLACED_EVENT = "placed";

/** Where memory placed a record since a version: its community key and the
 * version it was placed against. */
export interface TailPlacement {
  key: string;
  versionSeq: number;
}

const NO_PLACEMENTS: ReadonlyMap<string, TailPlacement> = new Map();

/** The `placed` events on the stream from index `from`, folded onto `prev`
 * (record graph id -> its newest placement, in the order first seen). The
 * same Map comes back when nothing new was placed (identity is the change
 * signal). */
export function placedOnStream(
  envelopes: readonly ReplayEnvelope[],
  from = 0,
  prev: ReadonlyMap<string, TailPlacement> | null = null,
): ReadonlyMap<string, TailPlacement> {
  let out: Map<string, TailPlacement> | null = null;
  for (let i = Math.max(0, from); i < envelopes.length; i++) {
    const env = envelopes[i];
    if (env.family !== "event") continue;
    const p = env.payload as { kind?: unknown; record_id?: unknown; provenance?: unknown } | null;
    if (!p || p.kind !== PLACED_EVENT || typeof p.record_id !== "string" || !p.record_id) continue;
    const prov = p.provenance as { community_key?: unknown; version_seq?: unknown } | null | undefined;
    if (!prov || typeof prov.community_key !== "string" || !prov.community_key || !isNum(prov.version_seq)) continue;
    if (!out) out = new Map(prev ?? NO_PLACEMENTS);
    out.set(p.record_id, { key: prov.community_key, versionSeq: prov.version_seq });
  }
  return out ?? prev ?? NO_PLACEMENTS;
}

/** The placements over the whole stream (never the scrub position),
 * incremental like the marker. Empty when not enabled. */
export function usePlacedOnStream(envelopes: readonly ReplayEnvelope[], enabled: boolean): ReadonlyMap<string, TailPlacement> {
  const cacheRef = useRef<{ upTo: number; tailSeq: number; placed: ReadonlyMap<string, TailPlacement> }>({ upTo: 0, tailSeq: -Infinity, placed: NO_PLACEMENTS });
  return useMemo(() => {
    const cache = cacheRef.current;
    const lastCovered = cache.upTo > 0 && cache.upTo <= envelopes.length ? envelopes[cache.upTo - 1] : null;
    const appendable = cache.upTo <= envelopes.length && (cache.upTo === 0 || (lastCovered !== null && lastCovered.seq === cache.tailSeq));
    cache.placed = placedOnStream(envelopes, appendable ? cache.upTo : 0, appendable ? cache.placed : null);
    cache.upTo = envelopes.length;
    cache.tailSeq = envelopes.length > 0 ? envelopes[envelopes.length - 1].seq : -Infinity;
    return enabled ? cache.placed : NO_PLACEMENTS;
  }, [envelopes, enabled]);
}
