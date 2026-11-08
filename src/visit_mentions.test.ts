/**
 * `@entity` mentions in the visit chat (operator 2026-11-08; gateway contract
 * untracked/entity-mentions-2026-11-08/CONTRACT-mentions.md): the `@` list (GET /entities minus
 * the entity being visited), the per-mention outcome rule (409 skip, 503 back to the composer,
 * 404 this one / the whole gateway), the sequential run (each mention after the previous
 * answered, in pick order), and the transport (POST /sessions/{id}/mentions; the route probe).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMention, ChatMentionSent } from "@abstractframework/panel-chat";

import {
  MENTIONS_UNAVAILABLE,
  chipsToRestore,
  mentionCandidatesFor,
  mentionNotice,
  mentionOutcome,
  runMentions,
  visitMentionProps,
  type MentionableEntity,
} from "./visit_mentions";
import { listEntities, postMention, probeMentionRoute, type MentionWire } from "./stream_source";
import { avatarVisitHistory } from "./avatar_visit";

const ROWS: MentionableEntity[] = [
  { name: "Nerin", slug: "nerin", avatar: { style: "watch-halo", color: "#2a9d8f" } },
  { name: "Castor", slug: "castor", avatar: null },
  { name: "Pollux", slug: "pollux", avatar: { style: null, color: "#e76f51" } },
  { name: "Polaris", slug: "polaris" },
];

const CASTOR = { name: "Castor", slug: "castor" };
const AUTHOR = { kind: "entity", name: "Castor", entity_id: "ent-castor", identity_ref: "entity:castor#3", avatar: { style: "watch-halo", color: "#2a9d8f" } };
const sent = (id: string, name: string, index: number): ChatMentionSent => ({ id, name, kind: "entity", index });
const ok = (reply: string, author: unknown = AUTHOR): MentionWire => ({ status: 200, body: { run_id: "r", reply, author, mention_index: 0 }, code: null });
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
    expect(mentionOutcome("Castor", ok("Hello from Castor."), true)).toEqual({ kind: "reply", reply: "Hello from Castor.", author: AUTHOR });
    expect(mentionOutcome("Castor", ok("Hi.", null), true)).toEqual({ kind: "reply", reply: "Hi.", author: null });
    expect(mentionOutcome("Castor", ok("  "), true).kind).toBe("failed");
  });

  it("409: in another conversation (the door's own 409s say their sentence), skipped", () => {
    expect(mentionOutcome("Castor", refused(409, "in_another_conversation", "Castor is in another conversation (session s-9). One conversation at a time…"), true)).toEqual({ kind: "elsewhere", sentence: "Castor is in another conversation." });
    expect(mentionOutcome("Castor", refused(409, "entity_paused", "Castor is paused."), true)).toEqual({ kind: "elsewhere", sentence: "Castor is paused." });
    expect(mentionOutcome("Castor", refused(409, null), true)).toEqual({ kind: "elsewhere", sentence: "Castor is in another conversation." });
  });

  it("503: the gateway's sentence, and the message goes back to the composer", () => {
    expect(mentionOutcome("Castor", refused(503, "entity_cannot_answer", "Castor cannot answer: no mind is set."), true)).toEqual({ kind: "cannot_answer", sentence: "Castor cannot answer: no mind is set. Your message is back in the composer." });
    expect(mentionOutcome("Castor", refused(503, null), true).kind).toBe("cannot_answer");
  });

  it("404: this entity cannot be mentioned, unless the gateway has no mentions route", () => {
    expect(mentionOutcome("Castor", refused(404, null, "entity 'castor' not found"), true)).toEqual({ kind: "not_offerable", sentence: "Castor cannot be mentioned here." });
    expect(mentionOutcome("Castor", refused(404, null, "Not Found"), false)).toEqual({ kind: "route_missing" });
    // Not known: the one entity, never the whole gateway.
    expect(mentionOutcome("Castor", refused(404, null), null).kind).toBe("not_offerable");
  });

  it("anything else stops with the gateway's words", () => {
    expect(mentionOutcome("Castor", refused(500, null, "boom"), true)).toEqual({ kind: "failed", sentence: "Castor did not answer: boom. Your message is back in the composer." });
    expect(mentionOutcome("Castor", refused(422, null), true).sentence).toContain("HTTP 422");
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
      routeOffered: async () => true,
      onReply: (m, reply, author) => replies.push(`${m.name}:${reply}:${author?.name ?? "-"}`),
    });
    await tick();
    expect(p.calls.map((m) => m.id)).toEqual(["castor"]);
    p.answer(ok("one"));
    await tick();
    // Castor's reply is on screen before Pollux is asked (Pollux reads it).
    expect(replies).toEqual(["Castor:one:Castor"]);
    expect(p.calls.map((m) => m.id)).toEqual(["castor", "pollux"]);
    p.answer(ok("two", { ...AUTHOR, name: "Pollux" }));
    expect(await run).toEqual({ sentences: [], keepDraft: false, unsent: [], unavailable: false, refused: [] });
    expect(replies).toEqual(["Castor:one:Castor", "Pollux:two:Pollux"]);
  });

  it("a 409 is said and the next one still runs", async () => {
    const answers = [refused(409, "in_another_conversation", "x"), ok("here")];
    const posted: string[] = [];
    const out = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], {
      post: async (m) => (posted.push(m.id), answers.shift()!),
      routeOffered: async () => true,
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
      routeOffered: async () => true,
      onReply: () => undefined,
    });
    expect(posted).toEqual(["castor", "pollux"]);
    expect(out.keepDraft).toBe(true);
    expect(out.unsent.map((m) => m.id)).toEqual(["pollux", "polaris"]);
    expect(out.sentences).toEqual(["Pollux cannot answer: asleep. Your message is back in the composer."]);
  });

  it("a 404 asks the gateway once whether it has the route: yes = that entity is no longer offered", async () => {
    const probe = vi.fn(async () => true);
    const out = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], {
      post: async () => refused(404, null, "entity not found"),
      routeOffered: probe,
      onReply: () => undefined,
    });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(out.refused).toEqual(["castor", "pollux"]);
    expect(out.keepDraft).toBe(false);
    expect(out.sentences).toEqual(["Castor cannot be mentioned here.", "Pollux cannot be mentioned here."]);
  });

  it("no route: the one sentence, mentions off, nothing more is sent", async () => {
    const posted: string[] = [];
    const out = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], {
      post: async (m) => (posted.push(m.id), refused(404, null, "Not Found")),
      routeOffered: async () => false,
      onReply: () => undefined,
    });
    expect(posted).toEqual(["castor"]);
    expect(out).toEqual({ sentences: [MENTIONS_UNAVAILABLE], keepDraft: false, unsent: [], unavailable: true, refused: [] });
  });

  it("a successful run never asks for the route", async () => {
    const probe = vi.fn(async () => true);
    await runMentions([sent("castor", "Castor", 0)], { post: async () => ok("hi"), routeOffered: probe, onReply: () => undefined });
    expect(probe).not.toHaveBeenCalled();
  });

  it("an unreachable gateway stops the run and hands everything back", async () => {
    const out = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], {
      post: async () => { throw new Error("Failed to fetch"); },
      routeOffered: async () => true,
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
    const second = await postMention("http://gw", "s-1", { entity: "castor", text: "hi", mention_index: 0 }, null);
    expect(second.code).toBe("entity_cannot_answer");
    expect(second.status).toBe(503);
  });

  it("a body that is not JSON is null, not a throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
    expect(await postMention("http://gw", "s-1", { entity: "castor", text: "hi", mention_index: 0 }, null)).toEqual({ status: 502, body: null, code: null });
  });

  it("the route probe asks by method: 405 = offered, 404 = absent, anything else unknown", async () => {
    const statuses = [405, 404, 401];
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(`${init?.method || "GET"} ${url}`);
      return new Response("{}", { status: statuses.shift()! });
    }));
    expect(await probeMentionRoute("http://gw")).toBe("offered");
    expect(await probeMentionRoute("http://gw")).toBe("absent");
    expect(await probeMentionRoute("http://gw")).toBe("unknown");
    expect(urls[0]).toBe("GET http://gw/api/gateway/sessions/mention-route-probe/mentions");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await probeMentionRoute("http://gw")).toBe("unknown");
  });

  it("GET /entities rows carry the identity look the list draws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ entities: [
      { name: "Castor", slug: "castor", identity: { rev: 3, avatar: { style: "watch-halo", color: "#2a9d8f", watch_code: "h" } } },
      { name: "Pollux", slug: "pollux", identity: null },
    ] }), { status: 200 })));
    const rows = await listEntities("http://gw");
    expect(rows.map((r) => r.avatar)).toEqual([{ style: "watch-halo", color: "#2a9d8f" }, null]);
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
});
