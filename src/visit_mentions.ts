/**
 * `@entity` mentions in the visit chat (operator 2026-11-08; gateway contract in
 * untracked/entity-mentions-2026-11-08/CONTRACT-mentions.md).
 *
 * The person is already talking to ONE entity here; a mention invites ANOTHER entity into this
 * conversation's session. A mention is a chip picked from the kit's `@` list (fed by
 * `GET /entities`, minus the entity being visited), never `@` read out of the text. On send the
 * person's turn goes to the visited entity exactly as before; then each mention, in the order it
 * was picked, is one `POST /sessions/{session_id}/mentions {entity, text, mention_index,
 * repeat_of?, mention_id}`, the next only once the previous answered (so the second entity sees the first
 * one's answer), and each reply is shown as a turn with its author. In a visit, the gateway also
 * says the reply to the entity being visited (`mirrors`): one small line says so.
 *
 * Outcomes (contract): 409 = "<name> is in another conversation", go on to the next; 503 = the
 * gateway's sentence, the message goes back to the composer; 404 with `entity_not_found` = this
 * one cannot be mentioned (hidden is missing); a 404 or 405 without a code = the gateway has no
 * mentions route (an older gateway; every refusal of the door is coded): one sentence, "This
 * gateway does not offer mentions yet", and the list is switched off; 422 `repeat_of_unknown` =
 * the gateway's sentence.
 *
 * A message whose mentions stopped partway (a 503, a failed call) is HELD (client review
 * 2026-11-09): the composer keeps its words and only the chips not answered, and sending the SAME
 * words again asks only those mentions, with the same `repeat_of` and their first index — never a
 * new turn of the person and never an entity that already answered. Different words are a new
 * message. Each entity is asked once per message (a duplicate pick keeps its first index).
 *
 * ONE ANSWER PER MENTION (AbstractGateway f0f23bb0, `mention_id`): every mention carries its own
 * id, `<message>:<entity>:<mention_index>`, where the message is the person's own turn
 * (`repeat_of`) or, with none (the visit lane), an id minted once for that message and held with
 * it. A resend of that mention (after a 503, a timeout or a lost answer) names the same id, so the
 * gateway gives back the first answer instead of asking the entity again; a new message names a
 * new one.
 *
 * THE SESSION AGENT (operator 2026-11-10, flow lane only; the visit lane has no session agent): a
 * message that carries entity mentions does not reach the session agent at all (the gateway skips
 * its run unless `mentions` holds the reserved slug "agent"); the `@` list also offers the agent
 * itself (kind "agent", labelled with its display name, sent as "agent" in pick order) to address
 * it explicitly beside the entities. With entity chips only, one line says the agent stays out of
 * this message. The mentions door is for entities: an agent chip is never posted to it.
 *
 * DOM-free; pinned by visit_mentions.test.ts.
 */
import {
  chatAuthorOf,
  mentionKey,
  mentionResend,
  uniqueMentions,
  type ChatAuthor,
  type ChatAvatarLook,
  type ChatMention,
  type ChatMentionCandidate,
  type ChatMentionSent,
  type ChatMessage,
  type ChatMessageMention,
  type MentionResend,
} from "@abstractframework/panel-chat";

import type { MentionBody, MentionWire } from "./stream_source";
import type { ChatComposerProps } from "./vendor/abstractchat/conversation";

/** The one sentence on a gateway without the mentions route. */
export const MENTIONS_UNAVAILABLE = "This gateway does not offer mentions yet";

/** A fresh message id for `mention_id`: "msg-" and 24 random hex digits (crypto.getRandomValues:
 * any page, secure context or not). */
export function mintMessageId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  return `msg-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** The message part of its mentions' ids: the person's own turn of the session (`repeat_of`, the
 * flow lane) when the message has one, else an id minted now (the visit lane: its turn lives in
 * the entity's home, not in the session). Taken ONCE per message and held with it for a resend. */
export function mentionMessageKey(repeatOf: string | null, mint: () => string = mintMessageId): string {
  return String(repeatOf ?? "").trim() || mint();
}

/** One mention's `mention_id`: `<message>:<entity>:<mention_index>`, the same on every resend of
 * that mention, another for a new message. A message without its key is a bug: it throws. */
export function mentionId(message: string, mention: Pick<ChatMentionSent, "id" | "index">): string {
  const key = String(message ?? "").trim();
  if (!key) throw new Error("A mention needs its message key (mention_id).");
  return `${key}:${mention.id}:${mention.index}`;
}

/** The request body of one mention: the words as typed, the entity, its index, `repeat_of` when the
 * message has a turn in the session, and its `mention_id`. */
export function mentionBody(text: string, mention: ChatMentionSent, repeatOf: string | null, message: string): MentionBody {
  return { entity: mention.id, text, mention_index: mention.index, ...(repeatOf ? { repeat_of: repeatOf } : {}), mention_id: mentionId(message, mention) };
}

/** The `GET /entities` row slice a mention list reads. */
export type MentionableEntity = { name: string; slug: string; entity_id?: string; avatar?: ChatAvatarLook | null };

/** The mentions a sent message shows as chips in its bubble (panel-chat 0.9.13 `ChatMessage.mentions`):
 * every chip the composer's send carried (`picked`: id, name, kind, index, start), with `start` moved
 * onto the words the drawer sends (`typed` is sent trimmed, so its leading spaces go) and the look its
 * composer chip had (`chips`, by kind and id), so the bubble's chip shows the same orb. The kit
 * places each by `start` and never reads the text for "@". */
export function sentMessageMentions(typed: string, picked: readonly ChatMentionSent[], chips: readonly ChatMention[]): ChatMessageMention[] {
  const lead = typed.length - typed.trimStart().length;
  return picked.map((m): ChatMessageMention => {
    const look = chips.find((c) => c.kind === m.kind && c.id === m.id)?.avatar;
    return {
      id: m.id,
      name: m.name,
      kind: m.kind,
      index: m.index,
      ...(typeof m.start === "number" ? { start: m.start - lead } : {}),
      ...(look ? { avatar: look } : {}),
    };
  });
}

/** An entity's answer on its way (operator round 6, 2026-11-11: "the 3 dancing dots in the chat
 * itself, where the AI would answer, and with its @entity_name answering"): one per entity of the
 * message, from the moment the mentions are asked until its reply is in the thread. */
export type PendingMention = { key: string; mention: ChatMentionSent; author: ChatAuthor };

/** The id prefix of a pending answer's bubble. */
export const PENDING_MENTION_ID = "pending-mention:";

/** The pending answers of a message's entity mentions, in the order they are asked (each entity once;
 * the agent's chip rode the summon), named as its reply will be (the chip's name and look). */
export function pendingMentionsFor(message: string, sent: readonly ChatMentionSent[], chips: readonly ChatMention[]): PendingMention[] {
  return orderedMentions(entityMentions(sent)).map((m) => ({
    key: `${message}:${m.index}`,
    mention: m,
    author: { kind: "entity", name: m.name, entity_id: null, identity_ref: null, avatar: chips.find((c) => c.kind === m.kind && c.id === m.id)?.avatar ?? null },
  }));
}

/** The pending answers once `answered` replied: its bubble goes (the reply takes its place). */
export function pendingAfterReply(pending: readonly PendingMention[], answered: Pick<ChatMentionSent, "id" | "index">): PendingMention[] {
  return pending.filter((p) => !(p.mention.id === answered.id && p.mention.index === answered.index));
}

/** A pending answer's bubble: the entity as author, the kit's live state ("answering"), no words. */
export function pendingMentionMessage(p: PendingMention): ChatMessage {
  return { id: `${PENDING_MENTION_ID}${p.key}`, role: "assistant", content: "", author: p.author, live: { callId: `${PENDING_MENTION_ID}${p.key}`, reasoning: "", label: "answering" } };
}

/** The reserved slug that addresses the session agent in `mentions` (no entity can be named so). */
export const AGENT_MENTION_SLUG = "agent";

/** The session agent's chip: its display name (else "Agent"), kind "agent", id the reserved slug. */
export function agentMentionCandidate(name: string | null | undefined): ChatMentionCandidate {
  return { id: AGENT_MENTION_SLUG, name: String(name ?? "").trim() || "Agent", kind: "agent" };
}

/** The `@` list of a lane with a session agent (the flow lane): the agent first when its name or
 * the reserved slug starts with the query (any case; an empty query offers it), then the entities. */
export function withSessionAgent(entities: readonly ChatMentionCandidate[], agentName: string | null | undefined, query: string): ChatMentionCandidate[] {
  const agent = agentMentionCandidate(agentName);
  const q = String(query || "").trim().toLowerCase();
  const offered = !q || agent.name.toLowerCase().startsWith(q) || AGENT_MENTION_SLUG.startsWith(q);
  return offered ? [agent, ...entities] : [...entities];
}

/** The mentions the mentions door asks (`POST /sessions/{id}/mentions`): the entity chips only. */
export function entityMentions<M extends Pick<ChatMentionSent, "kind">>(mentions: readonly M[]): M[] {
  return mentions.filter((m) => m.kind === "entity");
}

/**
 * The names the `@` list offers for `query`: every entity the account sees except the one being
 * visited (`current`, matched on its slug or its name, any case) and the ones the gateway refused
 * to mention (`refused`, slugs). A name matches when it, or its slug, starts with the query (any
 * case); an empty query offers them all, in the gateway's order. The candidate's id is the slug,
 * the name the mention route takes.
 */
export function mentionCandidatesFor(
  rows: readonly MentionableEntity[],
  current: string,
  query: string,
  refused: ReadonlySet<string> = new Set(),
): ChatMentionCandidate[] {
  const here = String(current || "").trim().toLowerCase();
  const q = String(query || "").trim().toLowerCase();
  const out: ChatMentionCandidate[] = [];
  for (const row of rows) {
    const slug = String(row.slug || "").trim();
    const name = String(row.name || "").trim() || slug;
    if (!slug) continue;
    if (slug.toLowerCase() === here || name.toLowerCase() === here) continue;
    if (refused.has(slug)) continue;
    if (q && !name.toLowerCase().startsWith(q) && !slug.toLowerCase().startsWith(q)) continue;
    out.push({ id: slug, name, kind: "entity", ...(row.avatar ? { avatar: row.avatar } : {}) });
  }
  return out;
}

/** Where the gateway also said a mention's reply (`mirrors`, a visit lane): the visited entity's
 * live visit, by `entity_id`; `error` when that visit refused it (the mention still stands). */
export type MentionMirror = { entityId: string; error: string | null };

export function mentionMirrors(value: unknown): MentionMirror[] {
  if (!Array.isArray(value)) return [];
  const out: MentionMirror[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const entityId = typeof row.entity_id === "string" ? row.entity_id.trim() : "";
    if (!entityId) continue;
    out.push({ entityId, error: typeof row.error === "string" && row.error.trim() ? row.error.trim() : null });
  }
  return out;
}

/** The one small line under a mirrored reply: "Also said to Castor." (each entity by the name
 * `GET /entities` gives it, else its id as served), and the visits that refused it. Null when
 * there is no mirror (a plain chat). */
export function mirrorLine(mirrors: readonly MentionMirror[], nameOf: (entityId: string) => string | null): string | null {
  if (!mirrors.length) return null;
  const said = mirrors.filter((m) => !m.error).map((m) => nameOf(m.entityId) || m.entityId);
  const parts: string[] = [];
  if (said.length) parts.push(`Also said to ${said.join(" and ")}.`);
  for (const m of mirrors) if (m.error) parts.push(`Not said to ${nameOf(m.entityId) || m.entityId}: ${m.error}`);
  return parts.join(" ");
}

export type MentionOutcome =
  /** 200: the entity answered; its reply is a turn of the session, `author` names it. */
  | { kind: "reply"; reply: string; author: ChatAuthor | null; mirrors: MentionMirror[] }
  /** 409: its one life is in another conversation (or the visit door's own 409): skip to the next. */
  | { kind: "elsewhere"; sentence: string }
  /** 503: it cannot answer now: stop; the message goes back to the composer. */
  | { kind: "cannot_answer"; sentence: string }
  /** 404 `entity_not_found`: this entity cannot be mentioned (hidden = missing). */
  | { kind: "not_offerable"; sentence: string }
  /** 404 without that code: the gateway has no mentions route. */
  | { kind: "route_missing" }
  /** Anything else: stop; the message goes back to the composer. */
  | { kind: "failed"; sentence: string };

const detailOf = (body: Record<string, unknown> | null): string => (body && typeof body.detail === "string" ? body.detail.trim() : "");

/** What one mention's answer means (the contract's codes, never the words of a sentence). */
export function mentionOutcome(name: string, wire: MentionWire): MentionOutcome {
  const detail = detailOf(wire.body);
  if (wire.status >= 200 && wire.status < 300) {
    const reply = wire.body && typeof wire.body.reply === "string" ? wire.body.reply : "";
    if (!reply.trim()) return { kind: "failed", sentence: `${name}'s answer arrived without words.` };
    return { kind: "reply", reply, author: chatAuthorOf(wire.body?.author), mirrors: mentionMirrors(wire.body?.mirrors) };
  }
  if (wire.status === 409) {
    if (wire.code === "in_another_conversation" || !detail) return { kind: "elsewhere", sentence: `${name} is in another conversation.` };
    return { kind: "elsewhere", sentence: detail };
  }
  if (wire.status === 503) return { kind: "cannot_answer", sentence: `${detail || `${name} cannot answer right now.`} Your message is back in the composer.` };
  // The door codes every refusal: an uncoded 404 or 405 is the route itself missing (an older
  // gateway). A 404 coded otherwise is not a missing route: it fails below with its words.
  if ((wire.status === 404 || wire.status === 405) && !wire.code) return { kind: "route_missing" };
  if (wire.status === 404 && wire.code === "entity_not_found") return { kind: "not_offerable", sentence: `${name} cannot be mentioned here.` };
  if (wire.status === 422 && wire.code === "repeat_of_unknown") {
    return { kind: "failed", sentence: `${detail || "This message is not a turn of this conversation."} Your message is back in the composer.` };
  }
  return { kind: "failed", sentence: `${name} did not answer: ${detail || `HTTP ${wire.status}`}. Your message is back in the composer.` };
}

export type MentionRunDeps = {
  /** One `POST /sessions/{session_id}/mentions` (rejects only on a network failure). */
  post(mention: ChatMentionSent): Promise<MentionWire>;
  /** A reply, shown as a turn with its author as soon as it arrives, and where else the gateway
   * said it (`mirrors`). */
  onReply(mention: ChatMentionSent, reply: string, author: ChatAuthor | null, mirrors: MentionMirror[]): void;
};

export type MentionRunResult = {
  /** The sentences about this send (shown above the composer); empty when every mention answered. */
  sentences: string[];
  /** The mentions that answered (200), in order: never asked again for this message. */
  answered: ChatMentionSent[];
  /** The message goes back to the composer (a 503 or a failure stopped the run). */
  keepDraft: boolean;
  /** The mentions that did not run: the one that stopped the run and those after it. */
  unsent: ChatMentionSent[];
  /** The gateway has no mentions route: switch the list off. */
  unavailable: boolean;
  /** Entities the gateway refused to mention (404): offered no more. */
  refused: string[];
};

/** A message's mentions in pick order (`index`), each entity once: a duplicate pick keeps the
 * first one's place and index. */
export function orderedMentions(mentions: readonly ChatMentionSent[]): ChatMentionSent[] {
  return uniqueMentions([...mentions].sort((a, b) => a.index - b.index));
}

/**
 * Send the mentions of one message in pick order (`index`, the gateway's `mention_index`), each
 * after the previous answered, each entity once (an agent chip is not sent: it rode the summon).
 * `deps.post` carries the message as typed: every mentioned entity receives the same words.
 */
export async function runMentions(mentions: readonly ChatMentionSent[], deps: MentionRunDeps): Promise<MentionRunResult> {
  const result: MentionRunResult = { sentences: [], answered: [], keepDraft: false, unsent: [], unavailable: false, refused: [] };
  // The session agent's chip rides the summon (`mentions`), never the mentions door.
  const ordered = orderedMentions(entityMentions(mentions));
  for (let i = 0; i < ordered.length; i++) {
    const mention = ordered[i];
    let wire: MentionWire;
    try {
      wire = await deps.post(mention);
    } catch (e) {
      result.sentences.push(`${mention.name} could not be reached: ${(e as Error)?.message || "no answer"}. Your message is back in the composer.`);
      result.keepDraft = true;
      result.unsent = ordered.slice(i);
      return result;
    }
    const outcome = mentionOutcome(mention.name, wire);
    if (outcome.kind === "reply") {
      result.answered.push(mention);
      deps.onReply(mention, outcome.reply, outcome.author, outcome.mirrors);
      continue;
    }
    if (outcome.kind === "route_missing") {
      result.sentences.push(MENTIONS_UNAVAILABLE);
      result.unavailable = true;
      return result;
    }
    result.sentences.push(outcome.sentence);
    if (outcome.kind === "not_offerable") result.refused.push(mention.id);
    if (outcome.kind === "cannot_answer" || outcome.kind === "failed") {
      result.keepDraft = true;
      result.unsent = ordered.slice(i);
      return result;
    }
  }
  return result;
}

/** The chips to put back: the picked chips whose mention did not run, in their order. */
export function chipsToRestore(sent: readonly ChatMention[], unsent: readonly ChatMentionSent[]): ChatMention[] {
  const ids = new Set(unsent.map((m) => `${m.kind}:${m.id}`));
  return sent.filter((c) => ids.has(`${c.kind}:${c.id}`));
}

/**
 * A message whose mentions stopped partway, held for its resend: the conversation it belongs to
 * (`sessionId`), its key (`message`: every resend names the same `mention_id`s), its words,
 * `repeat_of` and the mentions not answered with their first index (`resend`, the kit's shape),
 * and every entity that answered it (`answered`, mention keys).
 */
export type HeldMentions = { sessionId: string; message: string; resend: MentionResend; answered: string[] };

/**
 * What a run leaves to resend: held when a 503 or a failure stopped it with mentions not
 * answered, else null (every mention answered, was skipped, or the route is missing). `message`:
 * the key its mentions were sent with (`mentionMessageKey`), kept for the resend.
 * `answeredBefore`: the entities that answered the earlier sends of the same message.
 */
export function heldAfterRun(
  sessionId: string,
  message: string,
  text: string,
  repeatOf: string | null,
  result: Pick<MentionRunResult, "unsent" | "answered">,
  answeredBefore: readonly string[] = [],
): HeldMentions | null {
  // `unsent` is only ever set by a stop (a 503 or a failure), never by a skip or a missing route.
  if (!result.unsent.length) return null;
  const answered = [...new Set([...answeredBefore, ...result.answered.map(mentionKey)])];
  return { sessionId, message, resend: { text, repeatOf, unsent: result.unsent.map((m) => ({ ...m })) }, answered };
}

/** A resend: the mentions to ask, and the chips naming an entity that already answered (said,
 * never asked). */
export type MentionResendPlan = { ask: ChatMentionSent[]; alreadyAnswered: ChatMentionSent[] };

/**
 * What a send in the conversation `sessionId` is, given the held message: a RESEND when it is
 * the same conversation, the same words (trimmed) and at least one chip. Then ONLY those
 * mentions are asked — a chip not answered keeps its first index, a chip added since is
 * numbered after them, each entity once — and never an entity that already answered this
 * message. Null: a new message (the person's turn goes out as usual, then its mentions).
 */
export function mentionResendPlan(
  held: HeldMentions | null,
  sessionId: string | null,
  text: string,
  mentions: readonly ChatMentionSent[],
): MentionResendPlan | null {
  if (!held || !sessionId || held.sessionId !== sessionId) return null;
  // A resend asks entities only: the agent's chip does not make one (with it alone, a new message).
  const again = mentionResend(held.resend, text, entityMentions(mentions));
  if (!again) return null;
  const done = new Set(held.answered);
  return { ask: again.filter((m) => !done.has(mentionKey(m))), alreadyAnswered: again.filter((m) => done.has(mentionKey(m))) };
}

/** The sentence for chips that named an entity already answered: "Castor already answered this
 * message."; null when there is none. */
export function alreadyAnsweredLine(mentions: readonly ChatMentionSent[]): string | null {
  if (!mentions.length) return null;
  return `${mentions.map((m) => m.name).join(" and ")} already answered this message.`;
}

/**
 * The flow lane's conversation key, stable for the whole conversation (the kit shows the
 * first-use notice once per key): the key it got when it started — `flow:<session>` when it
 * resumed a stored session, else a fresh `flow:<fresh()>` — KEPT when its first message mints the
 * session id; null once it ended. `previous`: the key so far.
 */
export function flowMentionKey(previous: string | null, active: boolean, sessionId: string | null, fresh: () => string): string | null {
  if (!active) return null;
  return previous ?? `flow:${sessionId || fresh()}`;
}

/**
 * The meet offers above the composer (operator 2026-07-15): each entity picked as an `@` chip
 * (an entity of this gateway, never the one visited) can also be convened into a meet with the
 * visited one. Structured only: never read out of the typed words (no-heuristics ruling).
 */
export function meetOffers(chips: readonly ChatMention[]): Array<{ slug: string; name: string }> {
  return uniqueMentions(chips.filter((c) => c.kind === "entity")).map((c) => ({ slug: c.id, name: c.name }));
}

/** What the drawer knows about mentions in the conversation on screen. */
export type VisitMentionState = {
  /** The conversation's session (the visit's, or the flow lane's); null = none, no mentions. */
  sessionKey: string | null;
  candidates(query: string): Promise<ChatMentionCandidate[]>;
  chips: ChatMention[];
  onChipsChange(next: ChatMention[]): void;
  /** `MENTIONS_UNAVAILABLE` once the gateway is known to have no mentions route. */
  unavailable: string | null;
  /** The sentences about the last send (outcomes and refusals). */
  status: string | null;
};

/** The composer's mention props: the kit's `@` list with controlled chips, the last send's outcome
 * line and the older-gateway sentence. No informational row above the typed text (operator
 * 2026-11-10 23:02: "do not add the text above… remove that"): no first-use notice ("… will read
 * this conversation's history"), no "… stays out of this message" line; what they described is
 * unchanged (the gateway skips the session agent for an entities-only message; a mentioned entity
 * reads the history). Without a session: none (today's composer). */
export function visitMentionProps(s: VisitMentionState): Pick<ChatComposerProps, "mentionCandidates" | "mentions" | "onMentionsChange" | "mentionSessionKey" | "mentionsUnavailable" | "mentionStatus"> {
  if (!s.sessionKey) return {};
  return {
    mentionCandidates: s.candidates,
    mentions: s.chips,
    onMentionsChange: s.onChipsChange,
    mentionSessionKey: s.sessionKey,
    mentionsUnavailable: s.unavailable,
    mentionStatus: s.status && s.status.trim() ? s.status : null,
  };
}
