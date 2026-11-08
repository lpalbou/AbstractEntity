/**
 * A lived moment (an episode), read the way the operator asked
 * (2026-11-07: "the first thing i want to see are (a) the meta and (b) the
 * summary of that episode. the rest are the additional data related to
 * it."):
 *
 * - EpisodeDetail (the Detail tab): what kind of moment it was and the
 *   record's facts, then its summary (its stored understanding when the
 *   gateway serves it, with who wrote it, as of when and its earlier
 *   readings; else the digest a recall served, else the saved title, said
 *   so), then the exchange, then how he got there.
 * - LivedExchangeView (everywhere a whole exchange is shown, through
 *   VerbatimTurns): what was said to him, his answer, and "How he got
 *   there" — folded, in plain words, each lookup through the turn panel's
 *   readable views, his unspoken thinking set apart. The exact text as
 *   saved is one click away.
 *
 * Everything is read from the runtime's own format (episode_parse.ts).
 */

import React, { useEffect, useMemo, useState } from "react";

import type { NodeState } from "./stream_fold";
import type { VerbatimSource } from "./verbatim_modal";
import { shapeLabel } from "./node_label";
import { turnLabel } from "./ledger_lines";
import { describeToolAsk } from "./turn_probe_parse";
import { Fold, ToolCall } from "./turn_probe_views";
import { exchangeSpeakers, readRecordWords, VerbatimTurns, Words, type RecordWords } from "./verbatim_view";
import { restBlocksAsText } from "./verbatim_parse";
import { servedDigest, UNSERVED_SENTENCE } from "./understanding";
import { DigestNotYet, EarlierUnderstandings, ProvenanceLine } from "./understanding_view";
import {
  askFromResult,
  howSentence,
  lookupCounts,
  lookupsInWords,
  notRunCount,
  parseLivedExchange,
  type LivedExchange,
  type Lookup,
} from "./episode_parse";
import "./episode_view.css";

// ------------------------------------------------------------ in words

/** "person:admin" → "admin" for a sentence (the chip keeps the full id). */
export function speakerName(id: string): string {
  return String(id || "").replace(/^(person|agent|entity):/, "").split("@", 1)[0];
}

/** The card's heading. */
export function momentTitle(ex: LivedExchange | null, visit: boolean): string {
  if (!ex) return "A lived moment";
  if (ex.ownTime) return "A moment of his own time";
  if (ex.door) return "The start of a visit";
  return `${visit ? "A visit with" : "A conversation with"} ${speakerName(ex.cueSpeaker)}`;
}

/** The "moment" fact: what kind, and its tick (his own time) or turn —
 * the ledger's own words for the same id (ledger_lines turnLabel). */
export function momentFact(ex: LivedExchange, visit: boolean, turnId: string | null): string {
  const kind = ex.ownTime ? "his own time" : ex.door ? "the start of a visit" : visit ? "a visit" : "a conversation";
  const when = turnId ? turnLabel(turnId, ex.ownTime) : "";
  return when ? `${kind} · ${when}` : kind;
}

/** The "lookups" fact. */
export function lookupsFact(ex: LivedExchange): string {
  const counts = lookupCounts(ex.rounds);
  const total = counts.reduce((s, [, n]) => s + n, 0);
  const skipped = notRunCount(ex.rounds);
  const base = total === 0 ? "none — he answered without looking anything up" : `${total} — he ${lookupsInWords(counts)}`;
  return skipped > 0 ? `${base} · ${skipped === 1 ? "one more did" : `${skipped} more did`} not run` : base;
}

/** The record's title as a stand-in summary, and how it was cut: the
 * runtime saves "exchange: " + one extracted sentence (from either side)
 * cut at 14 words with "…" (digest.py). The record's full summary, its
 * digest, reaches the app only in the recall snapshots (node.digest). */
export function episodeSummary(title: string): { text: string; cut: "words" | "short" | null } {
  const raw = String(title || "").trim();
  const text = shapeLabel(raw);
  if (!text) return { text: "", cut: null };
  if (/^exchange:/i.test(raw) && text.endsWith("…")) return { text, cut: "words" };
  if (text.endsWith("…") || text.endsWith("...")) return { text, cut: "short" };
  return { text, cut: null };
}

// --------------------------------------------------------------- lookups

/** A lookup he asked for that the door did not run, in words. */
export function notRunWords(l: Extract<Lookup, { type: "not_run" }>): string {
  if (l.reason === "refused") return `He asked for ${l.name ? `the tool ${l.name}` : "a tool"}, which is not available to him, so it did not run.`;
  if (l.reason === "failed") return `He asked to use ${l.name} without saying what to look up, so it did not run.`;
  return "One more lookup did not run: he had reached this turn's limit.";
}

function NotRunLine({ l }: { l: Extract<Lookup, { type: "not_run" }> }): React.ReactElement {
  return <p className="ep_not_run">{notRunWords(l)}</p>;
}

function QuietLookup({ name, text }: { name: string; text: string }): React.ReactElement {
  return (
    <article className="tp_tool">
      <header className="tp_tool_head">
        <span className="tp_status" aria-hidden="true">
          •
        </span>
        <div className="tp_ask">
          <span className="tp_verb">{describeToolAsk(name, undefined).verb}</span>
        </div>
        <span className="tp_toolname" title="The tool's name">
          {name}
        </span>
      </header>
      <p className="tp_quiet tp_result">{text}</p>
    </article>
  );
}

export function LookupView({ l }: { l: Lookup }): React.ReactElement {
  if (l.type === "not_run") return <NotRunLine l={l} />;
  if (l.returned === "in_book") return <QuietLookup name={l.name} text="What it returned stays in his book and memory; it is not kept with this moment." />;
  if (l.returned === "not_kept") return <QuietLookup name={l.name} text="This older moment did not keep what came back." />;
  const ask = askFromResult(l.name, l.result);
  return <ToolCall t={{ name: l.name, arg: ask ? JSON.stringify(ask) : undefined, result: l.result }} />;
}

// ------------------------------------------------------------- the moment

export function HowHeGotThere({ ex, defaultOpen = false }: { ex: LivedExchange; defaultOpen?: boolean }): React.ReactElement | null {
  const [open, setOpen] = useState(defaultOpen);
  if (ex.rounds.length === 0 && !ex.reasoning) return null;
  const n = ex.rounds.length;
  const anyLookup = ex.rounds.some((r) => r.lookups.some((l) => l.type === "ran"));
  return (
    <section className={`ep_how ${open ? "ep_how_open" : ""}`}>
      <button type="button" className="ep_how_head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="ep_chev" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="ep_how_title">How he got there</span>
      </button>
      <p className="ep_how_line">
        {howSentence(ex)}
        {open && anyLookup ? " What each one returned:" : ""}
      </p>
      {open ? (
        <div className="ep_how_body">
          {ex.rounds.map((r, i) => {
            const did = lookupsInWords(lookupCounts([r]));
            return (
              <div key={i} className="ep_round">
                {n > 1 ? (
                  <div className="ep_round_head">
                    Pass {i + 1} of {n}
                    {did ? ` — he ${did}` : ""}
                  </div>
                ) : null}
                {r.thinking ? (
                  <div className="ep_thinking">
                    <span className="ep_thinking_label">His thinking, not said aloud</span>
                    <Words text={r.thinking} className="ev_markdown ep_md" />
                  </div>
                ) : null}
                {r.lookups.map((l, j) => (
                  <LookupView key={j} l={l} />
                ))}
                {r.unmatched ? (
                  <div className="ep_unmatched">
                    <span className="ep_thinking_label">Also returned, as written</span>
                    <Fold>
                      <pre className="tp_exact">{r.unmatched}</pre>
                    </Fold>
                  </div>
                ) : null}
              </div>
            );
          })}
          {ex.reasoning ? (
            <div className="ep_thinking">
              <span className="ep_thinking_label">His private reasoning, not said aloud</span>
              <Words text={ex.reasoning} className="ev_markdown ep_md" />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function cueLabel(ex: LivedExchange): string {
  if (ex.ownTime) return "His own time began with";
  if (ex.door) return "His home announced the visit";
  return `${speakerName(ex.cueSpeaker)} said`;
}

/** What was said to him, his answer, how he got there, the exact text. */
export function LivedExchangeView({ ex, raw, defaultOpen = false }: { ex: LivedExchange; raw: string; defaultOpen?: boolean }): React.ReactElement {
  const [exact, setExact] = useState(false);
  return (
    <div className="ep_exchange">
      <div className="ep_turn">
        <span className="ep_who">{cueLabel(ex)}</span>
        {ex.cue ? <Words text={restBlocksAsText(ex.cue)} className="ev_markdown ep_md" /> : <p className="tp_quiet">(no words)</p>}
      </div>
      <div className="ep_turn ep_turn_self">
        <span className="ep_who">{ex.answerSpeaker} answered</span>
        {ex.answer ? <Words text={restBlocksAsText(ex.answer)} className="ev_markdown ep_md" /> : <p className="tp_quiet">(no words)</p>}
      </div>
      <HowHeGotThere ex={ex} defaultOpen={defaultOpen} />
      <div className="ep_exact_bar">
        <button type="button" className="tp_more" onClick={() => setExact((v) => !v)} title="Every word of this moment, exactly as it was saved">
          {exact ? "fold the exact text" : "(…) the exact text, as saved"}
        </button>
      </div>
      {exact ? <pre className="tp_exact ep_exact">{raw}</pre> : null}
    </div>
  );
}

// ------------------------------------------------------------ the Detail

type Phase = { phase: "loading" } | { phase: "ready"; words: RecordWords } | { phase: "none"; message: string };

export interface EpisodeBodyProps {
  node: NodeState;
  entity: string;
  state: Phase;
  /** The record's facts grid with the rows passed in first. */
  renderFacts(extra: React.ReactNode): React.ReactNode;
  defaultOpen?: boolean;
}

/** The episode's Detail for one read state (pure: the reading is
 * EpisodeDetail's). */
export function EpisodeBody({ node, entity, state, renderFacts, defaultOpen = false }: EpisodeBodyProps): React.ReactElement {
  const text = state.phase === "ready" ? state.words.text : "";
  const ex = useMemo(() => (text ? parseLivedExchange(text, entity) : null), [text, entity]);
  const visit = Boolean(node.visit_id);
  const turnId = state.phase === "ready" ? state.words.turnId : null;
  const summary = episodeSummary(node.title);
  const digest = typeof node.digest === "string" && node.digest.trim() ? node.digest.trim() : null;
  // The stored understanding the record read served (understanding.ts).
  const read = state.phase === "ready" ? state.words.understanding : null;
  const understanding = read && read.served ? read.understanding : null;
  const unserved = Boolean(read && !read.served);
  const stored = understanding ? servedDigest(understanding) : null;
  const extra = ex ? (
    <>
      <dt>moment</dt>
      <dd>{momentFact(ex, visit, turnId)}</dd>
      <dt>lookups</dt>
      <dd>{lookupsFact(ex)}</dd>
    </>
  ) : null;
  return (
    <>
      <h3 className="ei_title">{momentTitle(ex, visit)}</h3>
      {renderFacts(extra)}
      <section className="ep_summary">
        <h4 className="ep_h">Summary</h4>
        {understanding ? (
          <>
            {stored ? <Words text={stored} className="ev_markdown ep_summary_text" /> : <DigestNotYet />}
            <ProvenanceLine understanding={understanding} />
            <EarlierUnderstandings understanding={understanding} />
          </>
        ) : digest ? (
          <>
            <Words text={digest} className="ev_markdown ep_summary_text" />
            <p className="ep_summary_note">{unserved ? UNSERVED_SENTENCE : "The summary saved with the record, as it was saved."}</p>
          </>
        ) : (
          <>
            {summary.text ? <Words text={summary.text} className="ev_markdown ep_summary_text" /> : <p className="tp_quiet">No title was saved with this moment.</p>}
            <p className="ep_summary_note">
              {summary.text
                ? `The title saved with the record${summary.cut === "words" ? " (cut at 14 words when saved)" : summary.cut === "short" ? " (cut short when saved)" : ""}. `
                : ""}
              {unserved ? `${UNSERVED_SENTENCE} Everything that was said is below.` : "The fuller summary arrives once this memory is recalled; everything that was said is below."}
            </p>
          </>
        )}
      </section>
      <section className="ep_section">
        <h4 className="ep_h">The exchange</h4>
        {state.phase === "loading" ? <p className="ei_note">reading his words…</p> : null}
        {state.phase === "none" ? <p className="ei_note">{state.message}</p> : null}
        {state.phase === "ready" && ex ? <LivedExchangeView ex={ex} raw={text} defaultOpen={defaultOpen} /> : null}
        {state.phase === "ready" && !ex ? (
          text ? (
            <VerbatimTurns text={text} entity={entity} />
          ) : (
            <p className="ei_note">No words were served for this moment.</p>
          )
        ) : null}
      </section>
    </>
  );
}

/** Reads the episode's words (the pure record read — an episode is never
 * diary-shaped; the caller checks) and reports who else was there. */
export function EpisodeDetail({
  node,
  source,
  renderFacts,
  onSpeakers,
}: {
  node: NodeState;
  source: VerbatimSource;
  renderFacts(extra: React.ReactNode): React.ReactNode;
  onSpeakers?(speakers: string[]): void;
}): React.ReactElement {
  const [state, setState] = useState<Phase>({ phase: "loading" });
  const graphId = node.graph_id ?? node.id;
  useEffect(() => {
    let live = true;
    setState({ phase: "loading" });
    readRecordWords(source, graphId, node.kind)
      .then((words) => {
        if (!live) return;
        setState({ phase: "ready", words });
        const ex = words.text ? parseLivedExchange(words.text, source.entity) : null;
        onSpeakers?.(ex ? exchangeSpeakers(ex) : []);
      })
      .catch((e: Error & { status?: number }) => {
        if (!live) return;
        setState({
          phase: "none",
          message: e.status === 404 ? "No words are kept for this moment." : `His words could not be read right now (${e.message}).`,
        });
      });
    return () => {
      live = false;
    };
    // Field deps, never the source OBJECT (an inline parent literal would
    // re-read per render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphId, node.kind, source.baseUrl, source.entity]);
  return <EpisodeBody node={node} entity={source.entity} state={state} renderFacts={renderFacts} />;
}
