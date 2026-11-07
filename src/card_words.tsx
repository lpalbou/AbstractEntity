/**
 * A world-model card's own words, readable and never cut (operator
 * 2026-11-07: "never truncate … improve the formatting").
 *
 * The sleep pass writes a mechanical card in one fixed shape
 * (abstractmemory world_model._floor_digest):
 *   What I know of <name>:
 *   [Standing feeling: …]
 *   - <date>: <gist of a source, cut at 150 characters>   (newest first)
 *   (from N lived record(s), <first> to <last>, <kinds>. Threads: …. <reminder>)
 * Each gist quotes a source from its start (markers stripped, whitespace
 * folded), so a quote is shown with the source's full words when its text
 * is the start of one source's words (exact prefix, nothing guessed); a
 * quote that matches none is shown as written, pointing to the sources.
 * A card in any other shape (his own prose) renders as Markdown.
 */

import React, { useEffect, useMemo, useState } from "react";

import { bookDate } from "./book_reader";
import { dayUtc } from "./ledger_lines";
import type { FoldState, NodeState } from "./stream_fold";
import type { VerbatimSource } from "./verbatim_modal";
import { restBlocksAsText } from "./verbatim_parse";
import { readRecordWords, Words } from "./verbatim_view";
import { isDiarySource, selectCardSources, sourceWords } from "./world_model_sources";

export interface MechanicalCard {
  name: string;
  feeling: string | null;
  quotes: Array<{ date: string; text: string; cut: boolean }>;
  footer: { count: number; first: string; last: string; kinds: string; threads: string[]; reminder: string } | null;
  footerRaw: string | null;
}

/** The mechanical card's parts, or null when the text has another shape. */
export function parseMechanicalCard(text: string): MechanicalCard | null {
  const lines = String(text || "").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  const head = lines[0]?.match(/^What I know of (.+):$/);
  if (!head) return null;
  const card: MechanicalCard = { name: head[1], feeling: null, quotes: [], footer: null, footerRaw: null };
  for (const line of lines.slice(1)) {
    const q = line.match(/^- (\d{4}-\d{2}-\d{2}): (.*)$/);
    if (q) {
      card.quotes.push({ date: q[1], text: q[2].replace(/…$/, ""), cut: q[2].endsWith("…") });
    } else if (/^Standing feeling:/.test(line)) {
      card.feeling = line;
    } else if (/^\(from \d+ lived record/.test(line)) {
      card.footerRaw = line;
      const f = line.match(/^\(from (\d+) lived record\(s\), (\S+) to (\S+), ([^.]*)\.(?: Threads: ([^.]*)\.)? (.*)\)$/);
      if (f) {
        card.footer = {
          count: Number(f[1]),
          first: f[2],
          last: f[3],
          kinds: f[4],
          threads: (f[5] ?? "").split(",").map((t) => t.trim()).filter(Boolean),
          reminder: f[6],
        };
      }
    } else {
      return null; // a shape this reader does not know: show the text as written
    }
  }
  return card;
}

const fold = (s: string) => s.replace(/\s+/g, " ").trim();

/** The source a quote cites. The card writes "<date>: <gist>", the gist
 * being the start of the source's words; a quote matches a source when the
 * dates agree and the quote's words after the last "<name>: " head are the
 * exact start of the source's answer (or the whole quote the start of its
 * words). The matched text must say enough to identify one memory (at
 * least MIN_MATCH characters, or the whole uncut quote), and a quote that
 * fits two sources matches none — a wrong match would show words the card
 * never meant. */
export const MIN_MATCH = 24;

export function matchQuote(
  quote: { date: string; text: string; cut: boolean },
  entity: string,
  sources: Array<{ graphId: string; full: string; answer: string; date: string }>,
): string | null {
  const q = fold(quote.text);
  const head = `${entity.trim().toLowerCase()}: `;
  const at = q.toLowerCase().lastIndexOf(head);
  const tail = at >= 0 ? q.slice(at + head.length) : q;
  if (!tail || (tail.length < MIN_MATCH && quote.cut)) return null;
  const hits = sources.filter((s) => s.date === quote.date && (fold(s.answer).startsWith(tail) || fold(s.full).startsWith(q)));
  return hits.length === 1 ? hits[0].graphId : null;
}

/** The part of a quote before his answer (what was said to him), if any. */
export function quoteCue(quoteText: string, entity: string): string {
  const q = fold(quoteText);
  const head = `${entity.trim().toLowerCase()}: `;
  const at = q.toLowerCase().lastIndexOf(head);
  return at > 0 ? q.slice(0, at).trim() : "";
}

export function CardWords({ foldState, card, source, onSelect }: { foldState: FoldState; card: NodeState; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Array<{ graphId: string; full: string; answer: string; date: string; node: NodeState | null }>>([]);
  const sources = useMemo(() => selectCardSources(foldState, card), [foldState, card]);
  const sourceKey = sources.map((s) => s.graphId).join(",");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    readRecordWords(source, card.graph_id ?? card.id, card.kind)
      .then((w) => !cancelled && setText(w.text))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, card.graph_id, card.kind, source.baseUrl, source.entity]);

  useEffect(() => {
    let cancelled = false;
    // Diary sources are never read here (a read is recorded in his biography).
    const readable = sources.filter((s) => !isDiarySource(s));
    Promise.all(
      readable.map((s) =>
        readRecordWords(source, s.graphId, s.node?.kind)
          .then((w) => {
            const words = sourceWords(w.text, source.entity);
            return { graphId: s.graphId, full: w.text, answer: words.phase === "ready" ? words.lead : "", date: dayUtc(s.bornAt), node: s.node };
          })
          .catch(() => null),
      ),
    ).then((rows) => !cancelled && setAnswers(rows.filter((r): r is NonNullable<typeof r> => r !== null)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, source.baseUrl, source.entity]);

  if (error) return <p className="ei_note">The card's words could not be read ({error}).</p>;
  if (text === null) return <p className="ei_note">reading the card…</p>;
  const parsed = parseMechanicalCard(text);
  if (!parsed) return <Words text={text} className="ev_markdown ei_verbatim_md" />;
  return (
    <div className="wmc_card">
      <p className="wmc_head">
        What I know of <strong>{parsed.name}</strong>
      </p>
      {parsed.feeling ? <p className="wmc_feeling">{parsed.feeling}</p> : null}
      <ul className="wmc_quotes">
        {parsed.quotes.map((q, i) => {
          const gid = matchQuote(q, source.entity, answers);
          const cue = quoteCue(q.text, source.entity);
          const hit = gid ? answers.find((a) => a.graphId === gid) : null;
          const when = hit?.node?.born_at ? bookDate(hit.node.born_at) : null;
          return (
            <li key={i} className="wmc_quote">
              <span className="wmc_date">{when ? `${when.day}, ${when.time}` : q.date}</span>
              {hit ? (
                <>
                  {cue ? <span className="wmc_cue">{cue}</span> : null}
                  <Words text={restBlocksAsText(hit.answer)} className="ev_markdown wmc_text" />
                  {hit.node ? (
                    <button className="wm_open" onClick={() => onSelect(hit.node!.id)}>
                      open this memory →
                    </button>
                  ) : null}
                </>
              ) : (
                <span className="wmc_text">
                  {q.text}
                  {q.cut ? <span className="wmc_cut"> (…) the full words are in “What he drew on” above</span> : null}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {parsed.footer ? (
        <p className="wmc_footer">
          From {parsed.footer.count} lived {parsed.footer.count === 1 ? "memory" : "memories"} ({parsed.footer.kinds}),{" "}
          {parsed.footer.first === parsed.footer.last ? bookDate(parsed.footer.first).day : `${bookDate(parsed.footer.first).day} to ${bookDate(parsed.footer.last).day}`}
          {parsed.footer.threads.length > 0 ? (
            <>
              {" · threads: "}
              {parsed.footer.threads.map((t) => (
                <span key={t} className="wmc_thread">
                  {t}
                </span>
              ))}
            </>
          ) : null}
          <span className="wmc_reminder">{parsed.footer.reminder}</span>
        </p>
      ) : parsed.footerRaw ? (
        <p className="wmc_footer">{parsed.footerRaw}</p>
      ) : null}
    </div>
  );
}
