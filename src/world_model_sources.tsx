/**
 * A world-model card's sources, read like the Book (operator 2026-11-07:
 * "never truncate the information shown in these cards … present it like
 * that"). The card's own words are the sleep pass's briefing, which quotes
 * each source cut short (abstractmemory world_model._floor_digest bounds a
 * gist at 150 characters — "sources carry the full text"). So the card
 * lists its sources — its `derived_from` links — oldest first, grouped by
 * day, each with its time and its words in full: the source's own words
 * up front, "(…)" for the whole exchange (what was said to him, his
 * unspoken thinking, what his tools returned).
 *
 * Reads are the pure verbatim read (no access recorded). A diary source —
 * known as one by the view or by its id — is never read automatically:
 * opening it is the operator's recorded read, one click, like the Book.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { bookDate } from "./book_reader";
import { Markdown } from "@abstractframework/panel-chat";

import { fetchDiaryEntry } from "./stream_source";
import { isDiaryGraphId, type FoldState, type NodeState } from "./stream_fold";
import { getCachedText, putCachedText, textCacheKey } from "./text_cache";
import { parseExchange, parseVerbatimTurns, splitUnspokenThinking } from "./verbatim_parse";
import { readRecordWords, VerbatimTurns } from "./verbatim_view";
import type { VerbatimSource } from "./verbatim_modal";

export interface CardSource {
  graphId: string;
  node: NodeState | null;
  bornAt: string;
}

/** The records a card was derived from, oldest first. */
export function selectCardSources(fold: FoldState, card: NodeState): CardSource[] {
  const own = card.graph_id ?? card.id;
  const out: CardSource[] = [];
  const seen = new Set<string>();
  for (const e of fold.structural_edges.values()) {
    if (e.relation !== "derived_from" || e.source_graph_id !== own || seen.has(e.target_graph_id)) continue;
    seen.add(e.target_graph_id);
    const node = fold.nodes.get(fold.graph_to_row.get(e.target_graph_id) ?? e.target_graph_id) ?? null;
    out.push({ graphId: e.target_graph_id, node, bornAt: node?.born_at ?? "" });
  }
  out.sort((a, b) => (a.bornAt === b.bornAt ? a.graphId.localeCompare(b.graphId) : a.bornAt < b.bornAt ? -1 : 1));
  return out;
}

export function WorldModelSources({ fold, card, source, onSelect }: { fold: FoldState; card: NodeState; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement | null {
  const sources = useMemo(() => selectCardSources(fold, card), [fold, card]);
  const byDay = useMemo(() => {
    const groups: Array<{ day: string; rows: CardSource[] }> = [];
    for (const s of sources) {
      const { day } = bookDate(s.bornAt);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.rows.push(s);
      else groups.push({ day, rows: [s] });
    }
    return groups;
  }, [sources]);
  if (sources.length === 0) return null;
  return (
    <div className="wm_sources">
      <div className="wm_sources_head">
        What he drew on <span className="wm_sources_count">{sources.length} {sources.length === 1 ? "memory" : "memories"}, in full</span>
      </div>
      {byDay.map((group) => (
        <div key={group.day} className="book_day_group">
          <div className="book_day">{group.day}</div>
          {group.rows.map((s) => (
            <SourceRow key={s.graphId} item={s} source={source} onSelect={onSelect} />
          ))}
        </div>
      ))}
    </div>
  );
}

type Words = { phase: "loading" } | { phase: "ready"; lead: string; full: string } | { phase: "none"; message: string } | { phase: "diary" };

/** A diary record, whether or not this view holds it: its words are only
 * read on a click (the read is recorded in his biography). */
export function isDiarySource(item: CardSource): boolean {
  return Boolean(item.node?.diary) || isDiaryGraphId(item.graphId);
}

function SourceRow({ item, source, onSelect }: { item: CardSource; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement {
  const { time } = bookDate(item.bornAt);
  const diary = isDiarySource(item);
  const [words, setWords] = useState<Words>(diary ? { phase: "diary" } : { phase: "loading" });
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (diary) return;
    let cancelled = false;
    setWords({ phase: "loading" });
    readRecordWords(source, item.graphId, item.node?.kind)
      .then((w) => !cancelled && setWords(sourceWords(w.text, source.entity)))
      .catch((e) => !cancelled && setWords({ phase: "none", message: `his words could not be read (${(e as Error).message})` }));
    return () => {
      cancelled = true;
    };
    // Field deps, never the source OBJECT (an inline parent literal would
    // re-fire the read on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diary, item.graphId, item.node?.kind, source.baseUrl, source.entity, attempt]);

  const openDiary = useCallback(async () => {
    try {
      const entryId = item.node?.entry_id;
      let text: string;
      if (entryId) {
        const key = textCacheKey(source.baseUrl, source.entity, `diary:${entryId}`);
        let cached = await getCachedText(key);
        if (!cached) {
          const entry = await fetchDiaryEntry(source.baseUrl, source.entity, entryId, "operator review (world model source)");
          cached = { text: String(entry.text ?? entry.gist ?? "") };
          if (cached.text) void putCachedText(key, cached);
        }
        text = cached.text;
      } else {
        // No entry id in this view: the record read serves the entry (and
        // the gateway records it as a read, like the diary door).
        text = (await readRecordWords(source, item.graphId, "diary")).text;
      }
      setWords({ phase: "ready", lead: text, full: text });
    } catch (e) {
      setWords({ phase: "none", message: `the entry could not be opened (${(e as Error).message})` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.graphId, item.node?.entry_id, source.baseUrl, source.entity]);

  const title = item.node?.title || "a diary entry";
  return (
    <div className="wm_source">
      {time ? <span className="book_time">{time}</span> : null}
      <div className="wm_source_body">
        {words.phase === "loading" ? <span className="wm_source_note">reading his words…</span> : null}
        {words.phase === "none" ? (
          <span className="wm_source_note">
            {words.message}{" "}
            <button className="wm_more" onClick={() => (diary ? void openDiary() : setAttempt((n) => n + 1))}>
              try again
            </button>
          </span>
        ) : null}
        {words.phase === "diary" ? (
          <>
            <span className="wm_source_text">{title}</span>{" "}
            <button className="wm_more" onClick={() => void openDiary()} title="Open this diary entry — recorded as a visible read in his stream, like the Book">
              (…) open the entry
            </button>
          </>
        ) : null}
        {words.phase === "ready" ? (
          <>
            {expanded ? (
              <div className="ei_verbatim_inline">
                <VerbatimTurns text={words.full} entity={source.entity} />
              </div>
            ) : (
              <Markdown text={words.lead} className="ev_markdown wm_source_text" />
            )}
            {words.full !== words.lead ? (
              <button className="wm_more" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "show his answer only" : "(…) the whole exchange"}
              </button>
            ) : null}
          </>
        ) : null}
        {item.node ? (
          <button className="wm_open" onClick={() => onSelect(item.node!.id)} title="Open this memory in the Detail tab">
            open this memory →
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** His answer up front, the whole exchange behind "(…)". Never cut: `lead`
 * is a complete part of the text, `full` is all of it. */
export function sourceWords(text: string, entity: string): Words {
  const { spoken } = splitUnspokenThinking(text);
  const exchange = parseExchange(spoken, entity);
  if (exchange && exchange.answer) return { phase: "ready", lead: exchange.answer, full: text.trim() };
  const turns = parseVerbatimTurns(spoken, entity);
  const name = entity.trim().toLowerCase();
  // An episode is one exchange: his answer is his LAST turn. Earlier
  // "nerin:" heads can be memories his tools quoted back to him (read_memory
  // returns past exchanges whole), and "nerin (while looking things up)"
  // is tool output — both stay behind "(…)" with the rest of the exchange.
  const mine = turns ? turns.filter((t) => t.speaker.trim().toLowerCase() === name && t.text.trim() !== "") : [];
  const lead = mine.length > 0 ? mine[mine.length - 1].text.trim() : (spoken || text).trim();
  return { phase: "ready", lead, full: text.trim() };
}
