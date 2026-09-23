/**
 * Client-side life cache: IndexedDB envelope store + cursored delta resume.
 *
 * WHY (operator, 2026-07-15 dm#10: "initial loading of the entity journey is
 * a bit slow — pinpoint the origin"): the measured cost of opening a life is
 * the SERVER drip — 13-17s to re-serve castor's whole journal on every open
 * (server-side fixes are gateway/memory lane, posted at commons#2394). The
 * client's half of the fix rides the stream's own contracts:
 *   - the journal is APPEND-ONLY and `seq` strictly ascends (never-purge is
 *     structural; records are immutable);
 *   - host markers mint at `journal high-water + n/1000` — a NEW marker
 *     never lands below an already-cached cut;
 *   - `since_seq` is an EXCLUSIVE float cursor the server serves cheaply.
 * So a cached prefix stays true forever — reopening a life needs only the
 * envelopes with `seq > cached max`, not a since_seq=0 re-walk.
 *
 * VALIDATION (the one honest hazard): the cache key is (origin, entity
 * name), but a NAME can be reborn — a deleted-and-recreated fixture home
 * serves a different life under the same name, and an append-only cache
 * check ("delta only") would silently show the OLD life. Before trusting a
 * cached prefix we fetch the journal HEAD (until_seq=1, one tiny request)
 * and require the first cached envelope to match (seq + observed_at +
 * family): same first record = same lineage (append-only journals never
 * rewrite position 1). Mismatch → drop the cache, full reload. Engram
 * timestamps carry microseconds, so cross-life collision is not a thing.
 *
 * Storage shape: ONE record per life (the whole envelope array as a
 * structured clone — no per-envelope rows, no JSON.stringify on the main
 * thread). Saves happen at load completion and on tab-hidden, never per
 * tail envelope. LRU-capped; IDB absence (private mode) degrades silently
 * to the uncached path (a cache is a nicety, never a dependency).
 *
 * ENRICHED-STALENESS + THE SIGNALED REFRESH (memory, commons#2425/#2427):
 * RAW payloads below high-water are immutable, but DISPLAY blocks are
 * resolved from CURRENT store truth at export time — formation edges can
 * GROW on old records. Edges whose SOURCE is a new record (dreams,
 * written_amid projections, promote/heal/break — all of which append
 * BINDINGS) ride the delta and fold correctly. The ONE edge-grower that
 * does not is confirm_relation: it appends NO binding, only two
 * kind="cited" journal EVENTS (one per old endpoint, provenance carrying
 * confirmed_relation + edge_id) — the edge itself only surfaces in
 * re-enriched OLD binding envelopes. So the delta SIGNALS the staleness
 * precisely: when it contains a cited/confirmed_relation event, we kick a
 * BACKGROUND full refetch (instant cached paint stays; the refreshed
 * truth swaps in ~1s now that the server is fast) and re-save the cache.
 */

import type { ReplayEnvelope } from "./stream_types";
import { gatewayReadHeaders, streamReplay } from "./stream_source";

const DB_NAME = "abstractentity_replay_v1";
const STORE = "lives";
const MAX_LIVES = 6; // LRU cap: a handful of homes, not a hoard

export interface CachedLife {
  key: string;
  envelopes: ReplayEnvelope[];
  max_seq: number;
  saved_at: string;
}

/** Display-shape version, salted into the cache identity. The serving end
 * ENRICHES display blocks (operator gist-as-title, entry_id — gateway
 * _operator_diary_display), and those upgrades rewrite HISTORY: a cached
 * life keeps pre-upgrade blocks forever because delta resume only appends
 * new seqs (ENRICHED-STALENESS, the class laurent hit as "a diary entry"
 * labels on nodes the live stream serves with real gists). Bump this when
 * the display contract gains fields/richness — old entries die wholesale
 * and one full refetch heals the fold. */
const DISPLAY_VERSION = 3; // d3: serving-end boilerplate exchange-title rewrite (2026-07-17)

/** One cache identity per (gateway origin, entity name, display version).
 * An empty base is the same-origin proxy posture — resolve it so "" and
 * the explicit page origin share one entry. */
export function cacheKey(base: string, entity: string): string {
  const origin = (base || "").trim().replace(/\/+$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}::${entity.toLowerCase()}::d${DISPLAY_VERSION}`;
}

/** Does a delta contain a confirm_relation act? That is the ONE edge-grower
 * whose edge never rides a binding envelope (memory, commons#2427: two
 * kind="cited" events per endpoint, provenance.confirmed_relation) — the
 * precise signal that cached OLD envelopes' edge lists went stale. Pure. */
export function deltaSignalsEdgeGrowth(delta: ReplayEnvelope[]): boolean {
  return delta.some((e) => {
    if (e.family !== "event") return false;
    const p = e.payload as Record<string, unknown>;
    if (String(p.kind || "") === "cited") return true;
    const prov = p.provenance;
    return !!(prov && typeof prov === "object" && (prov as Record<string, unknown>).confirmed_relation != null);
  });
}

/** Same-lineage check: the cached first envelope must byte-match the
 * served journal head on the identity triple. Pure — tested directly. */
export function sameLineage(cachedFirst: ReplayEnvelope | undefined, servedHead: ReplayEnvelope[]): boolean {
  if (!cachedFirst) return false;
  const head = servedHead.find((e) => e.family !== "host") ?? servedHead[0];
  if (!head) return false;
  return head.seq === cachedFirst.seq && head.observed_at === cachedFirst.observed_at && head.family === cachedFirst.family;
}

// ------------------------------------------------------------------ IDB

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null); // no IDB (private mode / very old browser): uncached path
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

export async function loadCachedLife(base: string, entity: string): Promise<CachedLife | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<CachedLife | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(cacheKey(base, entity));
      req.onsuccess = () => {
        const v = req.result as CachedLife | undefined;
        resolve(v && Array.isArray(v.envelopes) && v.envelopes.length > 0 && Number.isFinite(v.max_seq) ? v : null);
      };
      req.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

export async function saveCachedLife(base: string, entity: string, envelopes: ReplayEnvelope[]): Promise<void> {
  if (!envelopes.length) return;
  const db = await openDb();
  if (!db) return;
  try {
    const record: CachedLife = {
      key: cacheKey(base, entity),
      envelopes,
      max_seq: envelopes[envelopes.length - 1].seq,
      saved_at: new Date().toISOString(),
    };
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        // Quota or clone failure: the cache is a nicety — say so, move on.
        console.warn("#FALLBACK: life cache save failed (quota?)", tx.error);
        resolve();
      };
    });
    await evictOldest(db);
  } finally {
    db.close();
  }
}

export async function dropCachedLife(base: string, entity: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(cacheKey(base, entity));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
}

/** Keep the newest MAX_LIVES entries (by saved_at); delete the rest. */
async function evictOldest(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const all = store.getAll();
    all.onsuccess = () => {
      const rows = (all.result as CachedLife[]).sort((a, b) => (a.saved_at < b.saved_at ? 1 : -1));
      for (const stale of rows.slice(MAX_LIVES)) store.delete(stale.key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ------------------------------------------------- composed life stream

/** Fetch the journal head (seq in (0,1]) — one tiny request that answers
 * "is the cached prefix this same life?". */
async function fetchHead(base: string, entity: string): Promise<ReplayEnvelope[]> {
  const url = `${base}/api/gateway/entities/${encodeURIComponent(entity)}/replay?since_seq=0&until_seq=1`;
  const res = await fetch(url, { credentials: "include", headers: gatewayReadHeaders({ Accept: "application/x-ndjson" }) });
  if (!res.ok) throw new Error(`head read failed: HTTP ${res.status}`);
  const text = await res.text();
  const out: ReplayEnvelope[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as ReplayEnvelope);
    } catch {
      // head probe tolerates a bad line; validation just fails closed
    }
  }
  return out;
}

/**
 * Open a life: cached prefix (instant paint) + cursored delta, or the full
 * progressive stream when there is no trustworthy cache. Same onBatch
 * contract as streamReplay; resolves to the complete seq-ordered list.
 * The returned list is SAVED back to the cache on completion.
 */
export async function openLifeStream(
  base: string,
  entity: string,
  onBatch: (all: ReplayEnvelope[], doneBytes: number) => void,
): Promise<ReplayEnvelope[]> {
  let cached: CachedLife | null = null;
  try {
    cached = await loadCachedLife(base, entity);
  } catch {
    cached = null;
  }
  if (cached) {
    try {
      const head = await fetchHead(base, entity);
      if (sameLineage(cached.envelopes[0], head)) {
        // Instant paint from the cache, then only the delta rides the wire.
        onBatch(cached.envelopes, -1);
        const delta = await streamReplay(base, entity, cached.max_seq, (all, bytes) => {
          onBatch([...cached!.envelopes, ...all], bytes);
        });
        const full = [...cached.envelopes, ...delta];
        void saveCachedLife(base, entity, full);
        if (deltaSignalsEdgeGrowth(delta)) {
          // Signaled refresh: a confirm_relation in the delta means edges on
          // OLD records changed under our cached display blocks. Keep the
          // instant paint, swap the refreshed truth in the background (the
          // caller's onBatch epoch guards make a stale swap a no-op).
          void streamReplay(base, entity, 0, () => {})
            .then((fresh) => {
              if (fresh.length >= full.length) {
                onBatch(fresh, -1);
                void saveCachedLife(base, entity, fresh);
              }
            })
            .catch(() => {
              // refresh is best-effort; the cache drops at next lineage check
            });
        }
        return full;
      }
      // Different lineage (reborn name): the cache is a stale life — drop it.
      void dropCachedLife(base, entity);
    } catch {
      // Head probe failed (auth blip, transient): fall through to the full
      // stream — never serve a cache we could not validate.
    }
  }
  const full = await streamReplay(base, entity, 0, onBatch);
  void saveCachedLife(base, entity, full);
  return full;
}
