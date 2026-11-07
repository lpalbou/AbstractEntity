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
import { Markdown } from "@abstractframework/panel-chat";

import { bookDate } from "./book_reader";
import type { FoldState, NodeState } from "./stream_fold";
import type { VerbatimSource } from "./verbatim_modal";
import { restBlocksAsText } from "./verbatim_parse";
import { readRecordWords } from "./verbatim_view";
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

/** The source whose words a quote starts: the quote (or its part after the
 * last "<name>: " head) must be the exact start of the source's folded
 * words or of its answer. */
export function matchQuote(quote: string, entity: string, sources: Array<{ graphId: string; full: string; answer: string }>): string | null {
  const q = fold(quote);
  const head = `${entity.trim().toLowerCase()}: `;
  const cut = q.toLowerCase().lastIndexOf(head);
  const tail = cut >= 0 ? q.slice(cut + head.length) : q;
  if (!tail) return null;
  for (const s of sources) {
    if (fold(s.answer).startsWith(tail) || fold(s.full).startsWith(q)) return s.graphId;
  }
  return null;
}

export function CardWords({ foldState, card, source, onSelect }: { foldState: FoldState; card: NodeState; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Array<{ graphId: string; full: string; answer: string; node: NodeState | null }>>([]);
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
            return { graphId: s.graphId, full: w.text, answer: words.phase === "ready" ? words.lead : "", node: s.node };
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
  if (!parsed) return <Markdown text={text} className="ev_markdown ei_verbatim_md" />;
  return (
    <div className="cw_card">
      <p className="cw_head">
        What I know of <strong>{parsed.name}</strong>
      </p>
      {parsed.feeling ? <p className="cw_feeling">{parsed.feeling}</p> : null}
      <ul className="cw_quotes">
        {parsed.quotes.map((q, i) => {
          const gid = matchQuote(q.text, source.entity, answers);
          const hit = gid ? answers.find((a) => a.graphId === gid) : null;
          const when = hit?.node?.born_at ? bookDate(hit.node.born_at) : null;
          return (
            <li key={i} className="cw_quote">
              <span className="cw_date">{when ? `${when.day}, ${when.time}` : q.date}</span>
              {hit ? (
                <>
                  <Markdown text={restBlocksAsText(hit.answer)} className="ev_markdown cw_text" />
                  {hit.node ? (
                    <button className="wm_open" onClick={() => onSelect(hit.node!.id)}>
                      open this memory →
                    </button>
                  ) : null}
                </>
              ) : (
                <span className="cw_text">
                  {q.text}
                  {q.cut ? <span className="cw_cut"> (…) the full words are in “What he drew on” above</span> : null}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {parsed.footer ? (
        <p className="cw_footer">
          From {parsed.footer.count} lived {parsed.footer.count === 1 ? "memory" : "memories"} ({parsed.footer.kinds}),{" "}
          {parsed.footer.first === parsed.footer.last ? bookDate(parsed.footer.first).day : `${bookDate(parsed.footer.first).day} to ${bookDate(parsed.footer.last).day}`}
          {parsed.footer.threads.length > 0 ? (
            <>
              {" · threads: "}
              {parsed.footer.threads.map((t) => (
                <span key={t} className="cw_thread">
                  {t}
                </span>
              ))}
            </>
          ) : null}
          <span className="cw_reminder">{parsed.footer.reminder}</span>
        </p>
      ) : parsed.footerRaw ? (
        <p className="cw_footer">{parsed.footerRaw}</p>
      ) : null}
    </div>
  );
}
