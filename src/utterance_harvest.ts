/**
 * Utterance harvest — the entity app's half of the cognition-wave split
 * (uic owns the scorer + frozen basis + kit component, c1807; I own the
 * feed + mount). This turns an entity's real, timestamped, first-person
 * TEXT into the sample shape the wave widget consumes:
 *   `{ id, label, text, at }`  (scores/emotions/novelty are added later,
 *   by uic's `cognition_scorer.score(embed(text), basis)`).
 *
 * The widget is a TEXT instrument, not an activity monitor (uic's
 * correction): it reads the expressive character of what the entity SAYS,
 * so the harvest gathers the entity's own utterances only — never the
 * operator's steering lines, never a visitor's words.
 *
 * Sources, in order of directness (the entity's own voice):
 * - visit / chat turns   — the `reply` field is exactly one utterance.
 * - diary entries        — the elected-memory plane, the entity's chosen words.
 * - episode / summary     — formed records the entity authored (reflective voice).
 *
 * Privacy: a SEALED diary entry (redacted, no readable door) is NEVER
 * harvested — its words never leave the book. The widget's own contract is
 * scores-only (text is optional at its boundary), but this feed refuses to
 * even READ sealed words, which is the stronger guarantee.
 *
 * The pure extractors (transcript → utterances, fold → harvestable nodes)
 * are testable without I/O; the async `harvestUtterances` composes the
 * verbatim/diary fetches with a bounded fan-out.
 */

import { fetchDiaryEntry, fetchEntityEmbedding, fetchRecordVerbatim, type ChatTranscript } from "./stream_source";
import { getCachedText, putCachedText, textCacheKey } from "./text_cache";
import type { FoldState, NodeState } from "./stream_fold";

/** One utterance in the wave widget's sample shape (pre-scoring). */
export interface Utterance {
  /** Stable id (turn_id / entry_id / record id) — the widget's sample id. */
  id: string;
  /** Short human label for the moment (source + kind). */
  label: string;
  /** The entity's own words — one utterance. */
  text: string;
  /** ISO time the utterance was made (ordering axis), or "" if unknown. */
  at: string;
  /** Provenance so the mount can group/filter by source. */
  source: "visit" | "diary" | "episode" | "summary";
  /** The other party's words in the same exchange (episode verbatims carry
   * both sides) — DISPLAY-ONLY context; never embedded, never scored. */
  request?: string;
  /** Journal seq anchor (the record's formation seq) — lets the mount bind
   * a sample to the replay timeline. null when unresolvable (live visit
   * turns not yet formed into records). */
  seq: number | null;
}

/** Episode verbatims are the lossless exchange, written by the runtime as
 * `{speaker}:\n{their words}\n\n{EntityName}:\n{reply}` (visit_workflow
 * FORM). Split it so scoring reads ONLY the entity's words (the module
 * contract — "never a visitor's words") while the mount can still show the
 * request beside the answer. A text that doesn't match the shape is
 * returned whole as the entity's side (pre-exchange records, reflections). */
export function splitExchangeVerbatim(text: string, entityName: string): { request: string | null; reply: string } {
  // FAIL-SAFE DIRECTION (round-3 review): when content itself contains
  // marker-shaped lines (a visitor pasting a prior transcript), a wrong
  // split must err toward scoring LESS of the entity's text — never toward
  // leaking the visitor's words into the scored side. Hence LAST-boundary
  // semantics everywhere: the structural marker is the final one the
  // runtime wrote; later look-alikes can only exist inside the reply,
  // and cutting there loses reply words (degraded) rather than admitting
  // visitor words (contract violation).
  const lastMatch = (re: RegExp): { index: number; length: number } | null => {
    const g = new RegExp(re.source, "gi");
    let hit: { index: number; length: number } | null = null;
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      hit = { index: m.index, length: m[0].length };
      g.lastIndex = m.index + 1; // overlapping-safe advance
    }
    return hit;
  };
  const splitAt = (hit: { index: number; length: number }): { request: string | null; reply: string } => {
    const head = text.slice(0, hit.index);
    const reply = text.slice(hit.index + hit.length).trim();
    // Head is "{speaker}:\n{words}" — drop the speaker line, keep words.
    const firstColonLine = head.indexOf(":\n");
    const request = (firstColonLine >= 0 ? head.slice(firstColonLine + 2) : head).trim();
    // An empty reply (marker at the very end) stays empty — the caller's
    // minimum-length gate drops the sample: no words of his to score is
    // honest; whole-text fallback would score the VISITOR's words.
    return { request: request || null, reply };
  };

  const name = entityName.trim();
  if (name) {
    const named = lastMatch(new RegExp(`\\n\\n${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\n`));
    if (named) return splitAt(named);
    // Name-drift belt (round-3 review): a home whose display name differs
    // structurally from capitalize(slug) never matches the named marker,
    // which would silently re-admit visitor words. When the text still
    // carries the runtime's exchange shape (a leading speaker line and a
    // later boundary line), split at the LAST generic boundary.
    if (/^[^\n]{1,80}:\n/.test(text)) {
      const generic = lastMatch(new RegExp(`\\n\\n[^\\n]{1,80}:\\n`));
      if (generic) return splitAt(generic);
    }
  }
  return { request: null, reply: text };
}

/** A harvested corpus + the home's embedder identity. The embedder id is
 * carried alongside the text so uic's scorer/basis is built in the SAME
 * space the runtime will score in — memory's durable-practice point (c1815):
 * read the pin per home, never hardcode, surface a mismatch loudly. */
export interface HarvestResult {
  utterances: Utterance[];
  /** The home's M1 embedder id (from the gateway embedding route), or null
   * when unreadable — the caller must NOT assume one (crossing embedding
   * spaces silently is the failure to avoid). */
  embedderId: string | null;
  /** The pinned embedding dimension, when known (belt for the id). */
  embedderDim: number | null;
  /** Labeled provenance for the calibration record (uic's `calibrated_on`). */
  counts: { total: number; visit: number; diary: number; episode: number; summary: number };
  /** Non-fatal notes (embedder unreadable, mismatch, degradations). */
  warnings: string[];
}

/** Kinds of fold record whose verbatim is the entity's OWN authored text.
 * Episodes = lived moments the entity formed; summaries = its reflections.
 * (Interest/dream are born-digest words but are meta about the self, not
 * utterances in a conversation — excluded from the expressive feed.) */
const AUTHORED_RECORD_KINDS = new Set(["episode", "summary"]);

/** A minimal utterance is worth scoring: whitening + contrast projection on
 * a one-word fragment is noise. uic's math wants real sentences. */
const MIN_UTTERANCE_CHARS = 24;

function usableText(t: unknown): string {
  return typeof t === "string" ? t.trim() : "";
}

/**
 * PURE: the entity's own utterances from a chat/visit transcript. Only the
 * `reply` field (the entity speaking) is taken — `text` is the other
 * party's line and never the entity's expressive character.
 */
export function utterancesFromTranscript(transcript: ChatTranscript): Utterance[] {
  const out: Utterance[] = [];
  const turns = Array.isArray(transcript.turns) ? transcript.turns : [];
  turns.forEach((turn, i) => {
    const text = usableText(turn.reply);
    if (text.length < MIN_UTTERANCE_CHARS) return;
    out.push({
      id: turn.turn_id || `${transcript.chat_id}#${i}`,
      label: "visit",
      text,
      at: usableText(turn.at),
      source: "visit",
      request: usableText((turn as { text?: unknown }).text) || undefined,
      seq: null, // live turns have no journal seq until formed into records
    });
  });
  return out;
}

/** A fold node that carries a harvestable utterance, tagged with how to
 * fetch its text. Pure classification — no I/O. */
export interface HarvestableNode {
  node: NodeState;
  source: "diary" | "episode" | "summary";
}

/**
 * PURE: the fold nodes whose text is the entity's own authored utterance,
 * in chronological order (born_at, then append order). Sealed diary
 * entries (redacted, no entry door) are excluded — their words are never
 * read. Bookkeeping / relations / closed records are excluded.
 */
export function harvestableNodes(fold: FoldState): HarvestableNode[] {
  const rows: HarvestableNode[] = [];
  for (const node of fold.nodes.values()) {
    if (node.bookkeeping || node.kind === "relation" || node.closed) continue;
    if (node.diary) {
      // Only a diary entry with a readable door contributes; a sealed one
      // is left in the book (its words never enter the feed).
      if (node.entry_id && !node.redacted) rows.push({ node, source: "diary" });
      continue;
    }
    if (AUTHORED_RECORD_KINDS.has(node.kind)) {
      rows.push({ node, source: node.kind === "summary" ? "summary" : "episode" });
    }
  }
  rows.sort((a, b) => {
    const ba = a.node.born_at || "";
    const bb = b.node.born_at || "";
    if (ba && bb && ba !== bb) return ba < bb ? -1 : 1;
    return a.node.first_seq - b.node.first_seq;
  });
  return rows;
}

export interface HarvestOptions {
  /** Cap the total utterances fetched (bounded fan-out; default 300 — uic's
   * "≥256 preferred" calibration target with headroom). */
  limit?: number;
  /** Concurrent verbatim/diary fetches (default 6). */
  concurrency?: number;
  /** Include a transcript's visit turns (when a chat_id is being read). */
  transcript?: ChatTranscript | null;
  /** Display name used to split exchange verbatims ("Ephemeral:") — the
   * capitalized slug when omitted. */
  entityName?: string;
}

/** Run async tasks with a bounded concurrency (no external dep). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Harvest the entity's utterances into the wave widget's sample shape,
 * READY for scoring (uic feeds each `text` through embed + score). This is
 * the runtime feed AND the calibration-corpus extractor — the same real
 * lineage voice uic asked for (c1807) to build the frozen basis against.
 *
 * Verbatim/diary reads go through the gateway's operator doors (the same
 * ones the inspector + book reader use); a read that fails (unreachable,
 * 403, no verbatim) is skipped, never faked. Bounded by `limit`.
 */
export async function harvestUtterances(
  baseUrl: string,
  entity: string,
  fold: FoldState,
  opts: HarvestOptions = {},
): Promise<Utterance[]> {
  const limit = opts.limit ?? 300;
  const concurrency = opts.concurrency ?? 6;

  const fromTranscript = opts.transcript ? utterancesFromTranscript(opts.transcript) : [];
  const entityName = opts.entityName ?? entity.charAt(0).toUpperCase() + entity.slice(1);

  const nodes = harvestableNodes(fold).slice(0, Math.max(0, limit - fromTranscript.length));
  const fetched = await mapLimit(nodes, concurrency, async ({ node, source }): Promise<Utterance | null> => {
    try {
      if (source === "diary" && node.entry_id) {
        // Book entries are immutable — a text read once never needs the
        // door again. Cache hit = no HTTP call = no diary_read marker
        // (maintainer 2026-07-15: a scoring pass painted a wall of "The
        // book was read" into his biography; the first read is the honest
        // record, re-reads were pure waste).
        const ck = textCacheKey(baseUrl, entity, `diary:${node.entry_id}`);
        let cached = await getCachedText(ck);
        if (!cached) {
          const entry = await fetchDiaryEntry(baseUrl, entity, node.entry_id, "operator review (cognition calibration)");
          cached = { text: usableText(entry.text) || usableText(entry.gist), at: usableText(entry.written_at) };
          if (cached.text) void putCachedText(ck, cached);
        }
        const text = cached.text || "";
        if (text.length < MIN_UTTERANCE_CHARS) return null;
        return {
          id: node.entry_id,
          label: "diary",
          text,
          at: cached.at || node.born_at || "",
          source: "diary",
          seq: node.first_seq,
        };
      }
      // Verbatim artifacts are write-once — same cache contract.
      const vk = textCacheKey(baseUrl, entity, `verbatim:${node.graph_id ?? node.id}`);
      let v = await getCachedText(vk);
      if (!v) {
        const fetchedV = await fetchRecordVerbatim(baseUrl, entity, node.graph_id ?? node.id);
        v = { text: usableText(fetchedV.text), created_at: usableText(fetchedV.created_at) };
        if (v.text) void putCachedText(vk, v);
      }
      const raw = usableText(v.text);
      if (raw.length < MIN_UTTERANCE_CHARS) return null;
      // Episodes are two-sided exchanges: score ONLY the entity's words
      // (the module contract); the visitor's side rides as display context.
      const { request, reply } = source === "episode" ? splitExchangeVerbatim(raw, entityName) : { request: null, reply: raw };
      if (reply.length < MIN_UTTERANCE_CHARS) return null;
      return {
        id: node.graph_id ?? node.id,
        label: source,
        text: reply,
        at: usableText(v.created_at) || node.born_at || "",
        source,
        request: request ?? undefined,
        seq: node.first_seq,
      };
    } catch {
      return null; // an unreadable record contributes nothing — never faked
    }
  });

  const all = [...fromTranscript, ...fetched.filter((u): u is Utterance => u !== null)];
  // Chronological across all sources (the conversation-of-a-life order).
  all.sort((a, b) => {
    if (a.at && b.at && a.at !== b.at) return a.at < b.at ? -1 : 1;
    return 0;
  });
  return all.slice(0, limit);
}

/** PURE: labeled counts for the calibration record (uic's `calibrated_on`). */
export function countBySource(utterances: Utterance[]): HarvestResult["counts"] {
  const c = { total: utterances.length, visit: 0, diary: 0, episode: 0, summary: 0 };
  for (const u of utterances) c[u.source] += 1;
  return c;
}

/**
 * Harvest a calibration corpus + the home's embedder identity (uic c1807/
 * c1816). This is the pull uic asked for: the utterances AND the embedder
 * id they must build the frozen basis with, so runtime scoring lands in the
 * SAME space (memory c1815 — read the pin, never hardcode). A missing/
 * unreadable embedder is surfaced as a warning, never assumed.
 */
export async function harvestCorpus(
  baseUrl: string,
  entity: string,
  fold: FoldState,
  opts: HarvestOptions = {},
): Promise<HarvestResult> {
  const warnings: string[] = [];
  const [utterances, embedding] = await Promise.all([
    harvestUtterances(baseUrl, entity, fold, opts),
    fetchEntityEmbedding(baseUrl, entity),
  ]);

  let embedderId: string | null = null;
  let embedderDim: number | null = null;
  if (embedding) {
    embedderId = embedding.pin?.model_id ?? embedding.resolved_embedder ?? null;
    embedderDim = embedding.pin?.dimension ?? null;
    if (embedding.match === "mismatch") {
      warnings.push(
        `#FALLBACK home pin (${embedding.pin?.model_id ?? "?"}) != door embedder (${embedding.resolved_embedder ?? "?"}) — basis must be built with the PIN's id, or scoring crosses spaces`,
      );
    }
    if (embedding.warnings?.length) warnings.push(...embedding.warnings);
  } else {
    warnings.push("#FALLBACK embedder identity unreadable — do not assume; uic's scorer will refuse on a guessed id");
  }
  if (!embedderId) warnings.push("#FALLBACK no embedder id resolved for this home");

  return { utterances, embedderId, embedderDim, counts: countBySource(utterances), warnings };
}
