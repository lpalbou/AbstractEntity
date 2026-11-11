/**
 * Reading and showing a record's words, shared by the Detail card and a
 * world-model card's sources (one reader, one layout).
 *
 * readRecordWords: the pure verbatim read (GET /records/{id}/verbatim; no
 * access recorded for non-diary records) with the record's stored
 * understanding (understanding.ts: its summary, who wrote it, as of when,
 * its earlier readings). A diary-shaped record answers from this browser's
 * copy once read (a re-read is recorded in his biography); any other record
 * is read from the gateway each time, because its summary is rewritten in
 * place (understanding pass, DESIGN §4) — a stored copy would show an older
 * reading.
 * VerbatimTurns: a lived moment in the runtime's format as what was said
 * to him, his answer, and how he got there (episode_view.tsx); other
 * exchanges as labelled turns; words that are not an exchange as Markdown.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { Markdown } from "@abstractframework/panel-chat";

import { fetchRecordVerbatim } from "./stream_source";
import { getCachedText, putCachedText, textCacheKey } from "./text_cache";
import { parseVerbatimTurns, restBlocksAsText, splitUnspokenThinking } from "./verbatim_parse";
import type { VerbatimSource } from "./verbatim_modal";
import { isDiaryShaped, parseLivedExchange } from "./episode_parse";
import { LivedExchangeView } from "./episode_view";
import { readUnderstanding, type UnderstandingRead } from "./understanding";
import { NO_IMAGE } from "./no_image";

/** The no-image rule lives in a leaf module (no_image.ts: an import cycle runs through this file). */
export { NO_IMAGE };

/** His words as Markdown; images are links, never loaded. */
export function Words({ text, className }: { text: string; className: string }): React.ReactElement {
  return <Markdown text={text} className={className} images="link" inlineImage={NO_IMAGE} />;
}

/** A record's words, the born-as-words note, and the turn it was formed in
 * (the verbatim route's `turn_id`; null when not served). */
export interface RecordWords {
  text: string;
  note: string | null;
  turnId: string | null;
  /** Born as words: these are all the words the record has (its digest). */
  born: boolean;
  /** The record's stored understanding as served (understanding.ts); null
   * for a diary-shaped record, which is read through the book and carries
   * none. */
  understanding: UnderstandingRead | null;
}

/** One read per record at a time: the sources list and the card's words
 * ask for the same records together (the cache fills only after a read). */
const inFlight = new Map<string, Promise<RecordWords>>();

export function readRecordWords(source: VerbatimSource, graphId: string, kind: string | undefined): Promise<RecordWords> {
  const key = `${source.baseUrl}|${source.entity}|${graphId}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = readRecordWordsOnce(source, graphId, kind).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/** Only a diary-shaped record answers from this browser's copy: it is
 * never read again (each read is recorded in his biography). Any other
 * record's read is a pure read, and its understanding changes in place, so
 * it is always read from the gateway. */
export function cachedWordsAnswer(cached: Record<string, string> | null, graphId: string, kind: string | undefined): boolean {
  if (!cached) return false;
  return isDiaryShaped({ kind, graph_id: graphId });
}

/** A cached copy as words: a born-as-words record is cached with its note
 * (an ordinary one with an empty note). Only diary-shaped records answer
 * from the cache, and they carry no understanding. */
export function wordsFromCache(cached: Record<string, string>): RecordWords {
  return { text: cached.text || "", note: cached.note || null, turnId: cached.turn_id || null, born: Boolean(cached.note), understanding: null };
}

/** One console line per gateway when its record read lacks the
 * understanding (the screen says it in one sentence). */
const warnedUnserved = new Set<string>();

async function readRecordWordsOnce(source: VerbatimSource, graphId: string, kind: string | undefined): Promise<RecordWords> {
  const key = textCacheKey(source.baseUrl, source.entity, `verbatim:${graphId}`);
  const cached = await getCachedText(key);
  if (cached && cachedWordsAnswer(cached, graphId, kind)) return wordsFromCache(cached);
  const v = await fetchRecordVerbatim(source.baseUrl, source.entity, graphId);
  const note = v.born_digest
    ? kind === "world_model"
      ? "His working model — born as words by the sleep pass (mechanical distillation for now; it becomes his own prose only through his revisions)."
      : "Born as words — never a compression; these are all the words there are."
    : null;
  const text = String(v.text ?? "");
  const turnId = typeof v.turn_id === "string" && v.turn_id ? v.turn_id : null;
  const understanding = isDiaryShaped({ kind, graph_id: graphId }) ? null : readUnderstanding(v as unknown as Record<string, unknown>, kind);
  if (understanding && !understanding.served && !warnedUnserved.has(source.baseUrl)) {
    warnedUnserved.add(source.baseUrl);
    console.warn(`#FALLBACK: the record read serves no stored understanding (missing or unreadable: ${understanding.missing.join(", ")}); Detail says so in one sentence`);
  }
  // Other readers keep their own fields on the same entry (created_at).
  if (text) void putCachedText(key, { ...(cached ?? {}), text, note: note ?? "", turn_id: turnId ?? "", created_at: String(v.created_at ?? cached?.created_at ?? "") });
  return { text, note, turnId, born: Boolean(v.born_digest), understanding };
}

/** Tool output reads as written (its line breaks and indents matter). */
function isToolTurn(speaker: string): boolean {
  return /\(while looking things up\)$/.test(speaker) || speaker === "(the door)";
}

/** Who else was in the moment: nobody in his own time or a visit's
 * announcement, the speaker otherwise. */
export function exchangeSpeakers(ex: { cueSpeaker: string; ownTime: boolean; door: boolean }): string[] {
  return ex.ownTime || ex.door ? [] : [ex.cueSpeaker];
}

/** `plain`: the words are not Markdown (a born-digest summary) — shown as
 * written, line breaks kept. */
export function VerbatimTurns({ text, entity, onSpeakers, plain = false }: { text: string; entity: string; onSpeakers?(speakers: string[]): void; plain?: boolean }): React.ReactElement {
  // A lived moment in the runtime's format: what was said, his answer, and
  // how he got there (folded) — one layout wherever an exchange is shown.
  const lived = useMemo(() => parseLivedExchange(text, entity), [text, entity]);
  const { spoken, thinking } = useMemo(() => splitUnspokenThinking(text), [text]);
  const turns = useMemo(() => (lived ? null : parseVerbatimTurns(spoken, entity)), [lived, spoken, entity]);
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (lived && onSpeakers && reportedRef.current !== text) {
      reportedRef.current = text;
      onSpeakers(exchangeSpeakers(lived));
      return;
    }
    if (!turns || !onSpeakers || reportedRef.current === text) return;
    reportedRef.current = text;
    const name = entity.trim().toLowerCase();
    const others = [...new Set(turns.map((t) => t.speaker.replace(/ \(while looking things up\)$/, "")))].filter(
      (s) => s.toLowerCase() !== name && s !== "(the door)",
    );
    onSpeakers(others);
  }, [lived, turns, onSpeakers, entity, text]);
  const self = entity.trim().toLowerCase();
  if (lived) return <LivedExchangeView ex={lived} raw={text} />;
  return (
    <>
      {turns ? (
        <div className="ei_turns">
          {turns.map((t, i) => (
            <div key={i} className={`ei_turn ${t.speaker.toLowerCase().startsWith(self) ? "ei_turn_self" : ""}`}>
              <span className="ei_turn_speaker">{t.speaker}</span>
              {isToolTurn(t.speaker) ? <pre className="ei_turn_text">{t.text}</pre> : <Words text={restBlocksAsText(t.text)} className="ev_markdown ei_turn_md" />}
            </div>
          ))}
        </div>
      ) : (
        plain ? (
          <div className="ei_verbatim_md ei_verbatim_plain">{spoken || text}</div>
        ) : (
          <Words text={restBlocksAsText(spoken || text)} className="ev_markdown ei_verbatim_md" />
        )
      )}
      {thinking ? (
        <div className="ei_unspoken">
          <span className="ei_unspoken_head">thinking · unspoken</span>
          <pre className="ei_unspoken_text">{thinking}</pre>
        </div>
      ) : null}
    </>
  );
}
