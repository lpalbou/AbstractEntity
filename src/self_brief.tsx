/**
 * HIS SELF-KNOWLEDGE BRIEF on the identity card (operator test round 2, 2026-11-10; root backlog 1197,
 * this app's 0011). AbstractRuntime writes `self_brief.md` at the home root at the end of a night's
 * topics stage (identity/self_brief.py: 200-400 tokens, his topics with their titles and one line
 * each, then his main trails of thought; a header with `version_seq`, `written_at`, `tokens`). The
 * Files view lists the workspace, not the home root, so the brief has this place of its own, under
 * "What he knows about, at a glance", with the time it was written.
 *
 * The route is `GET /api/gateway/entities/{name}/self-brief` (AbstractGateway c6ca5128, read through
 * the runtime's `read_self_brief`): `{text, written_at, version, tokens}` (`version` = the communities
 * version the brief describes); 404 `{"detail": {"code": "no_brief", "message"}}` before the first
 * sleep that wrote one; 500 with the runtime's reason for a file that is not a brief. A gateway
 * without the route answers FastAPI's own 404 (`{"detail": "Not Found"}`): the section says in one
 * sentence that it does not serve the brief yet. Any other refusal shows its served message. Nothing
 * is composed in the app.
 */
import React, { useEffect, useRef, useState } from "react";
import { joinBaseUrl } from "@abstractframework/ui-kit";

import { gatewayReadHeaders } from "./stream_source";
import { WordsLine } from "./words_line";
import "./self_brief.css";

export const SELF_BRIEF_HEADING = "What he knows about, at a glance";
export const SELF_BRIEF_UNSERVED = "This gateway does not serve his brief yet.";
export const SELF_BRIEF_NONE = "His brief forms at his next sleep.";

/** The route's answer. */
export interface SelfBrief {
  text: string;
  /** When the sleep wrote it (ISO, UTC). */
  written_at: string;
  /** The communities version it describes; null when memory had none. */
  version: number | null;
  /** Its length by the runtime's budget estimator. */
  tokens: number;
}

/** Not served (no such route), served with no brief yet (`no_brief`), or his brief. */
export type SelfBriefRead = { served: false } | { served: true; brief: SelfBrief | null };

/** A 200 answer, checked: a field missing or of the wrong type is an error naming it (nothing is
 * filled in). */
export function selfBriefOf(raw: unknown): SelfBrief {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("the brief answer is not an object");
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== "string" || !r.text.trim()) throw new Error("the brief answer has no text");
  if (typeof r.written_at !== "string" || Number.isNaN(Date.parse(r.written_at))) throw new Error("the brief answer's written_at is not a time");
  if (r.version !== null && !Number.isInteger(r.version)) throw new Error("the brief answer's version is not a whole number or null");
  if (!Number.isInteger(r.tokens)) throw new Error("the brief answer's tokens is not a whole number");
  return { text: r.text.trim(), written_at: r.written_at, version: r.version as number | null, tokens: r.tokens as number };
}

/** A refusal's served words: the detail itself, or its `message`. */
function servedMessage(detail: unknown): string {
  if (typeof detail === "string") return detail.trim();
  if (detail && typeof detail === "object" && typeof (detail as { message?: unknown }).message === "string") return String((detail as { message: string }).message).trim();
  return "";
}

export function selfBriefUrl(baseUrl: string, entity: string): string {
  return joinBaseUrl(baseUrl, `api/gateway/entities/${encodeURIComponent(entity)}/self-brief`);
}

/** One read of the route. 404 `no_brief` = none yet; FastAPI's own 404 = the route is not served;
 * any other refusal rejects with its served message (else its status). */
export async function readSelfBrief(baseUrl: string, entity: string, fetchImpl: typeof fetch = fetch): Promise<SelfBriefRead> {
  const res = await fetchImpl(selfBriefUrl(baseUrl, entity), { credentials: "include", headers: gatewayReadHeaders({ Accept: "application/json" }) });
  if (res.ok) return { served: true, brief: selfBriefOf(await res.json()) };
  const detail = ((await res.json().catch(() => null)) as { detail?: unknown } | null)?.detail;
  if (res.status === 404 && (detail as { code?: unknown } | undefined)?.code === "no_brief") return { served: true, brief: null };
  if (res.status === 404 && detail === "Not Found") return { served: false };
  throw new Error(servedMessage(detail) || `HTTP ${res.status}`);
}

/** How long ago, in words: "just now", "12 min ago", "3 h ago", "2 days ago", then the date. */
export function agoWords(iso: string, now: number, timeZone?: string): string {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now"; // a clock a little ahead too
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
  return `on ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })}`;
}

/** The line above his words: "written 2 h ago · version 107166" (no version: "written 2 h ago"). */
export function writtenLine(brief: SelfBrief, now: number, timeZone?: string): string {
  const when = `written ${agoWords(brief.written_at, now, timeZone)}`;
  return brief.version === null ? when : `${when} · version ${brief.version}`;
}

/** The exact time, for the line's tooltip, in the viewer's time. */
export function writtenAt(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
}

export type SelfBriefState =
  | { phase: "loading" }
  | { phase: "unserved" }
  | { phase: "none" }
  | { phase: "ready"; brief: SelfBrief }
  | { phase: "error"; message: string };

export function selfBriefState(read: SelfBriefRead): SelfBriefState {
  if (!read.served) return { phase: "unserved" };
  return read.brief ? { phase: "ready", brief: read.brief } : { phase: "none" };
}

/** The card's section for one state (`now` and `timeZone` for the written line). */
export function SelfBriefView({ state, now = Date.now(), timeZone }: { state: SelfBriefState; now?: number; timeZone?: string }): React.ReactElement {
  const note = (text: string) => (
    <div className="ic_window_note wl_p">
      <WordsLine text={text} />
    </div>
  );
  return (
    <div className="ic_section ic_brief" data-testid="self-brief" data-phase={state.phase}>
      <h4>{SELF_BRIEF_HEADING}</h4>
      {state.phase === "loading" ? note("reading his brief…") : null}
      {state.phase === "unserved" ? note(SELF_BRIEF_UNSERVED) : null}
      {state.phase === "none" ? note(SELF_BRIEF_NONE) : null}
      {state.phase === "error" ? note(`Could not read his brief: ${state.message.replace(/[.\s]+$/, "")}.`) : null}
      {state.phase === "ready" ? (
        <>
          <p className="ic_brief_when" title={writtenAt(state.brief.written_at, timeZone)}>
            {writtenLine(state.brief, now, timeZone)}
          </p>
          <div className="ic_brief_text">
            <WordsLine text={state.brief.text} />
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Read when on screen and not yet read for this entity at this revision of his life (the card's
 * own rule); a failed refresh keeps the brief already shown. */
export function SelfBriefSection({ baseUrl, entity, revision = null, shown = true }: { baseUrl: string; entity: string; revision?: number | null; shown?: boolean }): React.ReactElement {
  const [state, setState] = useState<SelfBriefState>({ phase: "loading" });
  const readRef = useRef<{ key: string; revision: number | null } | null>(null);

  useEffect(() => {
    readRef.current = null;
    setState({ phase: "loading" });
  }, [baseUrl, entity]);

  useEffect(() => {
    const key = `${baseUrl}|${entity}`;
    if (!shown) return;
    if (readRef.current && readRef.current.key === key && readRef.current.revision === revision) return;
    let cancelled = false;
    readSelfBrief(baseUrl, entity)
      .then((read) => {
        if (cancelled) return;
        readRef.current = { key, revision };
        setState(selfBriefState(read));
      })
      .catch((e) => !cancelled && setState((prev) => (prev.phase === "ready" ? prev : { phase: "error", message: String((e as Error).message || e) })));
    return () => {
      cancelled = true;
    };
  }, [baseUrl, entity, revision, shown]);

  return <SelfBriefView state={state} />;
}
