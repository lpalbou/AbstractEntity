/**
 * chat_message_list — the drawer's thread rendering, moved verbatim out of
 * chat_drawer.tsx (fable5 consolidation plan B, operator's clean-the-
 * abstraction order c5379): the message list, the context fold card, the
 * probe badge, and the turn-decoration splitter. Zero coupling to drawer
 * state beyond props — the extraction is mechanical.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";

import { ChatMessageCard, type ChatMessage } from "@abstractframework/panel-chat";

import type { ChatTurnResult } from "./stream_source";

/** A thread message, optionally carrying its turn's probe payload — the
 * discreet "system" badge under a reply opens it (maintainer, 2026-07-08:
 * the facts bubble was louder than the words). `context` carries the
 * runtime's presence+MEMORIES decoration, folded OFF the card (operator
 * 2026-07-15: keep the chat clean — progressive disclosure). */
export type DrawerMessage = ChatMessage & { detail?: ChatTurnResult; context?: string };

/** The runtime decorates each visit turn's user message APPEND-ONCE with
 * presence + a MEMORIES block ahead of the visitor's words
 * (visit_workflow RENDER: `presence \n\n block \n\n text`; both parts are
 * single paragraphs — bullets are \n-joined). Split them so the chat shows
 * the WORDS, with the context foldable behind one line. Unrecognized
 * shapes pass through whole — never guess at someone's words. */
export function splitVisitDecoration(content: string): { context: string | null; text: string } {
  const paras = content.split("\n\n");
  let i = 0;
  const ctx: string[] = [];
  if (i < paras.length && paras[i].startsWith("(present with you:")) {
    ctx.push(paras[i]);
    i += 1;
  }
  if (i < paras.length && paras[i].startsWith("MEMORIES (")) {
    ctx.push(paras[i]);
    i += 1;
  }
  if (ctx.length === 0) return { context: null, text: content };
  const text = paras.slice(i).join("\n\n").trim();
  // A decoration with no words after it is not a user turn we understand —
  // keep the original whole rather than rendering an empty card.
  if (!text) return { context: null, text: content };
  return { context: ctx.join("\n\n"), text };
}

/** One-line folded context card: "▸ context · presence + N memories".
 * Folded by default; the full decoration is one click away (and stays
 * selectable text when open). */
export function ContextFoldCard({ context }: { context: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const memoryCount = useMemo(() => context.split("\n").filter((l) => l.startsWith("- ")).length, [context]);
  const hasPresence = context.startsWith("(present with you:");
  const label = [hasPresence ? "presence" : null, memoryCount > 0 ? `${memoryCount} memories in context` : null].filter(Boolean).join(" · ") || "context";
  return (
    <div className={`cd_ctxfold ${open ? "cd_ctxfold_open" : ""}`}>
      <button
        className="cd_ctxfold_head"
        onClick={() => setOpen((v) => !v)}
        title="What this moment reminded him of (the runtime rendered these memories into his context for this turn)"
        aria-expanded={open}
      >
        <span className="cd_ctxfold_arrow">{open ? "▾" : "▸"}</span>
        <span className="cd_ctxfold_label">context · {label}</span>
      </button>
      {open ? <pre className="cd_ctxfold_body">{context}</pre> : null}
    </div>
  );
}

/** Is the turn's tool gauge TRUSTWORTHY? The visit lane's tools_ran was
 * structurally zero (incident report 2026-07-16, agent F3: the adapter
 * never wrote turn_captures["tools_ran"] — laurent reasoned on a broken
 * gauge). Evidence of a live gauge: a non-empty tools_ran, OR the
 * tool_details field being PRESENT (even empty = a verified zero). An
 * absent field on a zero count is an unverifiable zero — say so, never
 * assert "0 tools" from a gauge that cannot read. */
export function toolGaugeTrustworthy(detail: ChatTurnResult): boolean {
  return (detail.tools_ran ?? []).length > 0 || detail.tool_details !== undefined;
}

export function badgeLabel(detail: ChatTurnResult): string {
  const parts: string[] = [];
  if (typeof detail.memories_in_context === "number") parts.push(`${detail.memories_in_context} memories`);
  const formed = Array.isArray(detail.records_formed) ? detail.records_formed.length : detail.records_formed ? 1 : 0;
  if (formed) parts.push(`${formed} formed`);
  const diary = Array.isArray(detail.diary_entries) ? detail.diary_entries.length : detail.diary_entries ? 1 : 0;
  if (diary) parts.push(`${diary} diary`);
  // The tool count is ALWAYS shown, zero included (seq 43: a reader must
  // SEE the zero next to a reply that talks like it looked things up) —
  // but only a TRUSTWORTHY zero renders as "0 tools".
  const toolCount = (detail.tools_ran ?? []).length;
  if (toolCount > 0 || toolGaugeTrustworthy(detail)) {
    parts.push(`${toolCount} tool${toolCount === 1 ? "" : "s"}`);
  } else {
    parts.push("tools unverified");
  }
  if (detail.files && detail.files.length > 0) parts.push(`${detail.files.length} file${detail.files.length === 1 ? "" : "s"}`);
  if ((detail.notices ?? []).length > 0) parts.push(`${(detail.notices ?? []).length} notice${(detail.notices ?? []).length === 1 ? "" : "s"}`);
  return parts.join(" · ") || "details";
}

export function ChatMessageList({
  messages,
  onDetail,
  onSpeakToggle,
  getSpeakState,
  onFocusMessage,
}: {
  messages: DrawerMessage[];
  onDetail(detail: ChatTurnResult): void;
  /** Speaker (TTS) wiring — forwarded verbatim to the card's existing
   * slots (the button already sits before copy, uic c1221). Absent =
   * speaker hidden (unsupported browser or direct-bearer posture). */
  onSpeakToggle?: (m: ChatMessage) => void;
  getSpeakState?: (m: ChatMessage) => "idle" | "loading" | "playing" | "paused";
  /** Scroll-follow for the Cognitive Monitor: reports the id of the newest
   * ASSISTANT message visible at the scroll position, or null when stuck
   * to the bottom (= the latest reply is the mood shown). */
  onFocusMessage?: (id: string | null) => void;
}): React.ReactElement {
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const focusRafRef = useRef(0);
  const lastFocusRef = useRef<string | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const report = () => {
      focusRafRef.current = 0;
      if (!onFocusMessage) return;
      let next: string | null = null;
      if (!stickRef.current) {
        // The newest assistant message whose top sits above the viewport's
        // lower edge (i.e. the one the operator is reading).
        const viewBottom = el.scrollTop + el.clientHeight - 32;
        const rows = el.querySelectorAll<HTMLElement>('[data-role="assistant"]');
        for (const row of rows) {
          if (row.offsetTop <= viewBottom) next = row.dataset.mid ?? next;
        }
      }
      if (next !== lastFocusRef.current) {
        lastFocusRef.current = next;
        onFocusMessage(next);
      }
    };
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
      if (!focusRafRef.current) focusRafRef.current = requestAnimationFrame(report);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (focusRafRef.current) cancelAnimationFrame(focusRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFocusMessage]);

  useEffect(() => {
    if (stickRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div ref={listRef} className="pc-chat-thread cd_thread">
      {messages.length === 0 ? <span className="cd_note">Say hello — he knows you knocked.</span> : null}
      {messages.map((m) => (
        <div key={m.id} className="cd_msg" data-mid={m.id} data-role={m.role}>
          {/* System notes render as discreet grey italic hints, never full
            * cards (operator 2026-07-15: "Rejoined the open visit" was much
            * too big). Warn/error levels keep a visible tint. */}
          {m.role === "system" ? (
            <div className={`cd_syshint ${m.level === "warn" ? "cd_syshint_warn" : ""} ${m.level === "error" ? "cd_syshint_error" : ""}`}>{m.content}</div>
          ) : (
            <>
              {m.context ? <ContextFoldCard context={m.context} /> : null}
              <ChatMessageCard message={m} onSpeakToggle={onSpeakToggle} getSpeakState={getSpeakState} />
            </>
          )}
          {m.detail ? (
            <button
              className="cd_sysbadge"
              onClick={() => onDetail(m.detail!)}
              title="What moved in his mind this turn — memories in context, formations, tools, files"
            >
              <span className="cd_sysbadge_dot" aria-hidden="true" />
              system · {badgeLabel(m.detail)}
            </button>
          ) : null}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
