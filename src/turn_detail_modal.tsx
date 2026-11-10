/**
 * The turn probe (maintainer ask, 2026-07-08): one click on the discreet
 * "system" badge under a reply opens everything the turn DID —
 *
 * - memories that entered his context (why, lifetime use count, temporal
 *   activation, token cost, digest),
 * - memories/diary entries formed,
 * - tools that actually ran (driver-authored) with their arguments,
 * - files read/written/listed in the workspace,
 * - notices (marker imitation, refusals, fallbacks).
 *
 * "The goal is really to be able to probe the input context and the
 * outcomes." Everything here is driver-authored data; nothing is parsed
 * from reply prose.
 *
 * Readable (operator 2026-11-07): tools, the system prompt and context
 * memories render through turn_probe_views.tsx, which reads only formats
 * our own code emits (turn_probe_parse.ts) and keeps every exact text one
 * click away.
 */

import React, { useEffect, useRef, useState } from "react";

import type { ChatTurnResult } from "./stream_source";
import { toolClaimVerdict } from "./tool_claim_guard";
import { clipboardWrite, COPY_FAILED } from "./lib/secure-context";
import type { VerbatimSource } from "./verbatim_modal";
import { diaryEntryWords, turnDiaryEntries, turnFormedIds } from "./reply_notices_summary";
import { MEMORY_DIGEST_CAP, MEMORY_TITLE_CAP, servedExcerpt, summarizeTools } from "./turn_probe_parse";
import { ContextMemory, safeText, SystemPromptView, ToolCall, whyLabel, type ToolDetail } from "./turn_probe_views";
import { WordsLine } from "./words_line";

export interface TurnDetailModalProps {
  turn: ChatTurnResult;
  entityName: string;
  /** Where a context memory's full words are read (the pure record read). */
  source: VerbatimSource;
  /** The tab it opens on: the chip clicked under his reply (memories and what formed: context). */
  initialTab?: ProbeTab;
  onClose(): void;
}

export type ProbeTab = "context" | "tools" | "system";

async function copyToClipboard(text: string, done: (msg: string) => void): Promise<void> {
  done((await clipboardWrite(text)) ? "copied" : COPY_FAILED);
}

export function TurnDetailModal({ turn, entityName, source, initialTab = "context", onClose }: TurnDetailModalProps): React.ReactElement {
  const [tab, setTab] = useState<ProbeTab>(initialTab);
  const [copied, setCopied] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Each tab opens at its top (the body is one scroller for all three).
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // DEFENSE-IN-DEPTH (maintainer correction, 2026-07-11: identity is ALWAYS
  // in context and never counts as retrieved/selected memories): the driver
  // already excludes self-admitted handles from report.memories — if a
  // future driver ever leaked one, it must render UNCOUNTED under its own
  // heading, never inflate "N memories".
  const allHandles = turn.memories ?? [];
  const memories = allHandles.filter((m) => m.admission !== "self");
  const identityRows = allHandles.filter((m) => m.admission === "self");
  // tool_details EMPTY is not "no tools" (laurent dm#56 pt3: the visit
  // lane serves tool_details:[] for uncaptured details while tools_ran
  // carries the real names — `??` never fell through, so the modal said
  // "Tools 0 / No lookups" over a turn full of searches). Non-empty
  // details win (args+results); otherwise the driver-authored names.
  const tools: ToolDetail[] =
    turn.tool_details && turn.tool_details.length > 0 ? turn.tool_details : (turn.tools_ran ?? []).map((name) => ({ name }));
  const files = turn.files ?? [];
  const notices = turn.notices ?? [];
  const formedList = turnFormedIds(turn.records_formed);
  // The visit lane serves each entry as an object (`{entry_id, kind, visibility, projected_record_id,
  // title}`), never a string: rendering one as a child was the panel's React error #31 (2026-11-10).
  const diaryList = turnDiaryEntries(turn.diary_entries);
  const systemPrompt = turn.system_prompt ?? "";
  // Prose-claim vs driver-fact mismatch (seq 43 R6): flagged, never parsed
  // into facts — tools_ran stays the only authority on what ran.
  const claimVerdict = toolClaimVerdict(turn.reply, turn.tools_ran);

  const contextText = (): string => {
    const lines = [
      `# Context — ${turn.turn_id ?? "this turn"} (${memories.length} memories)`,
      "Each memory as the turn report serves it: its title and digest, ending with \"…\" where the report cut them. Open a card for its full words.",
      "",
    ];
    for (const m of memories) {
      const title = servedExcerpt(safeText(m.title), MEMORY_TITLE_CAP);
      lines.push(`## ${safeText(m.kind) || "memory"} — ${title.text ? title.text + (title.cut ? "…" : "") : safeText(m.tag) || m.graph_id || "?"}`);
      const meta = [`why: ${whyLabel(m)}`];
      if (m.born_at) meta.push(`born ${safeText(m.born_at).slice(0, 16)}`);
      if (m.origin) meta.push(`origin ${safeText(m.origin)}`);
      meta.push(`used ${m.global_count ?? 0}×`, `~${m.tokens ?? "?"} tok`);
      lines.push(meta.join(" · "));
      const digest = servedExcerpt(safeText(m.digest), MEMORY_DIGEST_CAP);
      if (digest.text) lines.push(digest.text + (digest.cut ? "…" : ""));
      lines.push("");
    }
    return lines.join("\n");
  };
  const toolsText = (): string =>
    tools.length === 0
      ? "no tools ran this turn"
      : tools
          .map((t) => `## ${safeText(t.name)} ${safeText(t.arg)}\n${t.result ? safeText(t.result) : "(no result returned to the entity — see the agency note)"}`)
          .join("\n\n");

  const flash = (msg: string) => {
    setCopied(msg);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div
      className="ev_backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ev_panel tdm_panel">
        <div className="ev_head">
          <div className="ev_title">
            <span className="ei_kind ei_kind_summary">turn</span>
            <span>
              {turn.turn_id ?? "this turn"} — what moved in {entityName}'s mind
            </span>
          </div>
          <button className="ev_close" onClick={onClose}>
            close
          </button>
        </div>
        <div className="tdm_tabs">
          <button className={`tdm_tab ${tab === "context" ? "tdm_tab_on" : ""}`} onClick={() => setTab("context")}>
            Context <span className="tdm_count">{turn.memories === undefined ? "–" : memories.length}</span>
          </button>
          <button className={`tdm_tab ${tab === "tools" ? "tdm_tab_on" : ""}`} onClick={() => setTab("tools")}>
            Tools <span className="tdm_count">{tools.length}</span>
          </button>
          <button className={`tdm_tab ${tab === "system" ? "tdm_tab_on" : ""}`} onClick={() => setTab("system")}>
            System prompt
          </button>
          <span className="tdm_tab_spacer" />
          <button
            className="tdm_copy"
            title="Copy this tab's content to the clipboard"
            onClick={() =>
              void copyToClipboard(tab === "context" ? contextText() : tab === "tools" ? toolsText() : systemPrompt, flash)
            }
          >
            {copied ?? "⧉ copy"}
          </button>
        </div>
        <div ref={bodyRef} className="ev_body tdm_body">
          {tab === "context" ? (
            <>
              <section>
                {memories.length === 0 ? (
                  <div className="tdm_quiet">
                    <WordsLine
                      text={
                        turn.memories === undefined
                          ? "Which memories entered this turn is not served here: only a turn sent from this page carries them (a rejoined or reloaded conversation keeps its tools only)."
                          : "No memories beyond his identity core entered this turn."
                      }
                    />
                  </div>
                ) : (
                  memories.map((m, i) => <ContextMemory key={m.record_id || m.graph_id || m.tag || i} m={m} source={source} />)
                )}
                {identityRows.length > 0 ? (
                  <>
                    <h4 className="tdm_h">identity — always present, never counted</h4>
                    {identityRows.map((m, i) => (
                      <ContextMemory key={m.record_id || m.graph_id || m.tag || `id${i}`} m={m} source={source} />
                    ))}
                  </>
                ) : null}
              </section>
              <section>
                <h4 className="tdm_h">
                  Formed this turn <span className="tdm_count">{formedList.length + diaryList.length}</span>
                </h4>
                {formedList.length === 0 && diaryList.length === 0 ? (
                  <div className="tdm_quiet">
                    <WordsLine
                      text={
                        turn.records_formed === undefined && turn.diary_entries === undefined
                          ? "What this turn formed is not served here (only a turn sent from this page carries it)."
                          : "Nothing formed (the turn did not complete a memory)."
                      }
                    />
                  </div>
                ) : (
                  <ul className="tdm_list">
                    {formedList.map((id, i) => (
                      <li key={id ?? `unreadable${i}`}>
                        <span className="ei_kind ei_kind_episode">memory</span> {id ? <code>{id}</code> : <WordsLine text="a record this page cannot read" inline />}
                      </li>
                    ))}
                    {diaryList.map((entry, i) => (
                      <li key={entry.entryId || i}>
                        <span className="ei_kind ei_kind_diary">diary</span> <WordsLine text={diaryEntryWords(entry)} inline />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {files.length > 0 ? (
                <section>
                  <h4 className="tdm_h">
                    Files touched <span className="tdm_count">{files.length}</span>
                  </h4>
                  <ul className="tdm_list">
                    {files.map((f, i) => (
                      <li key={i}>
                        <span className={`tdm_action tdm_action_${safeText(f.action)}`}>{safeText(f.action)}</span> <code>{safeText(f.path)}</code>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}

          {tab === "tools" ? (
            <section>
              {claimVerdict.fabricated ? (
                <div className="tdm_fabricated" title="The reply's prose claims a lookup; the driver-authored record shows zero tools ran. The claimed evidence was never fetched.">
                  <WordsLine text="⚠ The reply claims a lookup, but no tools ran this turn — the claimed evidence was not fetched." />
                  {claimVerdict.claims.slice(0, 3).map((c, i) => (
                    <div key={i} className="tdm_claim_snippet">
                      <WordsLine text={`“${c.snippet}”`} />
                    </div>
                  ))}
                </div>
              ) : null}
              {tools.length === 0 ? (
                <div className="tdm_quiet">
                  <WordsLine text="No lookups — the reply came from context alone." />
                </div>
              ) : (
                <>
                  <div className="tp_tools_summary">
                    <WordsLine text={summarizeTools(tools)} />
                  </div>
                  {tools.map((t, i) => (
                    <ToolCall key={i} t={t} />
                  ))}
                </>
              )}
              {notices.length > 0 ? (
                <div className="tdm_notices_block">
                  <h4 className="tdm_h">Notices</h4>
                  <ul className="tdm_list tdm_notices">
                    {notices.map((n, i) => (
                      <li key={i}>
                        <WordsLine text={safeText(n)} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === "system" ? (
            <section>
              {systemPrompt ? (
                <SystemPromptView prompt={systemPrompt} />
              ) : (
                <div className="tdm_quiet">
                  <WordsLine text="The system prompt is not served for this turn — when it rides the turn response, the exact prompt sent to the model shows here." />
                </div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
