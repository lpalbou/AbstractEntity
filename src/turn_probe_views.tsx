/**
 * The turn probe's three readings (operator 2026-11-07: tools and the
 * system prompt were "unreadable", context cards "can't unfold"):
 *
 * - ToolCall: what was asked, in words; what came back, structured when our
 *   own code wrote it in a known shape (turn_probe_parse.ts), Markdown
 *   through the shared `Words` (no image in a page, a tool result or the
 *   prompt is ever loaded: a same-origin image URL could read a diary
 *   record through the session proxy, and that read is recorded)
 *   otherwise; success or failure at a glance; long results fold behind
 *   "(…)" and the exact text he was given is one click away.
 * - SystemPromptView: the prompt's sections, titled and foldable, his
 *   identity open; the exact text one click away (copy copies it exactly).
 * - ContextMemory: a memory that entered the turn, unfolding to its full
 *   words (the pure record read). A diary record opens only on a click
 *   that says the read is recorded in his biography.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import type { TurnMemory } from "./stream_source";
import type { VerbatimSource } from "./verbatim_modal";
import { getCachedText, textCacheKey } from "./text_cache";
import { readRecordWords, VerbatimTurns, Words } from "./verbatim_view";
import {
  describeToolAsk,
  isDiaryMemory,
  linkHost,
  MEMORY_DIGEST_CAP,
  MEMORY_TITLE_CAP,
  memoryTag,
  parseSystemPrompt,
  readToolResult,
  servedExcerpt,
  splitFences,
  type ListingLine,
  type ToolResultView,
} from "./turn_probe_parse";
import "./turn_probe.css";

/** Render-safe text for server-shaped fields (an object as a React child
 * crashed the app once, React #31). */
export function safeText(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
}

/** Long content folds to a calm height; "(…)" shows all of it. The words
 * are all in the page either way (search and copy find them). */
export function Fold({ children, label = "(…) show all" }: { children: React.ReactNode; label?: string }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured while closed (the cap applies): more words than the cap
    // shows = a "(…)" to open them. Open keeps the last answer.
    const check = () => {
      if (!el.parentElement?.classList.contains("tp_fold_open")) setOverflows(el.scrollHeight > el.clientHeight + 4);
    };
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className={`tp_fold ${open ? "tp_fold_open" : "tp_fold_closed"} ${overflows && !open ? "tp_fold_cut" : ""}`}>
      <div ref={ref} className="tp_fold_body">
        {children}
      </div>
      {overflows || open ? (
        <button className="tp_more" onClick={() => setOpen((v) => !v)}>
          {open ? "fold" : label}
        </button>
      ) : null}
    </div>
  );
}

function ExternalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }): React.ReactElement {
  const safe = /^https?:\/\//i.test(href);
  return safe ? (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <span className={className}>{children}</span>
  );
}

// ------------------------------------------------------------------ tools

export interface ToolDetail {
  name: string;
  arg?: string;
  result?: string;
  success?: boolean;
}

function resultSummary(v: ToolResultView, chars: number): string {
  switch (v.type) {
    case "failed":
      return "did not work";
    case "empty":
      return "no result";
    case "web":
      return `${v.results.length} ${v.results.length === 1 ? "result" : "results"}`;
    case "web_none":
      return "no results";
    case "page":
      return v.cap ? `the first ${v.cap.toLocaleString()} characters of the page` : `${v.content.length.toLocaleString()} characters`;
    case "listing": {
      const rows = v.lines.filter((l) => l.type === "hit" || l.type === "book").length;
      return rows === 0 ? "nothing listed" : `${rows} ${rows === 1 ? "memory" : "memories"} listed`;
    }
    case "file":
      return v.size;
    default:
      return `${chars.toLocaleString()} characters`;
  }
}

function ListingRow({ line }: { line: ListingLine }): React.ReactElement {
  if (line.type === "hit") {
    const h = line.hit;
    return (
      <li className="tp_hit">
        <div className="tp_hit_head">
          <span className={`ei_kind ei_kind_${h.kind}`}>{h.kind}</span>
          <span className="tp_tag">#{h.tag}</span>
          {h.date ? <span className="tp_dim">{h.date.replace("T", " ")}</span> : null}
        </div>
        <div className="tp_hit_text">{h.text}</div>
        <div className="tp_hit_origin">
          {h.origin}
          {h.reread ? <span> · diary entry {h.reread}</span> : null}
        </div>
      </li>
    );
  }
  if (line.type === "book") {
    const b = line.hit;
    return (
      <li className="tp_hit">
        <div className="tp_hit_head">
          <span className="ei_kind ei_kind_diary">diary</span>
          <span className="tp_dim">
            {b.kind} · {b.visibility}
          </span>
          {b.date ? <span className="tp_dim">{b.date.replace("T", " ")}</span> : null}
        </div>
        <div className="tp_hit_text">{b.gist}</div>
        <div className="tp_hit_origin">his book · entry {b.entryId}</div>
      </li>
    );
  }
  if (line.type === "heading") return <li className="tp_listing_heading">{line.text}</li>;
  if (line.type === "note") return <li className="tp_listing_note">{line.text}</li>;
  return <li className="tp_listing_text">{line.text}</li>;
}

function ResultBody({ v }: { v: ToolResultView }): React.ReactElement {
  switch (v.type) {
    case "failed":
      return <div className="tp_failed_text">{v.text}</div>;
    case "empty":
      return <p className="tp_quiet">The tool returned no text.</p>;
    case "web":
      return (
        <Fold label="(…) all results">
          <ol className="tp_web">
            {v.results.map((r, i) => (
              <li key={i} className="tp_web_item">
                <ExternalLink className="tp_web_title" href={r.url}>
                  {r.title || r.url}
                </ExternalLink>
                {r.snippet ? <div className="tp_web_snippet">{r.snippet}</div> : null}
                <div className="tp_web_host">{linkHost(r.url)}</div>
              </li>
            ))}
          </ol>
        </Fold>
      );
    case "web_none":
      return <p className="tp_quiet">The search found nothing for “{v.query}”.</p>;
    case "page":
      return (
        <>
          <div className="tp_page_head">
            <ExternalLink className="tp_page_title" href={v.url}>
              {v.title || v.url}
            </ExternalLink>
            <span className="tp_web_host">{linkHost(v.url)}</span>
          </div>
          <Fold label="(…) all he read of the page">
            <Words text={v.content} className="ev_markdown tp_md" />
          </Fold>
          {v.truncation ? (
            <p className="tp_quiet">
              {v.cap
                ? `The page is longer: he was given its first ${v.cap.toLocaleString()} characters.`
                : `The page was cut: ${v.truncation}`}
            </p>
          ) : null}
        </>
      );
    case "listing":
      return (
        <Fold label="(…) the whole list">
          <ul className="tp_listing">
            {v.lines.map((l, i) => (
              <ListingRow key={i} line={l} />
            ))}
          </ul>
        </Fold>
      );
    case "file":
      return (
        <>
          <div className="tp_page_head">
            <code className="tp_code">{v.path}</code>
          </div>
          <Fold label="(…) the whole file">
            <pre className="tp_file">{v.content}</pre>
          </Fold>
        </>
      );
    default:
      return (
        <Fold>
          <Words text={v.text} className="ev_markdown tp_md" />
        </Fold>
      );
  }
}

export function ToolCall({ t }: { t: ToolDetail }): React.ReactElement {
  const name = safeText(t.name);
  const ask = useMemo(() => describeToolAsk(name, t.arg === undefined ? undefined : safeText(t.arg)), [name, t.arg]);
  const result = t.result === undefined || t.result === null ? null : safeText(t.result);
  const view = useMemo(() => (result === null ? null : readToolResult(name, result, t.success)), [name, result, t.success]);
  const [exact, setExact] = useState(false);
  const failed = view?.type === "failed";
  const empty = view?.type === "empty";
  return (
    <article className={`tp_tool ${failed ? "tp_tool_failed" : ""}`}>
      <header className="tp_tool_head">
        <span className={`tp_status ${failed ? "tp_status_failed" : view && !empty ? "tp_status_ok" : ""}`} aria-hidden="true">
          {failed ? "✗" : view && !empty ? "✓" : "•"}
        </span>
        <div className="tp_ask">
          <span className="tp_verb">{ask.verb}</span>{" "}
          {ask.object !== null ? (
            ask.form === "quote" ? (
              <span className="tp_query">“{ask.object}”</span>
            ) : ask.form === "link" ? (
              <ExternalLink className="tp_link" href={ask.object}>
                {ask.object}
              </ExternalLink>
            ) : ask.form === "code" ? (
              <code className="tp_code">{ask.object}</code>
            ) : ask.form === "count" ? (
              <span className="tp_dim">({ask.object})</span>
            ) : (
              <span className="tp_dim">— {ask.object}</span>
            )
          ) : null}
        </div>
        <span className="tp_toolname" title="The tool's name">
          {name}
        </span>
      </header>
      {ask.extra.length > 0 ? (
        <dl className="tp_args">
          {ask.extra.map(([k, v]) => (
            <div key={k} className="tp_arg">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {ask.raw !== null ? (
        <div className="tp_args">
          <span className="tp_rawarg">{ask.raw}</span>
        </div>
      ) : null}
      {ask.note ? <div className="tp_args tp_dim">{ask.note}</div> : null}
      {view && result !== null ? (
        <div className="tp_result">
          <div className="tp_result_line">
            <span className={failed ? "tp_failed_label" : empty ? "tp_dim" : "tp_ok_label"}>{failed ? "It did not work" : empty ? "Ran" : "Came back"}</span>
            {!failed ? <span className="tp_dim"> · {resultSummary(view, result.length)}</span> : null}
            <span className="tp_spacer" />
            <button className="tp_more" onClick={() => setExact((v) => !v)} title="The result text exactly as he was given it">
              {exact ? "readable view" : "exact text"}
            </button>
          </div>
          {exact ? (
            <Fold>
              <pre className="tp_exact">{result}</pre>
            </Fold>
          ) : (
            <ResultBody v={view} />
          )}
        </div>
      ) : (
        // Honest absence, never accusation: the tool ran; older gateways
        // or a ledger-read hiccup serve no result text for the turn.
        <p className="tp_quiet tp_result">
          Ran — the result text is not served for this turn (an older gateway, a ledger-read hiccup, or nothing to show).
          That alone is not a failed lookup.
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------- system prompt

/** A section's words: Markdown for prose and lists, fenced blocks shown
 * with their opening line (what the entity is taught to write). */
function PromptWords({ text }: { text: string }): React.ReactElement {
  const pieces = useMemo(() => splitFences(text), [text]);
  return (
    <div className="tp_psec_body">
      {pieces.map((p, i) =>
        p.type === "fence" ? (
          <pre key={i} className="tp_fence">
            <span className="tp_fence_open">{p.open}</span>
            {"\n"}
            {p.body}
            {"\n"}
            <span className="tp_fence_open">```</span>
          </pre>
        ) : (
          <Words key={i} text={p.text} className="ev_markdown tp_md" />
        ),
      )}
    </div>
  );
}

export function SystemPromptView({ prompt }: { prompt: string }): React.ReactElement {
  const parsed = useMemo(() => parseSystemPrompt(prompt), [prompt]);
  const [exact, setExact] = useState(false);
  const [open, setOpen] = useState<boolean[]>(() => parsed.sections.map((s) => s.identity));
  const env = parsed.envelope;
  const tokens = Math.floor(prompt.length / 4) + 1; // the runtime's estimate (len // 4 + 1)
  const allOpen = open.every(Boolean);
  return (
    <div className="tp_prompt">
      <div className="tp_prompt_bar">
        <span className="tp_dim">
          {env ? `Identity of ${env.entity ?? "?"} · spark ${env.spark ?? "?"} · as of memory event ${env.as_of_seq ?? "?"} · ` : ""}
          {prompt.length.toLocaleString()} characters, about {tokens.toLocaleString()} tokens
        </span>
        <span className="tp_spacer" />
        {!exact ? (
          <button className="tp_more" onClick={() => setOpen(parsed.sections.map(() => !allOpen))}>
            {allOpen ? "fold all" : "open all"}
          </button>
        ) : null}
        <button className="tp_more" onClick={() => setExact((v) => !v)}>
          {exact ? "read by section" : "exact text"}
        </button>
      </div>
      {exact ? (
        <pre className="tp_exact tp_exact_prompt">{prompt}</pre>
      ) : (
        parsed.sections.map((s, i) => (
          <section key={i} className={`tp_psec ${s.identity ? "tp_psec_identity" : ""} ${open[i] ? "tp_psec_open" : ""}`}>
            <button
              className="tp_psec_head"
              aria-expanded={Boolean(open[i])}
              onClick={() => setOpen((o) => o.map((v, j) => (j === i ? !v : v)))}
            >
              <span className="tp_chev" aria-hidden="true">
                {open[i] ? "▾" : "▸"}
              </span>
              <span className="tp_psec_title">{s.title}</span>
              <span className="tp_dim">{s.body ? `${s.body.split(/\s+/).length.toLocaleString()} words` : "empty"}</span>
            </button>
            {open[i] && s.body ? <PromptWords text={s.body} /> : null}
          </section>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------- context

const WHY_LABEL: Record<string, string> = {
  stimulus: "matched what was said",
  stm: "just worked with it",
  both: "matched + just worked with it",
  self: "identity (always present)",
};

export function whyLabel(m: TurnMemory): string {
  return WHY_LABEL[m.admission ?? ""] ?? (safeText(m.why) || "recalled");
}

/** The memory card's open button. A diary entry opened through the gateway
 * is recorded in his biography; readRecordWords answers from this
 * browser's copy when it has one, and then no read is made — the label
 * says which (unknown counts as recorded). */
export function memoryActionLabel(o: { diary: boolean; cached: boolean | null; phase: FullWords["phase"]; shown: boolean }): string {
  if (o.phase === "ready") return o.shown ? "fold" : o.diary ? "(…) the diary entry again (no new read)" : "(…) his full words";
  const recorded = o.cached ? "already opened in this browser — no new read is recorded" : "opening it is recorded in his biography";
  if (o.phase === "error") return o.diary ? `try again — ${recorded}` : "try again";
  return o.diary ? `(…) open the diary entry — ${recorded}` : "(…) his full words";
}

type FullWords = { phase: "idle" } | { phase: "loading" } | { phase: "ready"; text: string; note: string | null } | { phase: "error"; message: string };

export function ContextMemory({ m, source }: { m: TurnMemory; source: VerbatimSource }): React.ReactElement {
  const kind = safeText(m.kind) || "memory";
  const graphId = safeText(m.graph_id);
  const tag = safeText(m.tag) || memoryTag(graphId);
  const diary = isDiaryMemory({ kind, graph_id: graphId });
  const [words, setWords] = useState<FullWords>({ phase: "idle" });
  const [shown, setShown] = useState(false);
  // A local check only (this browser's text cache), never a gateway read.
  const [cached, setCached] = useState<boolean | null>(null);
  useEffect(() => {
    if (!diary || !graphId) return;
    let live = true;
    getCachedText(textCacheKey(source.baseUrl, source.entity, `verbatim:${graphId}`))
      .then((c) => live && setCached(Boolean(c)))
      .catch(() => live && setCached(null));
    return () => {
      live = false;
    };
  }, [diary, graphId, source.baseUrl, source.entity]);
  const activation = m.activation ?? {};
  const total = typeof activation.total === "number" ? activation.total : null;
  const title = servedExcerpt(safeText(m.title), MEMORY_TITLE_CAP);
  const digest = servedExcerpt(safeText(m.digest), MEMORY_DIGEST_CAP);

  // Read only on the operator's click — for a diary record, the click is
  // the recorded read its label announces.
  const unfold = () => {
    if (words.phase === "ready") {
      setShown((v) => !v);
      return;
    }
    setWords({ phase: "loading" });
    setShown(true);
    readRecordWords(source, graphId, diary ? "diary" : kind)
      .then((w) => setWords(w.text ? { phase: "ready", text: w.text, note: w.note } : { phase: "error", message: "no words were served for this memory" }))
      .catch((e) => setWords({ phase: "error", message: `its words could not be read (${(e as Error).message})` }));
  };

  return (
    <article className="tp_mem">
      <div className="tp_mem_head">
        <span className={`ei_kind ei_kind_${kind}`}>{kind}</span>
        <span className="tp_mem_title">{title.text ? `${title.text}${title.cut ? "…" : ""}` : tag ? `#${tag}` : "a memory"}</span>
        {tag ? <span className="tp_tag">#{tag}</span> : null}
      </div>
      {digest.text && !(shown && words.phase === "ready") ? (
        <div className="tp_mem_digest">
          {digest.text}
          {digest.cut ? "…" : ""}
        </div>
      ) : null}
      {shown && words.phase === "loading" ? <p className="tp_quiet">reading his words…</p> : null}
      {shown && words.phase === "error" ? <p className="tp_quiet tp_failed_label">{words.message}</p> : null}
      {shown && words.phase === "ready" ? (
        <div className="tp_mem_full">
          {words.note ? <p className="ei_verbatim_note">{words.note}</p> : null}
          <VerbatimTurns text={words.text} entity={source.entity} />
        </div>
      ) : null}
      <div className="tp_mem_actions">
        {graphId ? (
          <button
            className="tp_more"
            onClick={unfold}
            title={diary ? "Opening a diary entry is recorded in his biography, like the Book" : "His full words, as recorded"}
          >
            {memoryActionLabel({ diary, cached, phase: words.phase, shown })}
          </button>
        ) : (
          <span className="tp_dim">This memory has no record address, so its full words cannot be opened here.</span>
        )}
      </div>
      <div className="tp_mem_meta">
        <span title="Why this memory entered the context">{whyLabel(m)}</span>
        {m.born_at ? <span title="When this memory was born">{safeText(m.born_at).slice(0, 16).replace("T", " ")}</span> : null}
        {m.origin ? <span title="Where it came from — his own retellings are not corroborations">{safeText(m.origin)}</span> : null}
        <span title="Lifetime selected count — never decays">used {m.global_count ?? 0}×</span>
        {total !== null ? <span title="Temporal activation right now (decays with disuse)">warmth {total.toFixed(1)}</span> : null}
        {m.tokens ? <span title="Prompt tokens this memory cost">~{m.tokens} tokens</span> : null}
      </div>
    </article>
  );
}
