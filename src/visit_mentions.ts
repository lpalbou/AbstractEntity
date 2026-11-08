/**
 * `@entity` mentions in the visit chat (operator 2026-11-08; gateway contract in
 * untracked/entity-mentions-2026-11-08/CONTRACT-mentions.md).
 *
 * The person is already talking to ONE entity here; a mention invites ANOTHER entity into this
 * conversation's session. A mention is a chip picked from the kit's `@` list (fed by
 * `GET /entities`, minus the entity being visited), never `@` read out of the text. On send the
 * person's turn goes to the visited entity exactly as before; then each mention, in the order it
 * was picked, is one `POST /sessions/{session_id}/mentions {entity, text, mention_index}`, the
 * next only once the previous answered (so the second entity sees the first one's answer), and
 * each reply is shown as a turn with its author.
 *
 * Outcomes (contract): 409 = "<name> is in another conversation", go on to the next; 503 = the
 * gateway's sentence, the message goes back to the composer; 404 = this one cannot be mentioned
 * (hidden is missing), unless the gateway has no mentions route at all (an older gateway): then
 * one sentence, "This gateway does not offer mentions yet", and the list is switched off.
 *
 * DOM-free; pinned by visit_mentions.test.ts.
 */
import {
  chatAuthorOf,
  type ChatAuthor,
  type ChatAvatarLook,
  type ChatMention,
  type ChatMentionCandidate,
  type ChatMentionSent,
} from "@abstractframework/panel-chat";

import type { MentionWire } from "./stream_source";
import type { ChatComposerProps } from "./vendor/abstractchat/conversation";

/** The one sentence on a gateway without the mentions route. */
export const MENTIONS_UNAVAILABLE = "This gateway does not offer mentions yet";

/** The `GET /entities` row slice a mention list reads. */
export type MentionableEntity = { name: string; slug: string; avatar?: ChatAvatarLook | null };

/** The sentence under a chip the first time its name is picked in this conversation. */
export function mentionNotice(candidate: Pick<ChatMentionCandidate, "name">): string {
  return `${candidate.name} will read this conversation's history`;
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

export type MentionOutcome =
  /** 200: the entity answered; its reply is a turn of the session, `author` names it. */
  | { kind: "reply"; reply: string; author: ChatAuthor | null }
  /** 409: its one life is in another conversation (or the visit door's own 409): skip to the next. */
  | { kind: "elsewhere"; sentence: string }
  /** 503: it cannot answer now: stop; the message goes back to the composer. */
  | { kind: "cannot_answer"; sentence: string }
  /** 404 on a gateway that has the route: this entity cannot be mentioned (hidden = missing). */
  | { kind: "not_offerable"; sentence: string }
  /** 404 on a gateway without the route: no mentions on this gateway. */
  | { kind: "route_missing" }
  /** Anything else: stop; the message goes back to the composer. */
  | { kind: "failed"; sentence: string };

const detailOf = (body: Record<string, unknown> | null): string => (body && typeof body.detail === "string" ? body.detail.trim() : "");

/**
 * What one mention's answer means. `routeOffered` decides a 404: true (the gateway has the
 * route) = this entity cannot be mentioned; false = the gateway has no mentions; null (not
 * known) = treated as this entity, never as the whole gateway.
 */
export function mentionOutcome(name: string, wire: MentionWire, routeOffered: boolean | null): MentionOutcome {
  const detail = detailOf(wire.body);
  if (wire.status >= 200 && wire.status < 300) {
    const reply = wire.body && typeof wire.body.reply === "string" ? wire.body.reply : "";
    if (!reply.trim()) return { kind: "failed", sentence: `${name}'s answer arrived without words.` };
    return { kind: "reply", reply, author: chatAuthorOf(wire.body?.author) };
  }
  if (wire.status === 409) {
    if (wire.code === "in_another_conversation" || !detail) return { kind: "elsewhere", sentence: `${name} is in another conversation.` };
    return { kind: "elsewhere", sentence: detail };
  }
  if (wire.status === 503) return { kind: "cannot_answer", sentence: `${detail || `${name} cannot answer right now.`} Your message is back in the composer.` };
  if (wire.status === 404) {
    if (routeOffered === false) return { kind: "route_missing" };
    return { kind: "not_offerable", sentence: `${name} cannot be mentioned here.` };
  }
  return { kind: "failed", sentence: `${name} did not answer: ${detail || `HTTP ${wire.status}`}. Your message is back in the composer.` };
}

export type MentionRunDeps = {
  /** One `POST /sessions/{session_id}/mentions` (rejects only on a network failure). */
  post(mention: ChatMentionSent): Promise<MentionWire>;
  /** Whether the gateway has the route (asked once, on the first 404 of the run). */
  routeOffered(): Promise<boolean | null>;
  /** A reply, shown as a turn with its author, as soon as it arrives. */
  onReply(mention: ChatMentionSent, reply: string, author: ChatAuthor | null): void;
};

export type MentionRunResult = {
  /** The sentences about this send (shown above the composer); empty when every mention answered. */
  sentences: string[];
  /** The message goes back to the composer (a 503 or a failure stopped the run). */
  keepDraft: boolean;
  /** The mentions that did not run: the one that stopped the run and those after it. */
  unsent: ChatMentionSent[];
  /** The gateway has no mentions route: switch the list off. */
  unavailable: boolean;
  /** Entities the gateway refused to mention (404): offered no more. */
  refused: string[];
};

/**
 * Send the mentions of one message in pick order (`index`, the gateway's `mention_index`), each
 * after the previous answered. `deps.post` carries the message as typed: every mentioned entity
 * receives the same words.
 */
export async function runMentions(mentions: readonly ChatMentionSent[], deps: MentionRunDeps): Promise<MentionRunResult> {
  const result: MentionRunResult = { sentences: [], keepDraft: false, unsent: [], unavailable: false, refused: [] };
  const ordered = [...mentions].sort((a, b) => a.index - b.index);
  let routeOffered: boolean | null | undefined;
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
    if (wire.status === 404 && routeOffered === undefined) routeOffered = await deps.routeOffered();
    const outcome = mentionOutcome(mention.name, wire, routeOffered ?? null);
    if (outcome.kind === "reply") {
      deps.onReply(mention, outcome.reply, outcome.author);
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

/** What the drawer knows about mentions in the conversation on screen. */
export type VisitMentionState = {
  /** The conversation's session (the visit's, or the flow lane's); null = none, no mentions. */
  sessionKey: string | null;
  candidates(query: string): Promise<ChatMentionCandidate[]>;
  chips: ChatMention[];
  onChipsChange(next: ChatMention[]): void;
  /** `MENTIONS_UNAVAILABLE` once the gateway is known to have no mentions route. */
  unavailable: string | null;
  /** The sentences about the last send. */
  status: string | null;
};

/** The composer's mention props: the kit's `@` list with controlled chips, the first-use notice,
 * the outcome line and the older-gateway sentence. Without a session: none (today's composer). */
export function visitMentionProps(s: VisitMentionState): Pick<ChatComposerProps, "mentionCandidates" | "mentions" | "onMentionsChange" | "mentionNotice" | "mentionSessionKey" | "mentionsUnavailable" | "mentionStatus"> {
  if (!s.sessionKey) return {};
  return {
    mentionCandidates: s.candidates,
    mentions: s.chips,
    onMentionsChange: s.onChipsChange,
    mentionNotice,
    mentionSessionKey: s.sessionKey,
    mentionsUnavailable: s.unavailable,
    mentionStatus: s.status,
  };
}
