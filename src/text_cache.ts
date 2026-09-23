/**
 * Persistent text cache for harvested utterances (IndexedDB key-value).
 *
 * WHY (maintainer 2026-07-15, the "book was read" wall): every cognition
 * scoring pass re-read every diary entry through the operator door, and
 * each read lands one diary_read host marker in the entity's biography —
 * BY CONTRACT (marker-first transparency; N reads = N markers is the
 * design, confirmed by gateway). The fix belongs to the READING CLIENT:
 * diary entries and record verbatims are IMMUTABLE (append-only book,
 * write-once artifacts), so a text fetched once never needs fetching
 * again. Cache hit = no HTTP call = no marker = an honest biography that
 * records the FIRST read, not a wall of re-reads.
 *
 * Failures are never cached (a 403/transient error must retry next time);
 * IDB absence degrades to pass-through fetching (nicety, not dependency).
 */

const DB_NAME = "abstractentity_texts_v1";
const STORE = "texts";
const MAX_ENTRIES = 4000; // ~a few lives' diaries+verbatims; LRU-pruned

export interface CachedText {
  key: string;
  /** The harvested payload (text + timestamp fields the harvester uses). */
  value: Record<string, string>;
  saved_at: string;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
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

/** One cache identity per (gateway origin, entity, record/entry id). */
export function textCacheKey(base: string, entity: string, id: string): string {
  const origin = (base || "").trim().replace(/\/+$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
  return `${origin}::${entity.toLowerCase()}::${id}`;
}

export async function getCachedText(key: string): Promise<Record<string, string> | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => {
        const v = req.result as CachedText | undefined;
        resolve(v && v.value && typeof v.value === "object" ? v.value : null);
      };
      req.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

export async function putCachedText(key: string, value: Record<string, string>): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put({ key, value, saved_at: new Date().toISOString() } satisfies CachedText);
      // Opportunistic LRU prune, cheap at this scale: only when a count
      // read says we are over budget.
      const countReq = store.count();
      countReq.onsuccess = () => {
        if (countReq.result > MAX_ENTRIES) {
          const all = store.getAll();
          all.onsuccess = () => {
            const rows = (all.result as CachedText[]).sort((a, b) => (a.saved_at < b.saved_at ? -1 : 1));
            for (const stale of rows.slice(0, rows.length - MAX_ENTRIES)) store.delete(stale.key);
          };
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
}
