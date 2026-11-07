/**
 * The graph's hover cards — which text they lead with. Built on the real
 * fold (bindings + a recall snapshot carrying digests, the way the stream
 * serves them), never on hand-made nodes.
 */
import { describe, expect, it } from "vitest";

import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { markdownTitle, nodeCardText, placeCard, plainLabel, topicExemplarText } from "./hover_card";

function env(seq: number, family: ReplayEnvelope["family"], payload: Record<string, unknown>, display?: Record<string, unknown>): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family,
    observed_at: "2026-11-07T10:00:00+00:00",
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload,
    display: display as ReplayEnvelope["display"],
  } as ReplayEnvelope;
}

function binding(seq: number, id: string, kind: string, title: string, extra: Record<string, unknown> = {}): ReplayEnvelope {
  return env(
    seq,
    "binding",
    { record_id: id, scope: "life", owner_id: "entity:test", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    { record_id: id, kind, title, ...extra },
  );
}

function snapshot(seq: number, rows: Array<{ record_id: string; title: string; digest: string }>): ReplayEnvelope {
  return env(seq, "snapshot", { snapshot_id: `s${seq}`, trace_id: "tr1", used_record_ids: rows.map((r) => r.record_id), display: rows, prompt_token_estimate: 100, seq });
}

const DIGEST = "person:admin: what did WHO say? nerin: WHO’s **30 July** update says the outbreak is over.\n\n- **Uganda:** declared over on 28 July";

const life = [
  binding(1, "ex:episode-a", "episode", "exchange: WHO’s **30 July** update says Uganda declared…"),
  binding(2, "ex:memory-b", "memory", "the media server"),
  binding(3, "ex:diary-c", "diary", "the bridges were real", { diary: true }),
  binding(4, "ex:memory-d", "memory", ""),
  snapshot(10, [
    { record_id: "ex:episode-a", title: "exchange: WHO…", digest: DIGEST },
    { record_id: "ex:diary-c", title: "diary", digest: "private words" },
  ]),
];

describe("nodeCardText", () => {
  it("leads with the title (scaffolding stripped, Markdown kept) and the full summary", () => {
    const fold = foldEnvelopes(life);
    const t = nodeCardText(fold.nodes.get("ex:episode-a")!);
    expect(t.title).toBe("WHO’s **30 July** update says Uganda declared…");
    expect(t.summary).toBe(DIGEST); // in full, newlines and list kept
  });

  it("no summary before a recall served one (absent, never invented)", () => {
    const before = foldEnvelopes(life, 4);
    expect(nodeCardText(before.nodes.get("ex:episode-a")!).summary).toBeNull();
    expect(nodeCardText(before.nodes.get("ex:memory-b")!)).toEqual({ title: "the media server", summary: null });
  });

  it("a diary entry never shows its words; a private one reads 'a diary entry'", () => {
    const fold = foldEnvelopes(life);
    const diary = fold.nodes.get("ex:diary-c")!;
    expect(nodeCardText(diary).summary).toBeNull();
    const redacted = foldEnvelopes([binding(1, "ex:diary-z", "memory", "x")]).nodes.get("ex:diary-z")!;
    expect(redacted.redacted).toBe(true);
    expect(nodeCardText(redacted)).toEqual({ title: "a diary entry", summary: null });
  });

  it("the card keeps its own guard: a digest on a diary node (the fold never keeps one) is not shown", () => {
    // An operator-audience diary node (its gist as title, not redacted).
    const diary = foldEnvelopes(life, 4).nodes.get("ex:diary-c")!;
    expect(diary.diary && !diary.redacted).toBe(true);
    expect(diary.digest ?? null).toBeNull(); // the fold's rule
    expect(nodeCardText({ ...diary, digest: "private words" })).toEqual({ title: "the bridges were real", summary: null });
  });

  it("a multi-line title keeps its lines: a heading stays a heading (never a raw '###' mid-line)", () => {
    const raw = "exchange: North America housing pass — what is now supported\n### United States\n- **HUD:** the 2026 count";
    expect(markdownTitle(raw)).toBe("North America housing pass — what is now supported\n### United States\n- **HUD:** the 2026 count");
    const fold = foldEnvelopes([binding(1, "ex:episode-h", "episode", raw)]);
    expect(nodeCardText(fold.nodes.get("ex:episode-h")!).title.split("\n")[1]).toBe("### United States");
  });

  it("an untitled record shows its id's head", () => {
    const fold = foldEnvelopes(life);
    expect(nodeCardText(fold.nodes.get("ex:memory-d")!).title).toBe("ex:memory-d");
  });

  it("a summary equal to the title is not said twice", () => {
    const fold = foldEnvelopes([binding(1, "ex:memory-e", "memory", "one line"), snapshot(5, [{ record_id: "ex:memory-e", title: "one line", digest: "one line" }])]);
    expect(nodeCardText(fold.nodes.get("ex:memory-e")!).summary).toBeNull();
  });
});

describe("topicExemplarText", () => {
  const fold = foldEnvelopes(life);
  it("the exemplar by its summary when the fold holds it, else its title", () => {
    expect(topicExemplarText(fold, "ex:episode-a", "ignored")).toBe(DIGEST);
    expect(topicExemplarText(fold, "ex:memory-b", "ignored")).toBe("the media server");
  });

  it("never a diary entry's words — in the fold or not", () => {
    expect(topicExemplarText(fold, "ex:diary-c", "the bridges were real")).toBeNull();
    expect(topicExemplarText(fold, "ex:diary-unseen", "private")).toBeNull();
  });

  it("an exemplar not in the fold yet: the payload's title, scaffolding stripped", () => {
    expect(topicExemplarText(fold, "ex:memory-later", "lesson: keep the record honest")).toBe("keep the record honest");
    expect(topicExemplarText(fold, "ex:memory-later", "")).toBeNull();
  });
});

describe("placeCard", () => {
  it("beside the cursor when it fits", () => {
    expect(placeCard(100, 100, 420, 200, 1600, 1000)).toEqual({ left: 116, top: 112 });
  });

  it("kept whole inside the viewport — a tall summary or a 400 px phone", () => {
    expect(placeCard(1500, 900, 420, 300, 1600, 1000)).toEqual({ left: 1172, top: 692 });
    expect(placeCard(300, 100, 384, 200, 400, 860)).toEqual({ left: 8, top: 112 });
    expect(placeCard(10, 10, 420, 2000, 1600, 1000).top).toBe(8);
  });
});

describe("plainLabel", () => {
  it("canvas text shows the words without Markdown markers", () => {
    expect(plainLabel("**Lookup failure:** I searched for *Social Panorama* 2026…")).toBe("Lookup failure: I searched for Social Panorama 2026…");
    expect(plainLabel("North America housing\n### United States\n- **HUD:** the `2026` count")).toBe("North America housing United States HUD: the 2026 count");
  });

  it("leaves snake_case words and arithmetic alone", () => {
    expect(plainLabel("web_search continues, bridge_index")).toBe("web_search continues, bridge_index");
    expect(plainLabel("2 * 3 = 6")).toBe("2 * 3 = 6");
  });
});
