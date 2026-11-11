/**
 * The monitor's AUTOMATIC read (review round 6b F4: performance first, the ledger stays honest): his
 * replies and moments only (never the diary door, which records each read in his life), at stable picks
 * over his life, each record's reading kept in this browser so a reload reads and embeds nothing it has
 * already scored. Driven through readLife with the real basis and scorer, the gateway stubbed at fetch.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { automaticReadItems, stablePicks } from "./cognition_adapter";
import { scoreStore, type KeyValueStorage } from "./cognition_score_cache";
import { readLife } from "./cognition_wave_panel";
import { createFoldState, type FoldState, type NodeState } from "./stream_fold";
import type { FrozenBasis } from "./vendor/cognition/cognition_scorer";
import basisJson from "./vendor/cognition/data/basis_v1.json";
import fixtures from "./fixtures/cognition_gate_vectors.json";

const basis = basisJson as unknown as FrozenBasis;
const home = { baseUrl: "http://gw.test", entity: "castor" };

/** A life of `moments` episodes with a diary entry after every third one, an hour apart, in order. */
function life(moments: number): FoldState {
  const fold = createFoldState();
  let seq = 0;
  const add = (over: Partial<NodeState>) => {
    seq += 1;
    const id = over.id ?? `n${seq}`;
    fold.nodes.set(id, { id, graph_id: id, kind: "episode", first_seq: seq, born_at: new Date(Date.UTC(2026, 6, 1, 0, seq)).toISOString(), closed: null, entry_id: null, diary: false, redacted: false, bookkeeping: false, ...over } as unknown as NodeState);
  };
  for (let i = 0; i < moments; i++) {
    add({ id: `ex:episode-${i}` });
    if (i % 3 === 2) add({ id: `diary-${i}`, kind: "diary", diary: true, entry_id: `entry-${i}` });
  }
  return fold;
}

/** The gateway at fetch: which routes were asked, and how many texts were embedded. */
function gateway() {
  const seen = { pin: 0, probe: 0, embedCalls: 0, embedded: 0, records: 0, diary: 0, other: [] as string[] };
  vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
    const path = new URL(String(url), home.baseUrl).pathname;
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (path.endsWith("/embedding")) return (seen.pin++, json({ pin: { model_id: fixtures.embedder_id, dimension: 1024 }, resolved_embedder: fixtures.embedder_id, match: "match" }));
    if (path.endsWith("/embeddings")) {
      const input = JSON.parse(init?.body ?? "{}").input as string[];
      // The preflight's check of the route (only when a pick is not scored yet) is not a reading.
      if (input.length === 1 && input[0] === "a check of the embedding route") seen.probe++;
      else {
        seen.embedCalls++;
        seen.embedded += input.length;
      }
      return json({ model: fixtures.embedder_id, data: input.map((t, i) => ({ index: i, embedding: fixtures.cases[t.length % fixtures.cases.length].vector })) });
    }
    if (path.includes("/diary/")) return (seen.diary++, json({ entry: { entry_id: "x", text: "a diary entry long enough to be read and scored", written_at: "" } }));
    if (path.endsWith("/verbatim")) return (seen.records++, json({ text: `Castor: the words of ${decodeURIComponent(path.split("/").at(-2) ?? "")}, long enough to score` }));
    seen.other.push(path);
    return json({});
  });
  return seen;
}

/** What the monitor draws of a read: each sample's id, seq, tone scores and register similarities. */
const drawn = (phase: Awaited<ReturnType<typeof readLife>>) => (phase.name === "ready" ? phase.samples.map((s) => ({ id: s.id, seq: s.seq, scores: s.scores, emotions: s.emotions })) : phase.name);

function memoryStorage(): KeyValueStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

afterEach(() => vi.unstubAllGlobals());

describe("stable picks: a new record adds a pick at the end, never reshuffles the rest", () => {
  const changed = (a: number[], b: number[]) => {
    const A = new Set(a), B = new Set(b);
    return [...A].filter((x) => !B.has(x)).length + [...B].filter((x) => !A.has(x)).length;
  };
  const items = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("all of them up to the limit; then every 2^k-th, within the limit", () => {
    expect(stablePicks(items(120), 120)).toEqual(items(120));
    expect(stablePicks(items(716), 120)).toEqual(items(90).map((i) => i * 8));
    expect(stablePicks(items(960), 120)).toHaveLength(120);
    expect(stablePicks(items(961), 120)).toEqual(items(61).map((i) => i * 16));
  });

  it("appending 1 and 5 records changes at most that many picks (945 -> 946, 945 -> 950, and at every size between doublings)", () => {
    expect(changed(stablePicks(items(945), 120), stablePicks(items(946), 120))).toBeLessThanOrEqual(1);
    expect(changed(stablePicks(items(945), 120), stablePicks(items(950), 120))).toBeLessThanOrEqual(5);
    for (let n = 121; n < 2000; n++) {
      const sameStride = Math.ceil(Math.log2(n / 120)) === Math.ceil(Math.log2((n + 5) / 120));
      if (!sameStride) continue;
      expect(changed(stablePicks(items(n), 120), stablePicks(items(n + 1), 120))).toBeLessThanOrEqual(1);
      expect(changed(stablePicks(items(n), 120), stablePicks(items(n + 5), 120))).toBeLessThanOrEqual(5);
    }
  });
});

describe("the automatic read", () => {
  it("never reads a diary entry: his replies and moments only", () => {
    const rows = automaticReadItems(life(9));
    expect(rows.map((r) => r.node.id)).toEqual(Array.from({ length: 9 }, (_, i) => `ex:episode-${i}`));
  });

  it("first load reads and embeds his picks once, never the diary door; a reload with nothing new asks the gateway nothing; one new record reads and embeds one", async () => {
    const storage = memoryStorage();
    let seen = gateway();
    const first = await readLife(home, life(30), basis, scoreStore(home, basis.version, storage));
    expect(first.name).toBe("ready");
    expect(first.name === "ready" && first.samples.map((s) => s.id)).toEqual(Array.from({ length: 30 }, (_, i) => `ex:episode-${i}`));
    expect(seen.diary).toBe(0);
    expect(seen.records).toBe(30);
    expect(seen.embedded).toBe(30);
    // The kept readings carry no words.
    expect([...storage.map.values()].join("")).not.toContain("the words of");

    seen = gateway();
    const reload = await readLife(home, life(30), basis, scoreStore(home, basis.version, storage));
    expect(seen).toEqual({ pin: 0, probe: 0, embedCalls: 0, embedded: 0, records: 0, diary: 0, other: [] });
    expect(drawn(reload)).toEqual(drawn(first));

    seen = gateway();
    const grown = await readLife(home, life(31), basis, scoreStore(home, basis.version, storage));
    expect(grown.name === "ready" && grown.samples).toHaveLength(31);
    expect(seen.records).toBe(1);
    expect(seen.embedded).toBe(1);
    expect(seen.diary).toBe(0);
  });

  it("a long life: at most 120 picks; five new records read at most five; another basis version reads again", async () => {
    const storage = memoryStorage();
    gateway();
    const first = await readLife(home, life(700), basis, scoreStore(home, basis.version, storage));
    expect(first.name === "ready" && first.samples.length).toBe(88);
    let seen = gateway();
    await readLife(home, life(705), basis, scoreStore(home, basis.version, storage));
    expect(seen.records).toBeLessThanOrEqual(5);
    expect(seen.embedded).toBeLessThanOrEqual(5);
    seen = gateway();
    await readLife(home, life(705), basis, scoreStore(home, "another-basis", storage));
    expect(seen.records).toBe(89);
  });

  it("a browser that keeps nothing reads again, never wrong", async () => {
    const refusing: KeyValueStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    gateway();
    const first = await readLife(home, life(6), basis, scoreStore(home, basis.version, refusing));
    const seen = gateway();
    const again = await readLife(home, life(6), basis, scoreStore(home, basis.version, refusing));
    expect(drawn(again)).toEqual(drawn(first));
    expect(seen.records).toBe(6);
  });
});
