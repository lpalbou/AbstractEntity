/**
 * THE SEAM, pinned: every answer abstractgateway's own understanding test
 * reads at 1b3832b7 (src/fixtures/gateway_understanding_1b3832b7.json,
 * recorded verbatim from its TestClient), fed through the app's readers.
 * If the gateway renames, drops or reshapes a field, this file goes red —
 * the app never guesses around it.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import GATEWAY from "./fixtures/gateway_understanding_1b3832b7.json";
import { createFoldState, foldEnvelopes, type NodeState } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { RecordBody } from "./record_detail";
import { cardTypeWords, readCard } from "./world_model_view";
import { BLOCK_KEYS, earlierVersions, MECHANICAL_WORDS, provenanceLine, provenanceWords, readUnderstanding, servedDigest, UNDERSTANDING_KEYS, UNSERVED_SENTENCE, versionHead } from "./understanding";
import { lessonLine, momentLine } from "./identity_card";
import type { RecordWords } from "./verbatim_view";

type Body = Record<string, unknown>;
type Response = { url: string; status: number; body: unknown };
const RESPONSES = (GATEWAY as unknown as { responses: Response[] }).responses;
const UTC = "UTC";

/** The gateway's answer for the n-th read of `pattern`. */
function answer(pattern: RegExp, n = 0): Response {
  const hits = RESPONSES.filter((r) => pattern.test(r.url));
  if (!hits[n]) throw new Error(`the pinned gateway answers hold no read #${n} of ${pattern}`);
  return hits[n];
}
const kindOf = (graphId: string) => /^ex:([a-z_]+)-/.exec(graphId)?.[1] ?? "memory";
const served = (body: Body, kind: string) => {
  const u = readUnderstanding(body, kind);
  if (!u.served) throw new Error(`not served: ${u.missing.join(", ")}`);
  return u.understanding;
};

function node(graphId: string, over: Partial<NodeState> = {}): NodeState {
  return {
    id: graphId,
    graph_id: graphId,
    kind: kindOf(graphId),
    title: "",
    token_estimate: 0,
    scope: "life",
    owner_id: "entity:x",
    first_seq: 1,
    born_at: "2026-11-08T01:33:36Z",
    search_state: "indexed",
    prompt_state: "inactive",
    lifecycle: "active",
    source: "remember",
    selected_count: 0,
    last_selected_seq: null,
    last_admission: null,
    closed: null,
    entry_id: null,
    diary_type: null,
    diary: false,
    redacted: false,
    pinned: false,
    silenced: false,
    bookkeeping: false,
    maintenance: null,
    visit_id: null,
    signals: null,
    ...over,
  };
}

describe("the record read, as the gateway serves it", () => {
  const reads = RESPONSES.filter((r) => /\/records\/[^/]+\/verbatim$/.test(r.url) && r.status === 200);

  it("every non-diary answer carries the fifteen fields and versions, and reads as served", () => {
    const nonDiary = reads.filter((r) => BLOCK_KEYS.some((k) => k in (r.body as Body)));
    expect(nonDiary.length).toBeGreaterThanOrEqual(6);
    for (const r of nonDiary) {
      const body = r.body as Body;
      expect(UNDERSTANDING_KEYS.filter((k) => !(k in body)), r.url).toEqual([]);
      const gid = String(body.record_id);
      expect(readUnderstanding(body, kindOf(gid)).served, r.url).toBe(true);
    }
  });

  it("a rewritten lesson: his own words, as of its date, why; the mechanical original folded", () => {
    const body = answer(/\/records\/ex:lesson-[^/]+\/verbatim$/).body as Body;
    const u = served(body, "lesson");
    expect(servedDigest(u)).toBe("Own the mistake, then fix the path.");
    expect(provenanceLine(provenanceWords(u, UTC))).toBe("His own words · understood as of 8 Nov 2026 · first formed");
    const earlier = earlierVersions(u)!;
    expect(earlier.map((v) => v.version)).toEqual([0]);
    // A mechanical reading's reader is {} on the wire: no model, never "{}".
    expect(earlier[0].reader).toBeNull();
    expect(versionHead(earlier[0], UTC)).toBe(`8 Nov 2026 · ${MECHANICAL_WORDS} · first formed`);
    expect(earlier[0].text).toBe("Repair before perfection.");
  });

  it("a never-rewritten card: mechanical, no cause yet, its type", () => {
    const body = answer(/\/records\/ex:world_model-[^/]+\/verbatim$/).body as Body;
    const u = served(body, "world_model");
    expect(provenanceLine(provenanceWords(u, UTC))).toBe(`${MECHANICAL_WORDS.charAt(0).toUpperCase()}${MECHANICAL_WORDS.slice(1)} · understood as of 8 Nov 2026 · why: not computed yet`);
    expect(earlierVersions(u)).toEqual([]);
    const w: RecordWords = { text: String(body.text), note: null, turnId: null, born: true, understanding: readUnderstanding(body, "world_model") };
    expect(cardTypeWords({ state: "ready", text: w.text, shape: readCard(w.text), understanding: w.understanding })).toEqual({ text: "person", known: true });
  });

  it("a summary without a verbatim opens as its words: no shell, no empty fold", () => {
    const r = answer(/\/records\/ex:summary-[^/]+\/verbatim$/);
    expect(r.status).toBe(200);
    const body = r.body as Body;
    const gid = String(body.record_id);
    const words: RecordWords = { text: String(body.text), note: null, turnId: null, born: Boolean(body.born_digest), understanding: readUnderstanding(body, "summary") };
    const html = renderToStaticMarkup(
      <RecordBody fold={createFoldState()} node={node(gid, { title: String(body.title) })} source={{ baseUrl: "http://gw", entity: "sumi" }} state={{ phase: "ready", words }} renderFacts={() => <dl />} onSelect={() => {}} />,
    );
    expect(html).toContain("[session reflection] the map and the key");
    expect(html).toContain("Mechanical — a placeholder until he understands it · understood as of");
    expect(html).not.toContain("The words as saved");
    expect(html).not.toContain("The fuller summary arrives");
    expect(html).not.toContain(UNSERVED_SENTENCE);
  });

  it("a diary answer carries none of it (the diary door is the only door)", () => {
    const diary = answer(/\/records\/ex:diary-[^/]+\/verbatim$/).body as Body;
    expect(BLOCK_KEYS.filter((k) => k in diary)).toEqual([]);
    expect("versions" in diary).toBe(false);
  });
});

describe("recall snapshots: display.recalled", () => {
  const enriched = answer(/\/replay\?families=snapshot$/).body as ReplayEnvelope[];
  const raw = answer(/\/replay\?families=snapshot&enrich=false$/).body as ReplayEnvelope[];

  it("the fold takes each record's digest from the block: the reading that entered that context", () => {
    const [before, after] = enriched;
    const episodeBlock = (before.display as unknown as { recalled: Body[] }).recalled.find((b) => String(b.graph_id).startsWith("ex:episode-"))!;
    const row = String(episodeBlock.record_id);
    const atBefore = foldEnvelopes(enriched, before.seq);
    const n = atBefore.nodes.get(row)!;
    expect(n.graph_id).toBe(episodeBlock.graph_id);
    expect(atBefore.graph_to_row.get(String(episodeBlock.graph_id))).toBe(row);
    expect(n.digest).toBe("User: tides? Tidal: twice a day.");
    expect(n.digest_method).toBe("mechanical-v2");
    const atAfter = foldEnvelopes(enriched, after.seq).nodes.get(row)!;
    expect(atAfter.digest).toBe("Tides come twice a day, the moon pulls them.");
    expect(atAfter.digest_method).toBe("authored-v1");
  });

  it("when the payload row and the block disagree, the block's reading is the one kept", () => {
    const [before] = enriched;
    const tampered = JSON.parse(JSON.stringify(before)) as ReplayEnvelope;
    for (const r of (tampered.payload as { display: Body[] }).display) r.digest = "PAYLOAD WORDS";
    const block = (before.display as unknown as { recalled: Body[] }).recalled[0];
    expect(foldEnvelopes([tampered]).nodes.get(String(block.record_id))!.digest).toBe(block.digest);
  });

  it("a payload row the gateway lists no block for keeps no words (blocks present = the only source)", () => {
    const [before] = enriched;
    const none = JSON.parse(JSON.stringify(before)) as ReplayEnvelope & { display: { recalled: Body[] } };
    none.display.recalled = [];
    const fold = foldEnvelopes([none]);
    expect([...fold.nodes.values()].filter((x) => x.digest)).toEqual([]);
  });

  it("the blocks are the only source when present: the snapshot's diary row keeps no words", () => {
    const fold = foldEnvelopes(enriched);
    const diaryRows = [...fold.nodes.values()].filter((x) => x.diary || String(x.graph_id ?? "").includes("diary-"));
    expect(diaryRows.length).toBe(1);
    expect(diaryRows[0].digest ?? null).toBeNull();
    // Mutation guard: with the blocks stripped, the payload rows still give the
    // episode its words (exported streams), and still never the diary's.
    const stripped = foldEnvelopes(raw);
    const ep = [...stripped.nodes.values()].find((x) => String(x.graph_id ?? "").startsWith("ex:episode-"))!;
    expect(ep.digest).toBe("Tides come twice a day, the moon pulls them.");
    expect([...stripped.nodes.values()].filter((x) => x.diary).every((x) => (x.digest ?? null) === null)).toBe(true);
  });
});

describe("the Card's briefs carry the fields and still read as before", () => {
  const card = answer(/\/card$/).body as { lessons: { lessons: Body[] }; key_moments: { moments: Body[] }; discoveries: { interests: Body[] } };
  const bare = (b: Body) => Object.fromEntries(Object.entries(b).filter(([k]) => !(BLOCK_KEYS as readonly string[]).includes(k)));

  it("a lesson reads its statement (the current reading), with or without the fields", () => {
    const rewritten = card.lessons.lessons.find((b) => b.kind === "lesson")!;
    expect(BLOCK_KEYS.filter((k) => !(k in rewritten))).toEqual([]);
    expect(lessonLine(rewritten)).toEqual(lessonLine(bare(rewritten)));
    expect(lessonLine(rewritten).text).toBe("A routine earns their trust.");
    // A book lesson carries none of them.
    const book = card.lessons.lessons.find((b) => b.source === "diary")!;
    expect(BLOCK_KEYS.filter((k) => k in book)).toEqual([]);
  });

  it("a key moment reads the same with the fields (their null target never names anyone)", () => {
    const first = card.key_moments.moments.find((m) => m.record_id)!;
    expect(first.target).toBeNull();
    expect(momentLine(first)).toEqual(momentLine(bare(first)));
    expect(momentLine(first).text).not.toMatch(/null|\{/);
  });

  it("an interest's statement is its current reading", () => {
    const interest = card.discoveries.interests[0];
    expect(interest.statement).toBe(interest.digest);
  });
});
