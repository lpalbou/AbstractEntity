/**
 * ADR-0026 (operator ruling 2026-09-28): the docs assistant sends the WHOLE
 * gateway docs corpus in its user turn — the 40,000-char cap is gone.
 * Node-env test: fetch is stubbed; the corpus and chat calls are captured.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeEntityAssistant } from "./entity_assistant";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubGateway(corpus: string): Array<{ url: string; body: any }> {
  const chats: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("api/gateway/docs/corpus")) {
      return new Response(JSON.stringify({ text: corpus }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    chats.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
    return new Response(JSON.stringify({ answer: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return chats;
}

describe("entity docs assistant (whole corpus, ADR-0026)", () => {
  it("sends a corpus far past the old 40,000-char cap whole, with no truncation marker", async () => {
    const corpus = "# Docs\n" + "AbstractEntity documentation line.\n".repeat(4000) + "THE-LAST-LINE";
    expect(corpus.length).toBeGreaterThan(130_000);
    const chats = stubGateway(corpus);
    const ask = makeEntityAssistant("http://gw.test:18999", null);
    const answer = await ask("what is a phase?", { signal: new AbortController().signal, history: [] });
    expect(answer).toBe("ok");
    expect(chats).toHaveLength(1);
    const user = chats[0].body.messages.at(-1);
    expect(user.role).toBe("user");
    expect(user.content).toContain(`<docs>\n${corpus}\n</docs>`);
    expect(user.content).toContain("THE-LAST-LINE");
    expect(user.content).not.toContain("#TRUNCATION");
    expect(user.content.endsWith("Question: what is a phase?")).toBe(true);
  });
});
