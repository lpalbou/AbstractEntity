/**
 * Round 8 (R8.3): the entity app's Docs assistant is the kit's shared
 * DocsAssistantDrawer grounded on THIS app's llms.txt (served from this app's
 * build, read by the gateway at docs/corpus?app=entity) through docs-qa.
 * Node-env test: fetch is stubbed with a fake docs-qa gateway.
 */
import React from "react";
import http from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocsAssistantDrawer, DocsAssistantPanel, makeDocsQaAsk } from "@abstractframework/panel-chat";

import { ENTITY_DOCS_SOURCE, ENTITY_DOCS_SUGGESTIONS, makeEntityDocsFetch } from "./entity_assistant";
// @ts-expect-error bin/server.js is plain ESM JavaScript without types
import { createEntityServer } from "../bin/server.js";

const viewSource = readFileSync(resolve(__dirname, "entity_view.tsx"), "utf8");
const enc = new TextEncoder();

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { document?: unknown }).document;
});

function fakeGateway() {
  const calls: { url: string; method: string; auth: string | null; csrf: string | null; credentials?: string; body?: unknown }[] = [];
  let polls = 0;
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const sse = (frames: string[]) =>
    new Response(new ReadableStream({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close(); } }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
  const delta = (seq: number, text: string) =>
    `event: llm.delta\ndata: ${JSON.stringify({ kind: "llm.delta", run_id: "docs-run", call_id: "c1", seq, text, channel: "content", snapshot: false })}\n\n`;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers || {});
    calls.push({ url, method: String(init.method || "GET"), auth: headers.get("Authorization"), csrf: headers.get("X-Abstract-CSRF"), credentials: init.credentials, body: init.body });
    if (url === "http://gw.test/api/gateway/docs/corpus?app=entity") return json({ app: "AbstractEntity", text: "# AbstractEntity\n\n## Summon\nUse Summon on the Entities page." });
    if (url === "http://gw.test/api/gateway/runs/start") return json({ run_id: "docs-run" });
    if (url === "http://gw.test/api/gateway/runs/docs-run/ledger/stream?after=0") return sse([delta(0, "Use "), delta(1, "**Summon**.")]);
    if (url === "http://gw.test/api/gateway/runs/docs-run") return json({ status: polls++ ? "completed" : "running", output: { response: "Use **Summon**." } });
    return new Response(JSON.stringify({ detail: `unexpected ${url}` }), { status: 404 });
  });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { cookie: "abstractentity_gateway_csrf=csrf%2D1" } });
  return calls;
}

describe("entity Docs assistant (kit DocsAssistantDrawer)", () => {
  it("asks docs-qa with the entity app's own llms.txt, streams, bearer on every call, CSRF on writes", async () => {
    const calls = fakeGateway();
    const fetchGateway = makeEntityDocsFetch(() => "http://gw.test/", () => "tok-e");
    const ask = makeDocsQaAsk({ fetchGateway, source: ENTITY_DOCS_SOURCE, pollMs: 1 });
    const live: string[] = [];
    const answer = await ask("How do I summon an entity?", { signal: new AbortController().signal, sessionId: "entity-docs-assistant:s1", onText: (t) => live.push(t) });
    expect(answer).toBe("Use **Summon**.");
    expect(live[live.length - 1]).toBe("Use **Summon**.");
    const start = calls.find((c) => c.url.endsWith("/runs/start"))!;
    const body = JSON.parse(String(start.body));
    expect(body).toMatchObject({ bundle_id: "docs-qa", flow_id: "docsqa001", session_id: "entity-docs-assistant:s1" });
    expect(body.input_data).toMatchObject({ prompt: "How do I summon an entity?", app: "AbstractEntity", use_session_history: true });
    expect(body.input_data.docs).toContain("Use Summon on the Entities page.");
    expect(calls.every((c) => c.auth === "Bearer tok-e" && c.credentials === "include")).toBe(true);
    expect(start.csrf).toBe("csrf-1");
    expect(calls.find((c) => c.url.includes("docs/corpus"))!.csrf).toBeNull();
    // No legacy chat transport.
    expect(calls.some((c) => c.url.includes("/chat"))).toBe(false);

    const html = renderToStaticMarkup(
      React.createElement(DocsAssistantPanel, {
        source: ENTITY_DOCS_SOURCE, draft: "", onDraftChange: () => {}, onSend: () => {},
        messages: [{ role: "user", content: "How?" }, { role: "assistant", title: "AbstractEntity", content: answer }],
      })
    );
    expect(html).toContain("pc-chat-item--user");
    expect(html).toContain("pc-chat-item--assistant");
    expect(html).toContain("<strong>Summon</strong>");
    expect(html).toContain("Grounded on AbstractEntity’s documentation (llms.txt) · docs-qa");
  });

  it("no gateway (demo/exported source) refuses honestly instead of fetching", async () => {
    const calls = fakeGateway();
    await expect(makeEntityDocsFetch(() => null, () => null)("api/gateway/docs/corpus?app=entity")).rejects.toThrow("Connect to a gateway");
    expect(calls).toHaveLength(0);
  });

  it("the drawer: compact header, icon-only New conversation, close, suggestions", () => {
    const html = renderToStaticMarkup(
      React.createElement(DocsAssistantDrawer, { open: true, onClose: () => {}, source: ENTITY_DOCS_SOURCE, fetchGateway: makeEntityDocsFetch(() => "", () => null), connected: true, suggestions: ENTITY_DOCS_SUGGESTIONS })
    );
    expect(html).toContain("Docs assistant");
    expect(html).toMatch(/aria-label="New conversation"[^>]*><svg/);
    expect(html).not.toMatch(/>New conversation</);
    expect(html).toContain('aria-label="Close panel"');
  });

  it("entity_view mounts the kit drawer from the shared docs slot", () => {
    expect(viewSource).toContain("<DocsAssistantDrawer");
    expect(viewSource).toContain("source={ENTITY_DOCS_SOURCE}");
    expect(viewSource).toContain('docs={{ open: assistantOpen,');
    expect(viewSource).not.toContain("assistant={{ open: assistantOpen");
    expect(viewSource).not.toContain("<AssistantPanel");
  });

  it("the app serves its llms.txt as text/plain (what the gateway reads)", async () => {
    const dist = mkdtempSync(join(tmpdir(), "entity-dist-"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>AbstractEntity</title>");
    writeFileSync(join(dist, "llms.txt"), "# AbstractEntity\n");
    const server = createEntityServer({ distDir: dist, gatewayUrl: "http://127.0.0.1:9" });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    try {
      const port = (server.address() as { port: number }).port;
      const res = await new Promise<{ status: number; type: string; body: string }>((ok, fail) => {
        http
          .get(`http://127.0.0.1:${port}/llms.txt`, (r) => {
            let body = "";
            r.on("data", (d) => (body += d));
            r.on("end", () => ok({ status: r.statusCode || 0, type: String(r.headers["content-type"] || ""), body }));
          })
          .on("error", fail);
      });
      expect(res.status).toBe(200);
      expect(res.type).toMatch(/^text\/plain/);
      expect(res.body).toBe("# AbstractEntity\n");
    } finally {
      server.close();
    }
  });
});
