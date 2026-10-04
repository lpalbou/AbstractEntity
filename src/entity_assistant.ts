/**
 * The entity app's Docs assistant (round 8, R8.3): the kit's shared
 * `DocsAssistantDrawer` (panel-chat) — the same chat the console and every
 * app mount — grounded on THIS app's llms.txt (the gateway reads it from
 * this app's own build: `GET api/gateway/docs/corpus?app=entity`) through
 * the gateway's docs-qa workflow. Conversation, attachments, streaming and
 * history (one gateway session per conversation) are the kit's; this module
 * only supplies the source and the app's authenticated gateway fetch.
 *
 * The former transport (the corpus folded into a `runs/{session}/chat`
 * call) is gone: that endpoint needed a pre-existing session run and never
 * went through docs-qa.
 */

import type { DocsAssistantSource, GatewayFetch } from "@abstractframework/panel-chat";
import { joinBaseUrl } from "@abstractframework/ui-kit";
import { gatewayReadHeaders, proxyCsrfHeaders } from "./stream_source";

export const ENTITY_DOCS_SOURCE: DocsAssistantSource = { app: "entity", name: "AbstractEntity" };

export const ENTITY_DOCS_SUGGESTIONS = ["What is an entity?", "How do I summon an entity?", "What does the Cognitive Monitor show?"];

/**
 * A GatewayFetch bound to the app's gateway base and credential, read at call
 * time (`getBase() === null` = no gateway: demo/exported source; "" is the
 * valid same-origin proxy base). Reads carry the bearer token when one is
 * held; writes add the proxy / direct-gateway CSRF header, exactly like the
 * app's other gateway calls.
 */
export function makeEntityDocsFetch(getBase: () => string | null, getToken: () => string | null): GatewayFetch {
  return (path, init = {}) => {
    const base = getBase();
    if (base === null) return Promise.reject(new Error("Connect to a gateway to use the docs assistant."));
    const headers = new Headers(init.headers || {});
    const token = getToken();
    for (const [name, value] of Object.entries(gatewayReadHeaders(token ? { Authorization: `Bearer ${token}` } : {}))) headers.set(name, value);
    const method = String(init.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") for (const [name, value] of Object.entries(proxyCsrfHeaders())) headers.set(name, value);
    return fetch(joinBaseUrl(base.trim().replace(/\/+$/, ""), path), { ...init, headers, credentials: "include" });
  };
}
