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
 * Reads are the pure verbatim read (no access recorded). A diary source is
 * never read automatically — opening it is the operator's recorded read,
 * one click, like the Book.
 */

import React, { useEffect, useMemo, useState } from "react";

import { bookDate } from "./book_reader";
import { parseVerbatimTurns, splitUnspokenThinking } from "./verbatim_parse";
import { fetchDiaryEntry, fetchRecordVerbatim } from "./stream_source";
import type { FoldState, NodeState } from "./stream_fold";
import { getCachedText, putCachedText, textCacheKey } from "./text_cache";
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

function SourceRow({ item, source, onSelect }: { item: CardSource; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement {
  const { time } = bookDate(item.bornAt);
  const diary = Boolean(item.node?.diary);
  const [words, setWords] = useState<Words>(diary ? { phase: "diary" } : { phase: "loading" });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (diary) return;
    let cancelled = false;
    (async () => {
      try {
        const key = textCacheKey(source.baseUrl, source.entity, `verbatim:${item.graphId}`);
        let cached = await getCachedText(key);
        if (!cached) {
          const v = await fetchRecordVerbatim(source.baseUrl, source.entity, item.graphId);
          cached = { text: String(v.text ?? ""), note: "" };
          if (cached.text) void putCachedText(key, cached);
        }
        if (!cancelled) setWords(sourceWords(cached.text, source.entity));
      } catch (e) {
        if (!cancelled) setWords({ phase: "none", message: `his words could not be read (${(e as Error).message})` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diary, item.graphId, source.baseUrl, source.entity]);

  const openDiary = async () => {
    const entryId = item.node?.entry_id;
    if (!entryId) return;
    try {
      const key = textCacheKey(source.baseUrl, source.entity, `diary:${entryId}`);
      let cached = await getCachedText(key);
      if (!cached) {
        const entry = await fetchDiaryEntry(source.baseUrl, source.entity, entryId, "operator review (world model source)");
        cached = { text: String(entry.text ?? entry.gist ?? "") };
        if (cached.text) void putCachedText(key, cached);
      }
      setWords({ phase: "ready", lead: cached.text, full: cached.text });
    } catch (e) {
      setWords({ phase: "none", message: `the entry could not be opened (${(e as Error).message})` });
    }
  };

  const title = item.node?.title || item.graphId;
  return (
    <div className="wm_source">
      {time ? <span className="book_time">{time}</span> : null}
      <div className="wm_source_body">
        {words.phase === "loading" ? <span className="wm_source_note">reading his words…</span> : null}
        {words.phase === "none" ? <span className="wm_source_note">{words.message}</span> : null}
        {words.phase === "diary" ? (
          <>
            <span className="wm_source_text">{title}</span>{" "}
            <button className="wm_more" onClick={openDiary} title="Open this diary entry (recorded as a visible read in his stream, like the Book)">
              (…) open the entry
            </button>
          </>
        ) : null}
        {words.phase === "ready" ? (
          <>
            <SourceText text={expanded ? words.full : words.lead} />
            {words.full !== words.lead ? (
              <button className="wm_more" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "show less" : "(…) the whole exchange"}
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

/** Text with its fenced blocks (```rest …```) set apart as labelled notes;
 * every character is shown, only the fence marks become the label. */
export function splitFences(text: string): Array<{ kind: "text"; text: string } | { kind: "fence"; label: string; text: string }> {
  const out: Array<{ kind: "text"; text: string } | { kind: "fence"; label: string; text: string }> = [];
  const re = /```([A-Za-z_-]*)[ \t]*\n?([\s\S]*?)```/g;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) out.push({ kind: "text", text: text.slice(at, m.index) });
    out.push({ kind: "fence", label: m[1] || "", text: m[2].trim() });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out.filter((p) => p.text.trim() !== "" || p.kind === "fence");
}

function SourceText({ text }: { text: string }): React.ReactElement {
  return (
    <div className="wm_source_text">
      {splitFences(text).map((p, i) =>
        p.kind === "text" ? (
          <p key={i} className="wm_para">
            {p.text.trim()}
          </p>
        ) : (
          <p key={i} className="wm_fence">
            {p.label ? <span className="wm_fence_label">{p.label}</span> : null}
            {p.text}
          </p>
        ),
      )}
    </div>
  );
}

/** His own words up front, the whole exchange behind "(…)". Never cut:
 * `lead` is a complete part of the text, `full` is all of it. */
export function sourceWords(text: string, entity: string): Words {
  const { spoken, thinking } = splitUnspokenThinking(text);
  const turns = parseVerbatimTurns(spoken, entity);
  const name = entity.trim().toLowerCase();
  // An episode is one exchange: his answer is his LAST turn. Earlier
  // "nerin:" heads can be memories his tools quoted back to him (read_memory
  // returns past exchanges whole), and "nerin (while looking things up)"
  // is tool output — both stay behind "(…)" with the rest of the exchange.
  const mine = turns ? turns.filter((t) => t.speaker.trim().toLowerCase() === name) : [];
  const lead = mine.length > 0 ? mine[mine.length - 1].text.trim() : (spoken || text).trim();
  const full = thinking ? `${spoken.trim()}\n\n(thinking, unspoken)\n${thinking.trim()}` : text.trim();
  return { phase: "ready", lead, full };
}
