/**
 * The entity app's assistant transport — injected into the shared
 * `AssistantPanel` (uic unified top-bar cluster; the same assistant icon
 * flow/continuum/observer carry, operator directive 2026-07-15 (i)).
 *
 * It is a DOCS-GROUNDED helper: it answers questions about AbstractEntity
 * and the framework from the gateway's own documentation corpus
 * (`api/gateway/docs/corpus`). Generation rides the read-only
 * `api/gateway/runs/{id}/chat` endpoint.
 *
 * Honesty rules (all three were adversary P0s, fixed here):
 * - Same-origin proxy base is `""` (a VALID base), so the "no gateway"
 *   guard tests `baseUrl === null`, never `!baseUrl`.
 * - The corpus is folded into the USER message, not a system message —
 *   the run-chat generator drops non-user/assistant roles.
 * - If the gateway does not serve a usable chat run (the endpoint 404s
 *   until a session run exists — a gateway gap filed on the hub), the
 *   panel gets an HONEST "docs assistant isn't wired on this gateway yet"
 *   message, never a fabricated answer or a raw stack.
 * The corpus cache is keyed by base and only latches on SUCCESS (a
 * pre-sign-in 401 must not poison the session).
 */

import { gatewayReadHeaders, proxyCsrfToken, refusalDetail } from "./stream_source";
import { joinBaseUrl } from "@abstractframework/ui-kit";

const SESSION_ID = "session_memory_entity_docsqa";

const corpusByBase = new Map<string, string>();

async function loadCorpus(baseUrl: string): Promise<string | null> {
  if (corpusByBase.has(baseUrl)) return corpusByBase.get(baseUrl) ?? null;
  try {
    const res = await fetch(joinBaseUrl(baseUrl, `api/gateway/docs/corpus`), {
      credentials: "include",
      headers: gatewayReadHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) return null; // do NOT cache a failure — a later signed-in ask retries
    const data = (await res.json()) as { text?: string };
    const text = typeof data.text === "string" ? data.text : "";
    if (text) corpusByBase.set(baseUrl, text);
    return text || null;
  } catch {
    return null;
  }
}

export interface AssistantContext {
  signal: AbortSignal;
  history: Array<{ role: string; content: string }>;
}

/** Build an `ask(question, ctx)` bound to a gateway base + bearer token.
 * baseUrl === null means no gateway (demo/exported); "" is the valid
 * same-origin proxy base. */
export function makeEntityAssistant(baseUrl: string | null, token: string | null): (q: string, ctx: AssistantContext) => Promise<string> {
  return async (question: string, ctx: AssistantContext): Promise<string> => {
    if (baseUrl === null) {
      return "I answer questions about AbstractEntity and the framework from the gateway's docs — connect to a gateway (top-right) and ask again.";
    }
    const base = baseUrl.trim().replace(/\/+$/, ""); // "" stays "" (same-origin proxy)
    const corpus = await loadCorpus(base);
    // Fold the docs into the USER turn (the run-chat generator keeps only
    // user/assistant roles). The WHOLE corpus: models get their full context
    // (ADR-0026, operator ruling 2026-09-28); a corpus the model cannot hold
    // fails loudly at the provider instead of being cut here.
    const grounding = corpus
      ? `Answer using ONLY the AbstractEntity/framework documentation below; if it does not cover the question, say so plainly.\n\n<docs>\n${corpus}\n</docs>\n\nQuestion: ${question}`
      : question;
    // Skip our own prior error cards so a past failure never becomes
    // misleading model context (every literal this transport can return).
    // ASSISTANT-role only: a USER asking "why could not reach the gateway?"
    // is a legitimate question, not one of our cards (round-2 review).
    const OWN_ERROR_CARDS = /^#FALLBACK|assistant (?:request|call) failed|isn't wired|could not reach the gateway|returned an empty reply|connect to a gateway/i;
    const messages = [
      ...ctx.history
        .filter((m) => m.role !== "system" && !(m.role === "assistant" && OWN_ERROR_CARDS.test(m.content)))
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: grounding },
    ];
    const csrf = proxyCsrfToken();
    let res: Response;
    try {
      res = await fetch(joinBaseUrl(base, `api/gateway/runs/${encodeURIComponent(SESSION_ID)}/chat`), {
        method: "POST",
        credentials: "include",
        signal: ctx.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(csrf ? { "X-Abstract-CSRF": csrf } : {}),
        },
        body: JSON.stringify({ messages, include_subruns: false }),
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      return "The docs assistant could not reach the gateway. Check the connection (top-right) and try again.";
    }
    if (res.status === 404) {
      // The gateway does not (yet) auto-create the docs-qa chat run —
      // honest degrade, not a fabricated answer (gateway gap filed).
      return "The docs assistant isn't wired on this gateway yet (its chat endpoint needs a docs-qa session run). Nothing to answer from — I won't guess.";
    }
    if (!res.ok) {
      const detail = refusalDetail(await res.text().catch(() => ""));
      return `The docs assistant call failed (HTTP ${res.status}). ${detail.slice(0, 200)}`.trim();
    }
    const data = (await res.json()) as { answer?: string };
    return String(data.answer || "").trim() || "(the assistant returned an empty reply)";
  };
}

/** Convenience wrapper matching the AssistantPanel `ask` signature. */
export function askEntityAssistant(baseUrl: string | null, token: string | null, question: string, ctx: AssistantContext): Promise<string> {
  return makeEntityAssistant(baseUrl, token)(question, ctx);
}
