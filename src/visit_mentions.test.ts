/**
 * `@entity` mentions in the visit chat (operator 2026-11-08; gateway contract
 * untracked/entity-mentions-2026-11-08/CONTRACT-mentions.md): the `@` list (GET /entities minus
 * the entity being visited), the per-mention outcome rule (409 skip, 503 back to the composer,
 * 404 this one / the whole gateway), the sequential run (each mention after the previous
 * answered, in pick order), where else a reply was said (mirrors), and the transport
 * (POST /sessions/{id}/mentions with repeat_of; the codes decide a 404).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMention, ChatMentionSent } from "@abstractframework/panel-chat";

import {
  MENTIONS_UNAVAILABLE,
  chipsToRestore,
  mentionCandidatesFor,
  mentionMirrors,
  mentionNotice,
  mentionOutcome,
  mirrorLine,
  runMentions,
  visitMentionProps,
  type MentionableEntity,
} from "./visit_mentions";
import { listEntities, postMention, type MentionWire } from "./stream_source";
import { avatarVisitHistory, publicVisitMessages } from "./avatar_visit";

const ROWS: MentionableEntity[] = [
  { name: "Nerin", slug: "nerin", avatar: { style: "watch-halo", color: "#2a9d8f" } },
  { name: "Castor", slug: "castor", avatar: null },
  { name: "Pollux", slug: "pollux", avatar: { style: null, color: "#e76f51" } },
  { name: "Polaris", slug: "polaris" },
];

const CASTOR = { name: "Castor", slug: "castor" };
const AUTHOR = { kind: "entity", name: "Castor", entity_id: "ent-castor", identity_ref: "entity:castor#3", avatar: { style: "watch-halo", color: "#2a9d8f" } };
const sent = (id: string, name: string, index: number): ChatMentionSent => ({ id, name, kind: "entity", index });
const ok = (reply: string, author: unknown = AUTHOR, mirrors: unknown = []): MentionWire => ({ status: 200, body: { run_id: "r", reply, author, mention_index: 0, mirrors }, code: null });
const refused = (status: number, code: string | null, detail?: string): MentionWire => ({ status, body: detail ? { detail, ...(code ? { code } : {}) } : null, code });

describe("the @ list", () => {
  it("offers every entity the account sees except the one being visited, with its look", () => {
    const out = mentionCandidatesFor(ROWS, "nerin", "");
    expect(out.map((c) => c.id)).toEqual(["castor", "pollux", "polaris"]);
    expect(out.every((c) => c.kind === "entity")).toBe(true);
    expect(out.find((c) => c.id === "pollux")!.avatar).toEqual({ style: null, color: "#e76f51" });
    expect("avatar" in out.find((c) => c.id === "castor")!).toBe(false);
  });

  it("the visited entity is recognised by its slug or its name, in any case", () => {
    expect(mentionCandidatesFor(ROWS, "NERIN", "").some((c) => c.id === "nerin")).toBe(false);
    expect(mentionCandidatesFor([{ name: "Nerin", slug: "nerin-2" }, CASTOR], "nerin", "").map((c) => c.id)).toEqual(["castor"]);
  });

  it("the typed query keeps the names (or slugs) it starts, any case; the refused ones are gone", () => {
    expect(mentionCandidatesFor(ROWS, "nerin", "pol").map((c) => c.name)).toEqual(["Pollux", "Polaris"]);
    expect(mentionCandidatesFor(ROWS, "nerin", "CAS").map((c) => c.name)).toEqual(["Castor"]);
    expect(mentionCandidatesFor(ROWS, "nerin", "lux")).toEqual([]);
    expect(mentionCandidatesFor(ROWS, "nerin", "pol", new Set(["pollux"])).map((c) => c.name)).toEqual(["Polaris"]);
  });

  it("a row without a slug is not offered; a row without a name shows its slug", () => {
    expect(mentionCandidatesFor([{ name: "Ghost", slug: "" }, { name: "", slug: "vega" }], "nerin", "")).toEqual([{ id: "vega", name: "vega", kind: "entity" }]);
  });

  it("the first-use notice names who will read the conversation", () => {
    expect(mentionNotice({ name: "Castor" })).toBe("Castor will read this conversation's history");
  });
});

describe("one mention's answer", () => {
  it("200: the reply and its author", () => {
    expect(mentionOutcome("Castor", ok("Hello from Castor."))).toEqual({ kind: "reply", reply: "Hello from Castor.", author: AUTHOR, mirrors: [] });
    expect(mentionOutcome("Castor", ok("Hi.", null))).toEqual({ kind: "reply", reply: "Hi.", author: null, mirrors: [] });
    expect(mentionOutcome("Castor", ok("  ")).kind).toBe("failed");
    const mirrored = mentionOutcome("Castor", ok("Hi.", AUTHOR, [{ entity_id: "ent-nerin", run_id: "v1", turn_id: "t2", reply: "Thanks, Castor." }]));
    expect(mirrored.kind === "reply" ? mirrored.mirrors : null).toEqual([{ entityId: "ent-nerin", error: null }]);
  });

  it("409: in another conversation (the door's own 409s say their sentence), skipped", () => {
    expect(mentionOutcome("Castor", refused(409, "in_another_conversation", "Castor is in another conversation (session s-9). One conversation at a time…"))).toEqual({ kind: "elsewhere", sentence: "Castor is in another conversation." });
    expect(mentionOutcome("Castor", refused(409, "entity_paused", "Castor is paused."))).toEqual({ kind: "elsewhere", sentence: "Castor is paused." });
    expect(mentionOutcome("Castor", refused(409, null))).toEqual({ kind: "elsewhere", sentence: "Castor is in another conversation." });
  });

  it("503: the gateway's sentence, and the message goes back to the composer", () => {
    expect(mentionOutcome("Castor", refused(503, "entity_cannot_answer", "Castor cannot answer: no mind is set."))).toEqual({ kind: "cannot_answer", sentence: "Castor cannot answer: no mind is set. Your message is back in the composer." });
    expect(mentionOutcome("Castor", refused(503, null)).kind).toBe("cannot_answer");
  });

  it("404 entity_not_found: this entity cannot be mentioned; a 404 without that code: no mentions route", () => {
    expect(mentionOutcome("Castor", refused(404, "entity_not_found", "entity 'castor' not found"))).toEqual({ kind: "not_offerable", sentence: "Castor cannot be mentioned here." });
    expect(mentionOutcome("Castor", refused(404, null, "Not Found"))).toEqual({ kind: "route_missing" });
    expect(mentionOutcome("Castor", refused(404, null))).toEqual({ kind: "route_missing" });
  });

  it("422 repeat_of_unknown: the gateway's sentence, the message back", () => {
    expect(mentionOutcome("Castor", refused(422, "repeat_of_unknown", "repeat_of 'r-1' is not a turn of this conversation"))).toEqual({ kind: "failed", sentence: "repeat_of 'r-1' is not a turn of this conversation Your message is back in the composer." });
  });

  it("anything else stops with the gateway's words", () => {
    expect(mentionOutcome("Castor", refused(500, null, "boom"))).toEqual({ kind: "failed", sentence: "Castor did not answer: boom. Your message is back in the composer." });
    expect(mentionOutcome("Castor", refused(422, null)).sentence).toContain("HTTP 422");
  });
});

/** A post the test answers by hand, recording the calls in the order they started. */
function manualPost() {
  const calls: ChatMentionSent[] = [];
  const pending: Array<(w: MentionWire) => void> = [];
  return {
    calls,
    answer: (w: MentionWire) => pending.shift()!(w),
    post: (m: ChatMentionSent) => {
      calls.push(m);
      return new Promise<MentionWire>((resolve) => pending.push(resolve));
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("the mentions of one message", () => {
  it("run one after the other, in pick order: the next starts only once the previous answered", async () => {
    const p = manualPost();
    const replies: string[] = [];
    const run = runMentions([sent("pollux", "Pollux", 1), sent("castor", "Castor", 0)], {
      post: p.post,
      onReply: (m, reply, author, mirrors) => replies.push(`${m.name}:${reply}:${author?.name ?? "-"}:${mirrors.map((x) => x.entityId).join(",")}`),
    });
    await tick();
    expect(p.calls.map((m) => m.id)).toEqual(["castor"]);
    p.answer(ok("one"));
    await tick();
    // Castor's reply is on screen before Pollux is asked (Pollux reads it).
    expect(replies).toEqual(["Castor:one:Castor:"]);
    expect(p.calls.map((m) => m.id)).toEqual(["castor", "pollux"]);
    p.answer(ok("two", { ...AUTHOR, name: "Pollux" }, [{ entity_id: "ent-nerin", run_id: "v1", turn_id: "t3", reply: "ok" }]));
    expect(await run).toEqual({ sentences: [], keepDraft: false, unsent: [], unavailable: false, refused: [] });
    expect(replies).toEqual(["Castor:one:Castor:", "Pollux:two:Pollux:ent-nerin"]);
  });

  it("a 409 is said and the next one still runs", async () => {
    const answers = [refused(409, "in_another_conversation", "x"), ok("here")];
    const posted: string[] = [];
    const out = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], {
      post: async (m) => (posted.push(m.id), answers.shift()!),
      onReply: () => undefined,
    });
    expect(posted).toEqual(["castor", "pollux"]);
    expect(out).toEqual({ sentences: ["Castor is in another conversation."], keepDraft: false, unsent: [], unavailable: false, refused: [] });
  });

  it("a 503 stops: the message and the mentions not run go back", async () => {
    const answers = [ok("first"), refused(503, "entity_cannot_answer", "Pollux cannot answer: asleep."), ok("never")];
    const posted: string[] = [];
    const out = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1), sent("polaris", "Polaris", 2)], {
      post: async (m) => (posted.push(m.id), answers.shift()!),
      onReply: () => undefined,
    });
    expect(posted).toEqual(["castor", "pollux"]);
    expect(out.keepDraft).toBe(true);
    expect(out.unsent.map((m) => m.id)).toEqual(["pollux", "polaris"]);
    expect(out.sentences).toEqual(["Pollux cannot answer: asleep. Your message is back in the composer."]);
  });

  it("404 entity_not_found: that entity is no longer offered, the next still runs", async () => {
    const out = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], {
      post: async () => refused(404, "entity_not_found", "entity not found"),
      onReply: () => undefined,
    });
    expect(out.refused).toEqual(["castor", "pollux"]);
    expect(out.keepDraft).toBe(false);
    expect(out.sentences).toEqual(["Castor cannot be mentioned here.", "Pollux cannot be mentioned here."]);
  });

  it("no route (a 404 without entity_not_found): the one sentence, mentions off, nothing more is sent", async () => {
    const posted: string[] = [];
    const out = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], {
      post: async (m) => (posted.push(m.id), refused(404, null, "Not Found")),
      onReply: () => undefined,
    });
    expect(posted).toEqual(["castor"]);
    expect(out).toEqual({ sentences: [MENTIONS_UNAVAILABLE], keepDraft: false, unsent: [], unavailable: true, refused: [] });
  });

  it("where else a reply was said: one small line, by name; a refusal there is stated", () => {
    expect(mentionMirrors([{ entity_id: "ent-nerin", run_id: "v", turn_id: "t", reply: "x" }, { entity_id: "ent-vega", run_id: "w", error: "Vega is paused." }, { run_id: "no-id" }, null])).toEqual([
      { entityId: "ent-nerin", error: null },
      { entityId: "ent-vega", error: "Vega is paused." },
    ]);
    expect(mentionMirrors(undefined)).toEqual([]);
    const names: Record<string, string> = { "ent-nerin": "Nerin", "ent-pollux": "Pollux" };
    const nameOf = (id: string) => names[id] ?? null;
    expect(mirrorLine([], nameOf)).toBeNull();
    expect(mirrorLine([{ entityId: "ent-nerin", error: null }], nameOf)).toBe("Also said to Nerin.");
    expect(mirrorLine([{ entityId: "ent-nerin", error: null }, { entityId: "ent-pollux", error: null }], nameOf)).toBe("Also said to Nerin and Pollux.");
    // An id the list does not name is shown as served, never guessed.
    expect(mirrorLine([{ entityId: "ent-nerin", error: null }, { entityId: "ent-vega", error: "Vega is paused." }], nameOf)).toBe("Also said to Nerin. Not said to ent-vega: Vega is paused.");
  });

  it("an unreachable gateway stops the run and hands everything back", async () => {
    const out = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], {
      post: async () => { throw new Error("Failed to fetch"); },
      onReply: () => undefined,
    });
    expect(out.keepDraft).toBe(true);
    expect(out.unsent.map((m) => m.id)).toEqual(["castor", "pollux"]);
    expect(out.sentences[0]).toBe("Castor could not be reached: Failed to fetch. Your message is back in the composer.");
  });

  it("the chips put back are the picked ones that did not run, with their looks", () => {
    const chips: ChatMention[] = [
      { id: "castor", name: "Castor", kind: "entity" },
      { id: "pollux", name: "Pollux", kind: "entity", avatar: { style: null, color: "#e76f51" } },
    ];
    expect(chipsToRestore(chips, [sent("pollux", "Pollux", 1)])).toEqual([chips[1]]);
    expect(chipsToRestore(chips, [])).toEqual([]);
  });
});

describe("the composer's mention props", () => {
  it("none without a session (an older door): the composer is today's", () => {
    expect(visitMentionProps({ sessionKey: null, candidates: async () => [], chips: [], onChipsChange: () => undefined, unavailable: null, status: null })).toEqual({});
  });

  it("with a session: the list, controlled chips, the notice, the key, the sentences", () => {
    const candidates = async () => [];
    const onChipsChange = () => undefined;
    const props = visitMentionProps({ sessionKey: "visit:s-1", candidates, chips: [], onChipsChange, unavailable: MENTIONS_UNAVAILABLE, status: "Castor is in another conversation." });
    expect(props.mentionCandidates).toBe(candidates);
    expect(props.onMentionsChange).toBe(onChipsChange);
    expect(props.mentions).toEqual([]);
    expect(props.mentionSessionKey).toBe("visit:s-1");
    expect(props.mentionNotice?.({ id: "castor", name: "Castor", kind: "entity" })).toBe("Castor will read this conversation's history");
    expect(props.mentionsUnavailable).toBe(MENTIONS_UNAVAILABLE);
    expect(props.mentionStatus).toBe("Castor is in another conversation.");
  });
});

describe("the transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POST /sessions/{id}/mentions with {entity, text, mention_index}; the code from the body, else the header", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return seen.length === 1
        ? new Response(JSON.stringify({ detail: "Castor is in another conversation.", code: "in_another_conversation", session_id: "s-9" }), { status: 409 })
        : new Response(JSON.stringify({ detail: "Castor cannot answer: x" }), { status: 503, headers: { "X-Gateway-Error-Code": "entity_cannot_answer" } });
    }));
    const first = await postMention("http://gw", "visit castor/1", { entity: "castor", text: "hi @all", mention_index: 2 }, "tok");
    expect(seen[0].url).toBe("http://gw/api/gateway/sessions/visit%20castor%2F1/mentions");
    expect(seen[0].init.method).toBe("POST");
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ entity: "castor", text: "hi @all", mention_index: 2 });
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(first).toEqual({ status: 409, body: { detail: "Castor is in another conversation.", code: "in_another_conversation", session_id: "s-9" }, code: "in_another_conversation" });
    const second = await postMention("http://gw", "s-1", { entity: "castor", text: "hi", mention_index: 0, repeat_of: "run-turn-1" }, null);
    expect(second.code).toBe("entity_cannot_answer");
    expect(second.status).toBe(503);
    expect(JSON.parse(String(seen[1].init.body))).toEqual({ entity: "castor", text: "hi", mention_index: 0, repeat_of: "run-turn-1" });
    expect("repeat_of" in JSON.parse(String(seen[0].init.body))).toBe(false);
  });

  it("a body that is not JSON is null, not a throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
    expect(await postMention("http://gw", "s-1", { entity: "castor", text: "hi", mention_index: 0 }, null)).toEqual({ status: 502, body: null, code: null });
  });

  it("GET /entities rows carry the identity look the list draws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ entities: [
      { name: "Castor", slug: "castor", identity: { rev: 3, avatar: { style: "watch-halo", color: "#2a9d8f", watch_code: "h" } } },
      { name: "Pollux", slug: "pollux", entity_id: "ent-pollux", identity: null },
    ] }), { status: 200 })));
    const rows = await listEntities("http://gw");
    expect(rows.map((r) => r.avatar)).toEqual([{ style: "watch-halo", color: "#2a9d8f" }, null]);
    expect(rows.map((r) => r.entity_id)).toEqual([undefined, "ent-pollux"]);
  });
});

describe("the avatar view keeps who answered", () => {
  it("an answer keeps its author; the person's turn never carries one", () => {
    const out = avatarVisitHistory([
      { id: "u1", role: "user", content: "hello", author: AUTHOR as never },
      { id: "a1", role: "assistant", content: "Hello from Castor.", author: AUTHOR as never },
      { id: "a2", role: "assistant", content: "Plain." },
    ], [], "run-1");
    expect(out.find((m) => m.id === "a1")!.author).toEqual(AUTHOR);
    expect("author" in out.find((m) => m.id === "u1")!).toBe(false);
    expect("author" in out.find((m) => m.id === "a2")!).toBe(false);
  });

  it("a live update is labelled from the view as it streams (its author), none when the view names nobody", () => {
    const update = (id: string, extra: Record<string, unknown> = {}) => ({ id, text: `update ${id}`, run_id: "flow-root", source_call_ids: ["c"], iteration: 1, ...extra });
    const rows = publicVisitMessages({ run_id: "flow-root", public_updates: [update("u1", { author: AUTHOR }), update("u2"), update("u3", { author: { kind: "robot" } })] });
    expect(rows.find((m) => m.id.endsWith("u1"))!.author).toEqual(AUTHOR);
    expect("author" in rows.find((m) => m.id.endsWith("u2"))!).toBe(false);
    expect("author" in rows.find((m) => m.id.endsWith("u3"))!).toBe(false);
  });
});
