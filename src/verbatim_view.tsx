/**
 * Reading and showing a record's words, shared by the Detail card and a
 * world-model card's sources (one reader, one layout).
 *
 * readRecordWords: the pure verbatim read (GET /records/{id}/verbatim; no
 * access recorded for non-diary records), text-cached with its note.
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

/** No image in text a model or a page wrote is ever loaded — not even a
 * same-origin one: the app's /api proxy carries the operator's session, so
 * an image pointing at a diary record would read it and the gateway would
 * mark that read in his biography (adversarial review 2026-11-07). Every
 * image renders as a link. */
export const NO_IMAGE = (): boolean => false;

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

/** A cached copy answers unless it predates the turn id being kept and
 * the record is not diary-shaped: an ordinary record's read is a pure read
 * (nothing is recorded), a diary-shaped one is never read again. */
export function cachedWordsAnswer(cached: Record<string, string> | null, graphId: string, kind: string | undefined): boolean {
  if (!cached) return false;
  return "turn_id" in cached || isDiaryShaped({ kind, graph_id: graphId });
}

async function readRecordWordsOnce(source: VerbatimSource, graphId: string, kind: string | undefined): Promise<RecordWords> {
  const key = textCacheKey(source.baseUrl, source.entity, `verbatim:${graphId}`);
  const cached = await getCachedText(key);
  if (cached && cachedWordsAnswer(cached, graphId, kind)) return { text: cached.text || "", note: cached.note || null, turnId: cached.turn_id || null };
  const v = await fetchRecordVerbatim(source.baseUrl, source.entity, graphId);
  const note = v.born_digest
    ? kind === "world_model"
      ? "His working model — born as words by the sleep pass (mechanical distillation for now; it becomes his own prose only through his revisions)."
      : "Born as words — never a compression; these are all the words there are."
    : null;
  const text = String(v.text ?? "");
  const turnId = typeof v.turn_id === "string" && v.turn_id ? v.turn_id : null;
  // Other readers keep their own fields on the same entry (created_at).
  if (text) void putCachedText(key, { ...(cached ?? {}), text, note: note ?? "", turn_id: turnId ?? "", created_at: String(v.created_at ?? cached?.created_at ?? "") });
  return { text, note, turnId };
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
