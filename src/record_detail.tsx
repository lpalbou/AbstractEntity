/**
 * The Detail tab's cards, informative first (operator 2026-11-07: "clicking
 * on a memory should always give us the key information and meta first.
 * then we can deep dive if needed with proper progressive disclosure"):
 *
 *   1. what it is — its title, its kind in plain words, its summary in full
 *      when the app has one;
 *   2. the facts — one compact grid;
 *   3. the rest — its words, feelings, what it was used with, the night's
 *      signals — each folded, one click away, nothing cut.
 *
 * Every text goes through the shared Markdown renderer (`Words`, panel-chat
 * Markdown with images as links); a one-line place uses `WordsLine`, the
 * same renderer laid out inline by CSS, never stripped (operator: "every
 * text rendered on the abstractentity app must use the shared markdown
 * renderer component").
 *
 * The summary is the record's stored understanding (understanding.ts) when
 * the gateway serves it — for a summary, a card or a dream it IS the
 * content — with who wrote it, as of when and why, and its earlier
 * readings folded (understanding_view.tsx).
 *
 * A diary entry's words are never read until the operator asks: the read
 * is recorded in his biography.
 */

import React, { useEffect, useState } from "react";

import type { FeelingEvent, FoldState, NodeState, StandingState } from "./stream_fold";
import type { VerbatimSource } from "./verbatim_modal";
import { fetchDiaryEntry } from "./stream_source";
import { shapeLabel } from "./node_label";
import { getCachedText, putCachedText, textCacheKey } from "./text_cache";
import { readRecordWords, VerbatimTurns, Words, type RecordWords } from "./verbatim_view";
import { DreamDetail } from "./dream_detail";
import { dreamLine, kindWords, standingLine, wordsReadOnOpen } from "./record_detail_parts";
import { WordsLine as SharedWordsLine } from "./words_line";
import { Disclosure } from "./detail_fold";
import { servedDigest } from "./understanding";
import { CutSummary } from "./understanding_view";
import { DigestNotYet, EarlierUnderstandings, ProvenanceLine, UnservedNote } from "./understanding_view";
import "./record_detail.css";

export { Disclosure };

// ------------------------------------------------------------ shared parts

/** One line of his words: the app's one inline renderer (words_line.tsx). */
export const WordsLine = ({ text, className = "" }: { text: string; className?: string }): React.ReactElement => <SharedWordsLine text={text} inline className={className} />;

/** The record's display title (scaffolding prefixes off, as everywhere). */
export function recordTitle(node: NodeState): string {
  if (node.kind === "dream") return "A dream";
  return shapeLabel(node.title || "") || node.id.slice(0, 24);
}

/** A belief closed: key information, shown with what replaced it. */
export function ClosedNotice({ fold, node, onSelect }: { fold: FoldState; node: NodeState; onSelect(id: string): void }): React.ReactElement | null {
  if (!node.closed) return null;
  return (
    <div className="ei_closed">
      <strong>{node.closed.kind === "supersede" ? "Superseded" : "Retracted"}</strong>
      {node.closed.reason ? <Words text={node.closed.reason} className="ev_markdown rd_reason" /> : null}
      {node.closed.replacement_ids.length > 0 ? (
        <div className="ei_replacements">
          replaced by{" "}
          {node.closed.replacement_ids.map((rid) => {
            const row = fold.graph_to_row.get(rid) ?? rid;
            const target = fold.nodes.get(row);
            return (
              <button key={rid} className="ei_link rd_row_link" onClick={() => onSelect(row)}>
                <WordsLine text={target?.title || rid} />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Every feeling event, newest first, each reason in his words. */
export function FeelingEventList({ events }: { events: FeelingEvent[] }): React.ReactElement | null {
  if (events.length === 0) return null;
  return (
    <div className="ei_feeling_list">
      {[...events].reverse().map((ev, i) => (
        <div key={`${ev.seq}-${i}`} className="ei_feeling_row">
          <span className={`ei_feeling_sign ${ev.sign >= 0 ? "ei_feeling_pos" : "ei_feeling_neg"}`}>
            {ev.kind === "appraisal" ? `${ev.sign >= 0 ? "+" : "−"}${ev.magnitude}` : ev.kind}
          </span>
          <span className="ei_feeling_body">
            {ev.reason ? <WordsLine text={ev.reason} /> : "no reason recorded"}
            <span className="ei_feeling_when">{ev.observed_at ? ` · ${ev.observed_at.slice(0, 16).replace("T", " ")} UTC` : ""}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function Peaks({ standing }: { standing: StandingState }): React.ReactElement {
  return (
    <>
      {standing.bonds.map((b) => (
        <div key={b.event_id} className="ei_peak ei_peak_bond">
          <strong>A bond</strong> (strength {b.magnitude}) — {b.reason ? <WordsLine text={b.reason} /> : "no reason recorded"}
        </div>
      ))}
      {standing.scars.map((s) => (
        <div key={s.event_id} className="ei_peak ei_peak_scar">
          <strong>A scar</strong> (strength {s.magnitude}) — {s.reason ? <WordsLine text={s.reason} /> : "no reason recorded"}
        </div>
      ))}
    </>
  );
}

// ----------------------------------------------------------- the words

type Read = { phase: "idle" } | { phase: "loading" } | { phase: "ready"; words: RecordWords } | { phase: "none"; message: string };

function readError(e: Error & { status?: number }): Read {
  return { phase: "none", message: e.status === 404 ? "No words are kept for this record beyond what is shown above." : `Its words could not be read right now (${e.message}).` };
}

/** A diary entry's words, read only on the operator's click; the button
 * says whether that read is recorded (unknown counts as recorded). */
function DiaryWords({ node, source }: { node: NodeState; source: VerbatimSource }): React.ReactElement {
  const key = node.entry_id ? `diary:${node.entry_id}` : `verbatim:${node.graph_id ?? node.id}`;
  const [cached, setCached] = useState<boolean | null>(null);
  const [state, setState] = useState<Read>({ phase: "idle" });
  useEffect(() => {
    let live = true;
    setState({ phase: "idle" });
    getCachedText(textCacheKey(source.baseUrl, source.entity, key))
      .then((c) => live && setCached(Boolean(c)))
      .catch(() => live && setCached(null));
    return () => {
      live = false;
    };
  }, [key, source.baseUrl, source.entity]);
  const open = async () => {
    setState({ phase: "loading" });
    try {
      if (node.entry_id) {
        const ck = textCacheKey(source.baseUrl, source.entity, key);
        let c = await getCachedText(ck);
        if (!c) {
          const entry = await fetchDiaryEntry(source.baseUrl, source.entity, node.entry_id, "operator review (detail)");
          c = { text: String(entry.text ?? entry.gist ?? "") };
          if (c.text) void putCachedText(ck, c);
        }
        setState({ phase: "ready", words: { text: c.text || "", note: null, turnId: null, born: false, understanding: null } });
      } else {
        setState({ phase: "ready", words: await readRecordWords(source, node.graph_id ?? node.id, "diary") });
      }
    } catch (e) {
      setState(readError(e as Error & { status?: number }));
    }
  };
  if (state.phase === "ready") return <VerbatimTurns text={state.words.text} entity={source.entity} />;
  if (state.phase === "loading") return <div className="ei_note wl_p"><SharedWordsLine text={"reading his words…"} /></div>;
  return (
    <>
      {state.phase === "none" ? <div className="ei_note wl_p"><SharedWordsLine text={state.message} /></div> : null}
      <button type="button" className="tp_more" onClick={() => void open()} title="Opening a diary entry is recorded in his biography, like the Book">
        {cached ? "(…) the entry again — already opened in this browser, no new read is recorded" : "(…) open the entry — opening it is recorded in his biography"}
      </button>
    </>
  );
}

// ---------------------------------------------------------- the record

export interface RecordDetailProps {
  fold: FoldState;
  node: NodeState;
  source: VerbatimSource | null;
  /** The facts grid, with the rows passed in first. */
  renderFacts(extra: React.ReactNode): React.ReactNode;
  onSelect(id: string): void;
  onSpeakers?(speakers: string[]): void;
}

/** Any record but a lived moment and a world model: what it is, its facts,
 * then its words and the rest. */
export function RecordDetail({ fold, node, source, renderFacts, onSelect, onSpeakers }: RecordDetailProps): React.ReactElement {
  const eager = Boolean(source) && wordsReadOnOpen(node);
  const [state, setState] = useState<Read>({ phase: eager ? "loading" : "idle" });
  const graphId = node.graph_id ?? node.id;
  useEffect(() => {
    if (!source || !eager) {
      setState({ phase: "idle" });
      return;
    }
    let live = true;
    setState({ phase: "loading" });
    readRecordWords(source, graphId, node.kind)
      .then((words) => live && setState({ phase: "ready", words }))
      .catch((e) => live && setState(readError(e as Error & { status?: number })));
    return () => {
      live = false;
    };
    // Field deps, never the source object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphId, node.kind, eager, source?.baseUrl, source?.entity]);
  return <RecordBody fold={fold} node={node} source={source} state={state} renderFacts={renderFacts} onSelect={onSelect} onSpeakers={onSpeakers} />;
}

export interface RecordBodyProps extends RecordDetailProps {
  state: Read;
}

/** One read state of a record's card (pure: the reading is RecordDetail's). */
export function RecordBody({ fold, node, source, state, renderFacts, onSelect, onSpeakers }: RecordBodyProps): React.ReactElement {
  const words = state.phase === "ready" ? state.words : null;
  const born = Boolean(words?.born);
  const digest = typeof node.digest === "string" && node.digest.trim() ? node.digest.trim() : null;
  const diary = !wordsReadOnOpen(node) && node.kind !== "relation" && !node.bookkeeping;
  const dream = node.kind === "dream";
  // The stored understanding the record read served (null: not read, or a
  // diary record); `unserved`: this gateway does not serve it.
  const read = words?.understanding ?? null;
  const understanding = read && read.served ? read.understanding : null;
  const unserved = Boolean(read && !read.served);
  const stored = understanding ? servedDigest(understanding) : null;
  // Its words were cut when saved (the gateway's `cut`: the read's, else
  // the fold's for the digest a recall served): one line instead of them;
  // the words as saved stay below.
  const cut = understanding ? understanding.cut === true : node.digest_cut === true;
  // The summary: the stored understanding when served (a summary's, a
  // card's or a dream's words ARE it); else words born as the whole record;
  // else the digest a recall served; a dream is also told by what it moved.
  let summary: React.ReactNode = null;
  if (understanding) {
    summary = (
      <>
        {stored ? cut ? <CutSummary /> : <Words text={stored} className="ev_markdown rd_summary" /> : <DigestNotYet />}
        <ProvenanceLine understanding={understanding} />
        {dream ? <p className="rd_key_line">{dreamLine(node.signals)}</p> : null}
      </>
    );
  } else if (dream) summary = <p className="rd_key_line">{dreamLine(node.signals)}</p>;
  else if (born && words?.text) summary = <Words text={words.text} className="ev_markdown rd_summary" />;
  else if (digest && !diary) summary = cut ? <CutSummary /> : <Words text={digest} className="ev_markdown rd_summary" />;
  const summaryNote: React.ReactNode = understanding
    ? null
    : unserved
      ? <UnservedNote />
      : dream
        ? null
        : born
          ? "These words are the whole record: it was born as words."
          : digest && !diary
            ? cut
              ? null
              : "The summary saved with the record, as it was saved."
            : diary
              ? "The runtime keeps only the first 120 characters of an entry as its summary (a runtime fix is planned); the whole entry is in his Book, below."
              : node.bookkeeping || node.kind === "relation"
                ? null
                : state.phase === "loading"
                  ? "reading his summary…"
                  : state.phase === "none"
                    ? state.message
                    : "The fuller summary arrives once this memory is recalled.";
  // The words as saved, folded — unless they are the summary shown above
  // (a summary, card or dream without a verbatim serves its digest as its
  // words), the read served none, or it found none (said above).
  // A cut summary is not shown: its words are, in the fold.
  const wordsAreTheSummary = Boolean(stored && !cut && words && words.text.trim() === stored);
  const noWords = Boolean(words && !words.text.trim());
  const wordsFold = !diary && wordsReadOnOpen(node) && (!born || dream) && !wordsAreTheSummary && !noWords && state.phase !== "none";
  return (
    <>
      <h3 className="ei_title">
        <WordsLine text={recordTitle(node)} />
      </h3>
      <p className="rd_kind">{kindWords(node)}</p>
      <ClosedNotice fold={fold} node={node} onSelect={onSelect} />
      {summary ? <div className="rd_key">{summary}</div> : null}
      {typeof summaryNote === "string" ? <p className="rd_note">{summaryNote}</p> : summaryNote}
      {renderFacts(null)}
      {understanding ? <EarlierUnderstandings understanding={understanding} /> : null}
      {dream && source ? <DreamDetail fold={fold} dream={node} source={source} onSelect={onSelect} /> : null}
      {diary ? (
        <Disclosure title="His words in the book" summary="not read until you open them">
          {source ? <DiaryWords node={node} source={source} /> : <div className="ei_note wl_p"><SharedWordsLine text={"His book can be read when the app is connected to his gateway (this is an exported file)."} /></div>}
        </Disclosure>
      ) : null}
      {wordsFold ? (
        <Disclosure title={dream ? "The sleep pass's own summary" : "The words as saved"} summary={state.phase === "loading" ? "reading…" : undefined}>
          {!source ? <div className="ei_note wl_p"><SharedWordsLine text={"His words can be read when the app is connected to his gateway (this is an exported file)."} /></div> : null}
          {state.phase === "loading" ? <div className="ei_note wl_p"><SharedWordsLine text={"reading his words…"} /></div> : null}
          {dream && words ? <div className="ei_note wl_p"><SharedWordsLine text={"A mechanical summary that quotes titles cut short — what the night touched is listed above in full."} /></div> : null}
          {words ? <VerbatimTurns text={words.text} entity={source?.entity ?? ""} onSpeakers={onSpeakers} plain={dream} /> : null}
        </Disclosure>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------- a feeling

export function StandingDetail({ fold, standing, onSelect }: { fold: FoldState; standing: StandingState; onSelect(id: string): void }): React.ReactElement {
  const target = fold.nodes.get(fold.graph_to_row.get(standing.target_id) ?? standing.target_id) ?? null;
  const net = standing.positive - standing.negative;
  return (
    <div className="ei_card">
      <div className="ei_kind_row">
        <span className="ei_kind ei_kind_standing">feeling</span>
      </div>
      <h3 className="ei_title">{target ? <WordsLine text={recordTitle(target)} /> : standing.target_id}</h3>
      <p className="rd_kind">How he feels toward {target ? "this memory" : "them"} — both sides kept, never netted away</p>
      <div className="rd_key">
        <p className="rd_key_line">{standingLine(standing)}</p>
        <Peaks standing={standing} />
        {standing.healed_count > 0 ? <div className="ei_peak ei_peak_healed">{standing.healed_count} scar{standing.healed_count === 1 ? "" : "s"} healed — the wound became a lesson.</div> : null}
        {standing.broken_count > 0 ? <div className="ei_peak ei_peak_scar">{standing.broken_count} bond{standing.broken_count === 1 ? "" : "s"} broken.</div> : null}
      </div>
      <dl className="ei_facts">
        <dt>positive</dt>
        <dd>
          +{standing.positive} ({standing.positive_count})
        </dd>
        <dt>negative</dt>
        <dd>
          −{standing.negative} ({standing.negative_count})
        </dd>
        <dt>net</dt>
        <dd>{net >= 0 ? `+${net}` : `${net}`}</dd>
        <dt>toward</dt>
        <dd>{target ? kindWords(target).toLowerCase() : standing.target_id}</dd>
      </dl>
      {target ? (
        <button className="wm_open" onClick={() => onSelect(target.id)}>
          open the memory →
        </button>
      ) : null}
      {standing.events.length > 0 ? (
        <Disclosure title="Every feeling event" summary={`${standing.events.length}`}>
          <FeelingEventList events={standing.events} />
        </Disclosure>
      ) : null}
    </div>
  );
}
