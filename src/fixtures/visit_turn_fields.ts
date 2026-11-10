/**
 * The three visit-ledger fields AbstractRuntime 1afbf68 writes for the live activity panel
 * (entity-runtime.md "What a visit turn's ledger records say"), stamped on castor's recorded visits
 * (visit_turn_ledger.json, a copy: the recording itself stays as served before them) where the
 * runtime writes them:
 * - `topic` on every handle of a memory_recall record's terminal twin (`result.handles[i]`): the
 *   stable key of the topic the memory is in (the topics route's `key`), null for one in no topic
 *   (identity included);
 * - `iteration` (from 1, per turn) and `max_iterations` on the `effect.payload` of the `reason`
 *   model call, started and terminal records;
 * - `hits` on a search_memory result entry (`result.results[i]`), absent for every other tool.
 * Plus the topics route's answer (payload v2) those keys resolve in.
 */
import type { VisitLedgerRecord } from "../stream_source";

export const TOPIC = {
  harbour: "ex:community-aaaa1111har0",
  sea: "ex:community-bbbb2222sea0",
  storm: "ex:community-cccc3333sto0",
  letters: "ex:community-dddd4444let0",
} as const;

/** Topics by the place of a memory among the recall's non-identity handles: the sea first seen,
 * the harbour most (20), then the sea (14 in all), the storm (6), the letters (3), one in none. */
function topicAt(j: number): string | null {
  if (j < 2) return TOPIC.sea;
  if (j < 22) return TOPIC.harbour;
  if (j < 34) return TOPIC.sea;
  if (j < 40) return TOPIC.storm;
  if (j < 43) return TOPIC.letters;
  return null;
}

export const SEARCH_HITS = 7;
export const MAX_ITERATIONS = 50;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** A copy of `records` with the fields stamped the way the runtime writes them. */
export function withServedFields(records: readonly VisitLedgerRecord[]): VisitLedgerRecord[] {
  const out = structuredClone(records) as VisitLedgerRecord[];
  const iterations = new Map<string, number>();
  let turnIteration = 0;
  for (const r of out) {
    const effect = (r.effect ?? null) as { type?: unknown; payload?: unknown } | null;
    const type = String(effect?.type ?? "");
    const payload = effect?.payload;
    if (type === "resume") turnIteration = 0; // a new turn: the loop counts from 1 again
    if (type === "memory_recall" && isObj(r.result) && Array.isArray(r.result.handles)) {
      let j = 0;
      for (const h of r.result.handles as Obj[]) {
        if (h.admission === "self") h.topic = null;
        else h.topic = topicAt(j++);
      }
    }
    if (type === "llm_call" && r.node_id === "reason" && isObj(payload)) {
      const step = String(r.step_id ?? "");
      if (!iterations.has(step)) iterations.set(step, ++turnIteration);
      payload.iteration = iterations.get(step);
      payload.max_iterations = MAX_ITERATIONS;
    }
    if (type === "tool_calls" && isObj(r.result) && Array.isArray(r.result.results)) {
      for (const e of r.result.results as Obj[]) if (e.name === "search_memory") e.hits = SEARCH_HITS;
    }
  }
  return out;
}

function community(key: string, n: number, title: string | null, pending: string[] = []): Obj {
  return {
    id: `ex:community-r${n}`,
    key,
    title,
    summary: null,
    pending,
    verdict: null,
    size: 1,
    kinds: { episode: 1 },
    members: [{ id: `ex:m${n}`, via: "detected" }],
    provisional_ids: [],
    cohesion: null,
    layout: { xy: [n, 0], radius: 1, seats: {} },
    centroid_stale: false,
    facts: {},
  };
}

/** The topics route's answer (payload v2). `stormPending`: the storm's title is still being written. */
export function communitiesAnswer(opts: { stormPending?: boolean } = {}): Obj {
  return {
    version: 2,
    version_seq: 41,
    first_sleep_pending: false,
    algorithm: "louvain-warm-v1",
    communities: [
      community(TOPIC.sea, 1, "The sea"),
      community(TOPIC.harbour, 2, "Harbour work"),
      opts.stormPending ? community(TOPIC.storm, 3, null, ["title", "summary"]) : community(TOPIC.storm, 3, "The storm of 1890"),
      community(TOPIC.letters, 4, "Old letters"),
      community("ex:community-eeee5555unr0", 5, "Never recalled"),
    ],
    links: [],
  };
}
