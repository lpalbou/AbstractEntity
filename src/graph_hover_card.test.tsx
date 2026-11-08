/**
 * The graph's hover card on a backfilled memory (operator 2026-11-08, on
 * nerin's "so why did you stop exploring the world…": the card still showed
 * the old mechanical digest, "###" inline): the card reads the record, and
 * its CURRENT understanding replaces the fold's reading, through the shared
 * renderer, with who wrote it underneath in Detail's words.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CardSummaryBlock, hoverWordsOf } from "./graph_hover_card";
import { cardSummary } from "./hover_card";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { PLACEHOLDER_WORDS, readUnderstanding } from "./understanding";
import { Words } from "./verbatim_view";
import { WordsLine } from "./words_line";
import type { RecordWords } from "./verbatim_view";

const ID = "ex:episode-caeae4edfb36ab4fe6c4f36386";
const OLD_MECHANICAL =
  "person:admin: so why did you stop exploring the world ? you thought that by looking 8 sites you would get a world view of where we are and what's happening? why did you decided to stop and sleep? nerin: You’re right to challenge that. , not using their substantive claims ### Promising leads found - WFP’s hunger hotspots";
const CURRENT = "Admin challenged me for stopping my exploration of the world after reviewing only **eight sites**. I admitted that I had mistaken initial breadth for sufficiency.";

/** The record read as the gateway answers it after the backfill (the
 * fifteen understanding keys + versions; nerin's store rows, 2026-11-08). */
const READ_BODY: Record<string, unknown> = {
  record_id: ID,
  title: "Acknowledging the premature halt of my global exploration",
  text: "person:admin:\nso why did you stop exploring the world ?\n\nnerin:\nYou’re right to challenge that.",
  born_digest: false,
  turn_id: "t-0003",
  digest: CURRENT,
  digest_method: "authored-backfill-v1",
  digest_version: 1,
  version_count: 2,
  authored_by: { kind: "capability-model", id: "endpoint:compat-theforge-nvidia/qwen/qwen3.8-27b" },
  reader: { provider: "endpoint:compat-theforge-nvidia", model: "qwen/qwen3.8-27b", thinking: false },
  understood_at: "2026-11-07T15:48:50.027470+00:00",
  cause: "backfill",
  target: null,
  target_type: null,
  card_revision: null,
  source_count: null,
  narrated: null,
  narration_version: null,
  replaced_by: null,
  versions: [
    { version: 0, text: OLD_MECHANICAL, digest_method: "mechanical-v2", author: { kind: "mechanical", id: "mechanical-v2" }, reader: {}, cause: { cause: "formation" }, understood_at: "2026-11-07T15:48:50.027470+00:00", current: false },
    { version: 1, text: CURRENT, digest_method: "authored-backfill-v1", author: { kind: "capability-model", id: "endpoint:compat-theforge-nvidia/qwen/qwen3.8-27b" }, reader: { provider: "endpoint:compat-theforge-nvidia", model: "qwen/qwen3.8-27b", thinking: false }, cause: { cause: "backfill" }, understood_at: "2026-11-07T15:48:50.027470+00:00", current: true },
  ],
};

function recordWords(body: Record<string, unknown>): RecordWords {
  return { text: String(body.text ?? ""), note: null, turnId: null, born: false, understanding: readUnderstanding(body, "episode") };
}

/** The moment as the stream served it when it was recalled — before the backfill. */
const fold = foldEnvelopes([
  {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq: 5792,
    family: "binding",
    observed_at: "2026-11-07T15:48:50.027494+00:00",
    scope: "life",
    owner_id: "entity:nerin",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload: { record_id: ID, scope: "life", owner_id: "entity:nerin", search_state: "indexed", prompt_state: "inactive", lifecycle: "inactive_candidate", source: "remember", reason: null, binding_id: "b1", seq: 5792 },
    display: { record_id: ID, graph_id: ID, kind: "episode", title: "exchange: so why did you stop exploring the world ? you thought that by looking…", digest: OLD_MECHANICAL, digest_method: "mechanical-v2", digest_version: 0 },
  } as unknown as ReplayEnvelope,
]);
const node = fold.nodes.get(ID)!;

const html = (summary: Parameters<typeof CardSummaryBlock>[0]["summary"]) => renderToStaticMarkup(<CardSummaryBlock summary={summary} />);

describe("the hover card on a backfilled memory", () => {
  it("the read holds the record's current understanding (served), not just its words", () => {
    const w = hoverWordsOf(recordWords(READ_BODY));
    expect(w.phase).toBe("ready");
    if (w.phase !== "ready") return;
    expect(w.served?.digest).toBe(CURRENT);
    expect(w.served?.digest_version).toBe(1);
    // An older gateway (no understanding keys): words only, served null.
    const old = hoverWordsOf(recordWords({ record_id: ID, text: "person:admin:\nhi\n\nnerin:\nhello" }));
    expect(old).toEqual({ phase: "ready", text: "person:admin:\nhi\n\nnerin:\nhello", served: null });
    // Neither words nor a stored summary: nothing to show, said so.
    expect(hoverWordsOf(recordWords({ ...READ_BODY, text: "", digest: null })).phase).toBe("none");
  });

  it("shows the current understanding through the shared renderer, its provenance under it — the mechanical text gone", () => {
    const out = html(cardSummary(node, hoverWordsOf(recordWords(READ_BODY)), "nerin", "UTC"));
    // Exactly what the shared renderer draws for the served digest.
    expect(out).toContain(renderToStaticMarkup(<Words text={CURRENT} className="gc_hc_summary" />));
    expect(out).toContain("<strong>eight sites</strong>");
    expect(out).toContain(renderToStaticMarkup(<WordsLine text="a passive memory process, part of him (qwen/qwen3.8-27b) · backfilled · 7 Nov 2026" className="gc_hc_prov" />));
    expect(out).not.toContain("person:admin");
    expect(out).not.toContain("###");
    expect(out).not.toContain(PLACEHOLDER_WORDS);
  });

  it("while the read is under way: the fold's reading as held, marked a placeholder", () => {
    const out = html(cardSummary(node, { phase: "reading" }, "nerin", "UTC"));
    expect(out).toContain(renderToStaticMarkup(<Words text={OLD_MECHANICAL} className="gc_hc_summary" />));
    expect(out).toContain(renderToStaticMarkup(<WordsLine text={PLACEHOLDER_WORDS} className="gc_hc_prov" />));
  });

  it("every note in the summary block goes through the shared renderer", () => {
    expect(html({ kind: "reading" })).toBe(renderToStaticMarkup(<WordsLine text="reading his words…" className="gc_hc_quiet" />));
    expect(html({ kind: "none", text: "no words are kept for this memory" })).toBe(renderToStaticMarkup(<WordsLine text="no words are kept for this memory" className="gc_hc_quiet" />));
    const floor = html({ kind: "floor", name: "housing", lines: ["12 lived memories"], threads: ["**refugees**"], feeling: null, provenance: null });
    expect(floor).toContain(renderToStaticMarkup(<WordsLine text="12 lived memories" />));
    expect(floor).toContain("<strong>refugees</strong>");
  });
});
