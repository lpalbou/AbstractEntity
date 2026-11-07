/**
 * Reading and showing a record's words, shared by the Detail card and a
 * world-model card's sources (one reader, one layout).
 *
 * readRecordWords: the pure verbatim read (GET /records/{id}/verbatim; no
 * access recorded for non-diary records), text-cached with its note.
 * VerbatimTurns: an exchange as labelled turns (Markdown for what people
 * and he said; tool output as written), his unspoken thinking set apart;
 * words that are not an exchange render as Markdown.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { Markdown } from "@abstractframework/panel-chat";

import { fetchRecordVerbatim } from "./stream_source";
import { getCachedText, putCachedText, textCacheKey } from "./text_cache";
import { parseExchange, parseVerbatimTurns, restBlocksAsText, splitUnspokenThinking } from "./verbatim_parse";
import type { VerbatimSource } from "./verbatim_modal";

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

/** One read per record at a time: the sources list and the card's words
 * ask for the same records together (the cache fills only after a read). */
const inFlight = new Map<string, Promise<{ text: string; note: string | null }>>();

export function readRecordWords(source: VerbatimSource, graphId: string, kind: string | undefined): Promise<{ text: string; note: string | null }> {
  const key = `${source.baseUrl}|${source.entity}|${graphId}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = readRecordWordsOnce(source, graphId, kind).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function readRecordWordsOnce(source: VerbatimSource, graphId: string, kind: string | undefined): Promise<{ text: string; note: string | null }> {
  const key = textCacheKey(source.baseUrl, source.entity, `verbatim:${graphId}`);
  const cached = await getCachedText(key);
  if (cached) return { text: cached.text || "", note: cached.note || null };
  const v = await fetchRecordVerbatim(source.baseUrl, source.entity, graphId);
  const note = v.born_digest
    ? kind === "world_model"
      ? "His working model — born as words by the sleep pass (mechanical distillation for now; it becomes his own prose only through his revisions)."
      : "Born as words — never a compression; these are all the words there are."
    : null;
  const text = String(v.text ?? "");
  if (text) void putCachedText(key, { text, note: note ?? "" });
  return { text, note };
}

/** Tool output reads as written (its line breaks and indents matter). */
function isToolTurn(speaker: string): boolean {
  return /\(while looking things up\)$/.test(speaker) || speaker === "(the door)";
}

/** `plain`: the words are not Markdown (a born-digest summary) — shown as
 * written, line breaks kept. */
export function VerbatimTurns({ text, entity, onSpeakers, plain = false }: { text: string; entity: string; onSpeakers?(speakers: string[]): void; plain?: boolean }): React.ReactElement {
  const { spoken, thinking } = useMemo(() => splitUnspokenThinking(text), [text]);
  const exchange = useMemo(() => parseExchange(spoken, entity), [spoken, entity]);
  const turns = useMemo(() => parseVerbatimTurns(spoken, entity), [spoken, entity]);
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (exchange && onSpeakers && reportedRef.current !== text) {
      reportedRef.current = text;
      onSpeakers(exchange.cueSpeaker.toLowerCase() === entity.trim().toLowerCase() ? [] : [exchange.cueSpeaker]);
      return;
    }
    if (!turns || !onSpeakers || reportedRef.current === text) return;
    reportedRef.current = text;
    const name = entity.trim().toLowerCase();
    const others = [...new Set(turns.map((t) => t.speaker.replace(/ \(while looking things up\)$/, "")))].filter(
      (s) => s.toLowerCase() !== name && s !== "(the door)",
    );
    onSpeakers(others);
  }, [exchange, turns, onSpeakers, entity, text]);
  const self = entity.trim().toLowerCase();
  if (exchange) {
    return (
      <>
        <div className="ei_turns">
          <div className="ei_turn">
            <span className="ei_turn_speaker">{exchange.cueSpeaker}</span>
            <Words text={restBlocksAsText(exchange.cue)} className="ev_markdown ei_turn_md" />
          </div>
          {exchange.between ? (
            <div className="ei_unspoken">
              <span className="ei_unspoken_head">thinking and lookups · unspoken</span>
              <pre className="ei_unspoken_text">{exchange.between}</pre>
            </div>
          ) : null}
          <div className="ei_turn ei_turn_self">
            <span className="ei_turn_speaker">{exchange.answerSpeaker}</span>
            <Words text={restBlocksAsText(exchange.answer)} className="ev_markdown ei_turn_md" />
          </div>
        </div>
        {thinking ? (
          <div className="ei_unspoken">
            <span className="ei_unspoken_head">thinking · unspoken</span>
            <pre className="ei_unspoken_text">{thinking}</pre>
          </div>
        ) : null}
      </>
    );
  }
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
