/**
 * A world model, read as a model (operator 2026-11-07: "a world model is
 * your evolving understanding/perspective on a thing and over time … it is
 * NOT a verbatim of everything we have said about that thing").
 *
 * Order, after abstractnote's entity card (summary as of a date, how the
 * view evolved, then the references):
 *   1. What it is: name, first formed, revisions (who wrote each), last
 *      updated, evidence span, threads.
 *   2. His understanding: the latest words HE authored (abstractruntime
 *      chat.py card authoring → abstractmemory author_world_model). When he
 *      has not yet put it into words, that is said plainly — the sleep
 *      pass's mechanical card only gathers evidence.
 *   3. How his view evolved: each revision, oldest first — who wrote it,
 *      what it added, his words at that time when he wrote them.
 *   4. Where it comes from: the source memories, one line each; his words
 *      on request.
 * Revisions are the card's `refines` chain; sources its `derived_from`.
 */

import React, { useEffect, useMemo, useState } from "react";

import { bookDate } from "./book_reader";
import { parseMechanicalCard } from "./card_words";
import type { FoldState, NodeState } from "./stream_fold";
import type { VerbatimSource } from "./verbatim_modal";
import { readRecordWords, Words } from "./verbatim_view";
import { MemoryRows, selectCardSources } from "./world_model_sources";

/** The card's revisions, oldest first, by following `refines` back. */
export function revisionChain(fold: FoldState, card: NodeState): NodeState[] {
  const row = (gid: string) => fold.nodes.get(fold.graph_to_row.get(gid) ?? gid) ?? null;
  const refines = new Map<string, string>();
  for (const e of fold.structural_edges.values()) if (e.relation === "refines") refines.set(e.source_graph_id, e.target_graph_id);
  const chain: NodeState[] = [card];
  const seen = new Set<string>([card.graph_id ?? card.id]);
  let at = refines.get(card.graph_id ?? card.id);
  while (at && !seen.has(at)) {
    seen.add(at);
    const n = row(at);
    if (!n) break;
    chain.push(n);
    at = refines.get(at);
  }
  return chain.reverse();
}

/** What one revision says: his authored words, or the evidence floor. The
 * mechanical card has one fixed shape (card_words.parseMechanicalCard);
 * anything else was authored, and memory carries later evidence after it
 * as "\n\nSince then …" (abstractmemory world_model._authored_lead). */
export function readRevision(text: string): { authored: string | null; since: string | null; threads: string[]; name: string | null; feeling: string | null } {
  const mech = parseMechanicalCard(text);
  if (mech) return { authored: null, since: null, threads: mech.footer?.threads ?? [], name: mech.name, feeling: mech.feeling };
  const [lead, ...rest] = String(text || "").split("\n\nSince then");
  return { authored: lead.trim() || null, since: rest.length ? `Since then${rest.join("\n\nSince then")}`.trim() : null, threads: [], name: null, feeling: null };
}

function nameOf(card: NodeState): string {
  return String(card.title || "").replace(/^World model:\s*/i, "").trim() || "this";
}

export function WorldModelView({ fold, card, source, onSelect }: { fold: FoldState; card: NodeState; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement {
  const chain = useMemo(() => revisionChain(fold, card), [fold, card]);
  const sources = useMemo(() => selectCardSources(fold, card), [fold, card]);
  const chainKey = chain.map((n) => n.id).join(",");
  const [texts, setTexts] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    // Card revisions are born-digest records: a pure read, no access recorded.
    Promise.all(
      chain.map((n) =>
        readRecordWords(source, n.graph_id ?? n.id, "world_model")
          .then((w) => [n.id, w.text] as const)
          .catch(() => [n.id, null] as const),
      ),
    ).then((rows) => !cancelled && setTexts(Object.fromEntries(rows)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainKey, source.baseUrl, source.entity]);

  const read = chain.map((n) => ({ node: n, text: texts[n.id], view: texts[n.id] ? readRevision(texts[n.id] as string) : null }));
  const loaded = read.every((r) => r.text !== undefined);
  const latestAuthored = [...read].reverse().find((r) => r.view?.authored);
  const current = read[read.length - 1];
  const name = current?.view?.name || nameOf(card);
  const threads = [...read].reverse().find((r) => (r.view?.threads.length ?? 0) > 0)?.view?.threads ?? [];
  const feeling = [...read].reverse().find((r) => r.view?.feeling)?.view?.feeling ?? null;
  const authoredCount = read.filter((r) => r.view?.authored).length;
  const first = chain[0];
  const span = sources.length > 0 ? { from: sources[0].bornAt, to: sources[sources.length - 1].bornAt } : null;
  const day = (iso: string | undefined) => (iso ? bookDate(iso).day : "unknown");
  const stamp = (iso: string | undefined) => (iso ? `${bookDate(iso).day}, ${bookDate(iso).time}` : "unknown");

  return (
    <div className="wmv">
      <dl className="wmv_facts">
        <dt>first formed</dt>
        <dd>{stamp(first?.born_at)}</dd>
        <dt>revisions</dt>
        <dd>
          {chain.length}
          {loaded ? ` — ${authoredCount === 0 ? "none written by him yet" : `${authoredCount} written by him`}, ${chain.length - authoredCount} gathered by the sleep pass` : ""}
        </dd>
        <dt>last updated</dt>
        <dd>{stamp(card.born_at)}</dd>
        <dt>evidence</dt>
        <dd>
          {sources.length} {sources.length === 1 ? "memory" : "memories"}
          {span ? (day(span.from) === day(span.to) ? `, ${day(span.from)}` : `, ${day(span.from)} to ${day(span.to)}`) : ""}
        </dd>
        {threads.length > 0 ? (
          <>
            <dt>threads</dt>
            <dd>
              {threads.map((t) => (
                <span key={t} className="wmv_thread">
                  {t}
                </span>
              ))}
            </dd>
          </>
        ) : null}
        {feeling ? (
          <>
            <dt>feeling</dt>
            <dd>{feeling.replace(/^Standing feeling:\s*/, "")}</dd>
          </>
        ) : null}
      </dl>

      <section className="wmv_section">
        <h4 className="wmv_head">His understanding of {name}</h4>
        {!loaded ? (
          <p className="ei_note">reading the card…</p>
        ) : latestAuthored?.view?.authored ? (
          <>
            <p className="wmv_as_of">as of {stamp(latestAuthored.node.born_at)}</p>
            <Words text={latestAuthored.view.authored} className="ev_markdown wmv_understanding" />
            {current?.view?.since && current === latestAuthored ? <p className="wmv_since">{current.view.since}</p> : null}
            {current !== latestAuthored ? (
              <p className="wmv_since">
                The sleep pass has added evidence since ({stamp(card.born_at)}); his words above are not yet revised to include it.
              </p>
            ) : null}
          </>
        ) : (
          <p className="wmv_empty">
            He has not put his understanding of {name} into words yet. So far this card only gathers the evidence below — the sleep pass collects it
            without a model. He writes his understanding when he reflects on a conversation that involves {name}.
          </p>
        )}
      </section>

      {chain.length > 1 ? (
        <section className="wmv_section">
          <h4 className="wmv_head">How his view evolved</h4>
          <ol className="wmv_timeline">
            {read.map((r, i) => {
              const before = i > 0 ? selectCardSources(fold, read[i - 1].node).length : 0;
              const now = selectCardSources(fold, r.node).length;
              const added = Math.max(0, now - before);
              return (
                <li key={r.node.id} className="wmv_step">
                  <span className="wmv_when">{stamp(r.node.born_at)}</span>
                  <span className="wmv_what">
                    {r.view?.authored ? "he wrote his understanding" : i === 0 ? "the card formed from his memories" : "the sleep pass gathered more evidence"}
                    {i === 0 ? ` — ${now} ${now === 1 ? "memory" : "memories"}` : added > 0 ? ` — ${added} new ${added === 1 ? "memory" : "memories"}` : ""}
                  </span>
                  {r.view?.authored ? <Words text={r.view.authored} className="ev_markdown wmv_step_words" /> : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section className="wmv_section">
        <h4 className="wmv_head">Where it comes from</h4>
        <p className="wmv_note">The memories this card was built from; open one to read his words.</p>
        <MemoryRows items={sources} source={source} onSelect={onSelect} collapsed />
      </section>
    </div>
  );
}
