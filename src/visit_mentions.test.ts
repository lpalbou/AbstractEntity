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
  alreadyAnsweredLine,
  chipsToRestore,
  flowMentionKey,
  heldAfterRun,
  meetOffers,
  mentionCandidatesFor,
  mentionMirrors,
  mentionNotice,
  mentionOutcome,
  mentionResendPlan,
  mirrorLine,
  orderedMentions,
  runMentions,
  visitMentionProps,
  type HeldMentions,
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

  it("404 entity_not_found: this entity cannot be mentioned; a 404 without a code: no mentions route", () => {
    expect(mentionOutcome("Castor", refused(404, "entity_not_found", "entity 'castor' not found"))).toEqual({ kind: "not_offerable", sentence: "Castor cannot be mentioned here." });
    expect(mentionOutcome("Castor", refused(404, null, "Not Found"))).toEqual({ kind: "route_missing" });
    expect(mentionOutcome("Castor", refused(404, null))).toEqual({ kind: "route_missing" });
  });

  it("an uncoded 405 is the route missing too (the door codes every refusal), never 'did not answer'", () => {
    expect(mentionOutcome("Castor", refused(405, null, "Method Not Allowed"))).toEqual({ kind: "route_missing" });
    expect(mentionOutcome("Castor", refused(405, null))).toEqual({ kind: "route_missing" });
  });

  it("a coded refusal is never read as a missing route: a 404 or 405 with another code fails with its words", () => {
    expect(mentionOutcome("Castor", refused(404, "session_not_found", "No such conversation."))).toEqual({ kind: "failed", sentence: "Castor did not answer: No such conversation.. Your message is back in the composer." });
    expect(mentionOutcome("Castor", refused(405, "method_not_allowed", "No.")).kind).toBe("failed");
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
    expect(await run).toEqual({ sentences: [], answered: [sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], keepDraft: false, unsent: [], unavailable: false, refused: [] });
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
    expect(out).toEqual({ sentences: ["Castor is in another conversation."], answered: [sent("pollux", "Pollux", 1)], keepDraft: false, unsent: [], unavailable: false, refused: [] });
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
    expect(out.answered.map((m) => m.id)).toEqual(["castor"]);
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
    expect(out).toEqual({ sentences: [MENTIONS_UNAVAILABLE], answered: [], keepDraft: false, unsent: [], unavailable: true, refused: [] });
  });

  it("no route on an older gateway that answers an uncoded 405: the same one sentence, nothing more sent", async () => {
    const posted: string[] = [];
    const out = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], {
      post: async (m) => (posted.push(m.id), refused(405, null, "Method Not Allowed")),
      onReply: () => undefined,
    });
    expect(posted).toEqual(["castor"]);
    expect(out).toEqual({ sentences: [MENTIONS_UNAVAILABLE], answered: [], keepDraft: false, unsent: [], unavailable: true, refused: [] });
  });

  it("an entity picked twice is asked once, at its first index", async () => {
    const posted: string[] = [];
    const out = await runMentions([sent("castor", "Castor", 2), sent("pollux", "Pollux", 1), sent("castor", "Castor", 0)], {
      post: async (m) => (posted.push(`${m.id}#${m.index}`), ok("yes")),
      onReply: () => undefined,
    });
    expect(posted).toEqual(["castor#0", "pollux#1"]);
    expect(out.answered.map((m) => `${m.id}#${m.index}`)).toEqual(["castor#0", "pollux#1"]);
    expect(orderedMentions([sent("pollux", "Pollux", 1), sent("pollux", "Pollux", 0)])).toEqual([sent("pollux", "Pollux", 0)]);
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

describe("the resend of a message whose mentions stopped partway", () => {
  const WORDS = "is the plan sound?";
  // Castor answered, Pollux could not (503): Polaris was not asked.
  const stopped = { keepDraft: true, answered: [sent("castor", "Castor", 0)], unsent: [sent("pollux", "Pollux", 1), sent("polaris", "Polaris", 2)] };
  const held = heldAfterRun("s-1", WORDS, "run-turn-1", stopped) as HeldMentions;

  it("a stop holds the words, the repeat_of, the mentions not answered (first index) and who answered", () => {
    expect(held).toEqual({ sessionId: "s-1", resend: { text: WORDS, repeatOf: "run-turn-1", unsent: [sent("pollux", "Pollux", 1), sent("polaris", "Polaris", 2)] }, answered: ["entity:castor"] });
    // The visit lane sends no repeat_of: held as null, resent as null.
    expect(heldAfterRun("s-1", WORDS, null, stopped)?.resend.repeatOf).toBeNull();
  });

  it("nothing is held when nothing stopped (all answered, a 409 skip, the route missing)", async () => {
    expect(heldAfterRun("s-1", WORDS, null, { answered: [sent("castor", "Castor", 0)], unsent: [] })).toBeNull();
    expect(heldAfterRun("s-1", WORDS, null, { answered: [], unsent: [] })).toBeNull();
    // From real runs: a 409 skip and an older gateway's missing route leave nothing to resend.
    for (const wire of [refused(409, "in_another_conversation", "x"), refused(404, null), refused(405, null)]) {
      const out = await runMentions([sent("castor", "Castor", 0)], { post: async () => wire, onReply: () => undefined });
      expect(heldAfterRun("s-1", WORDS, null, out)).toBeNull();
    }
  });

  it("the same words with the chips put back: ONLY those mentions, with their first index", () => {
    expect(mentionResendPlan(held, "s-1", WORDS, [sent("pollux", "Pollux", 0), sent("polaris", "Polaris", 1)])).toEqual({ ask: [sent("pollux", "Pollux", 1), sent("polaris", "Polaris", 2)], alreadyAnswered: [] });
    // Words compared trimmed; one chip removed: the other alone, still at its first index.
    expect(mentionResendPlan(held, "s-1", `  ${WORDS} `, [sent("polaris", "Polaris", 0)])).toEqual({ ask: [sent("polaris", "Polaris", 2)], alreadyAnswered: [] });
  });

  it("an entity that answered is never asked again, even picked again: it is said instead", () => {
    const plan = mentionResendPlan(held, "s-1", WORDS, [sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)]);
    expect(plan).toEqual({ ask: [sent("pollux", "Pollux", 1)], alreadyAnswered: [sent("castor", "Castor", 3)] });
    expect(mentionResendPlan(held, "s-1", WORDS, [sent("castor", "Castor", 0)])).toEqual({ ask: [], alreadyAnswered: [sent("castor", "Castor", 3)] });
    expect(alreadyAnsweredLine([sent("castor", "Castor", 3)])).toBe("Castor already answered this message.");
    expect(alreadyAnsweredLine([])).toBeNull();
  });

  it("a name added since is numbered after the held ones; a duplicate pick is asked once", () => {
    expect(mentionResendPlan(held, "s-1", WORDS, [sent("vega", "Vega", 0), sent("pollux", "Pollux", 1), sent("pollux", "Pollux", 2)])!.ask).toEqual([sent("pollux", "Pollux", 1), sent("vega", "Vega", 3)]);
  });

  it("different words, no chip, another conversation, or nothing held: a new message", () => {
    expect(mentionResendPlan(held, "s-1", "is the plan sound now?", [sent("pollux", "Pollux", 0)])).toBeNull();
    expect(mentionResendPlan(held, "s-1", WORDS, [])).toBeNull();
    expect(mentionResendPlan(held, "s-2", WORDS, [sent("pollux", "Pollux", 0)])).toBeNull();
    expect(mentionResendPlan(held, null, WORDS, [sent("pollux", "Pollux", 0)])).toBeNull();
    expect(mentionResendPlan(null, "s-1", WORDS, [sent("pollux", "Pollux", 0)])).toBeNull();
  });

  it("a resend that stops again keeps everyone who answered, across both sends", () => {
    const again = heldAfterRun("s-1", WORDS, "run-turn-1", { keepDraft: true, answered: [sent("pollux", "Pollux", 1)], unsent: [sent("polaris", "Polaris", 2)] }, held.answered)!;
    expect(again.answered).toEqual(["entity:castor", "entity:pollux"]);
    expect(again.resend.unsent).toEqual([sent("polaris", "Polaris", 2)]);
    expect(mentionResendPlan(again, "s-1", WORDS, [sent("pollux", "Pollux", 0), sent("polaris", "Polaris", 1)])).toEqual({ ask: [sent("polaris", "Polaris", 2)], alreadyAnswered: [sent("pollux", "Pollux", 3)] });
  });

  it("end to end: a 503 after Castor answered, then the same words again asks Pollux only, at index 1", async () => {
    const posted: string[] = [];
    const answers = [ok("Castor here."), refused(503, "entity_cannot_answer", "Pollux cannot answer: asleep."), ok("Pollux here.")];
    const post = async (m: ChatMentionSent) => (posted.push(`${m.id}#${m.index}`), answers.shift()!);
    const first = await runMentions([sent("castor", "Castor", 0), sent("pollux", "Pollux", 1)], { post, onReply: () => undefined });
    const kept = heldAfterRun("s-1", WORDS, null, first)!;
    const chips = chipsToRestore([{ id: "castor", name: "Castor", kind: "entity" }, { id: "pollux", name: "Pollux", kind: "entity" }], first.unsent);
    expect(chips.map((c) => c.id)).toEqual(["pollux"]);
    const plan = mentionResendPlan(kept, "s-1", WORDS, chips.map((c, index) => ({ id: c.id, name: c.name, kind: c.kind, index })))!;
    const second = await runMentions(plan.ask, { post, onReply: () => undefined });
    expect(posted).toEqual(["castor#0", "pollux#1", "pollux#1"]);
    expect(heldAfterRun("s-1", WORDS, null, second, kept.answered)).toBeNull();
  });
});

describe("the flow lane's mention key (the first-use notice is once per conversation)", () => {
  it("kept when the first message mints the session id", () => {
    let n = 0;
    const fresh = () => `new:${++n}`;
    const started = flowMentionKey(null, true, null, fresh);
    expect(started).toBe("flow:new:1");
    expect(flowMentionKey(started, true, "flow-session-abc", fresh)).toBe("flow:new:1");
  });

  it("a resumed conversation is keyed by its stored session; an ended one has none, the next a new key", () => {
    let n = 0;
    const fresh = () => `new:${++n}`;
    expect(flowMentionKey(null, true, "stored-1", fresh)).toBe("flow:stored-1");
    expect(flowMentionKey("flow:new:1", false, "flow-session-abc", fresh)).toBeNull();
    expect(flowMentionKey(null, true, null, fresh)).toBe("flow:new:1");
    expect(flowMentionKey(null, true, null, fresh)).toBe("flow:new:2");
  });
});

describe("the meet offer (structured: from a picked chip, never from the typed words)", () => {
  it("each picked entity once, by its slug and name; an agent chip offers no meet", () => {
    expect(meetOffers([
      { id: "pollux", name: "Pollux", kind: "entity" },
      { id: "helper", name: "Helper", kind: "agent" },
      { id: "pollux", name: "Pollux", kind: "entity" },
      { id: "vega", name: "Vega", kind: "entity", avatar: null },
    ])).toEqual([{ slug: "pollux", name: "Pollux" }, { slug: "vega", name: "Vega" }]);
    expect(meetOffers([])).toEqual([]);
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
