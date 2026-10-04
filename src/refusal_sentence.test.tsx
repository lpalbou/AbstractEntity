// Refusals read as sentences (round 7, parent ask): a `{"detail": …}` body
// gives its detail, and a gateway without embeddings (503 on /embeddings)
// gives one sentence plus the console page that fixes it.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmbeddingsUnconfiguredNote } from "./cognition_wave_inline";
import {
  EMBEDDINGS_UNCONFIGURED,
  embedTexts,
  embeddingsSetupUrl,
  fetchRecordVerbatim,
  isEmbeddingsUnconfigured,
  refusalDetail,
} from "./stream_source";

const RAW = JSON.stringify({ detail: "Embeddings are not available for this gateway instance. Configure the execution-host embedding.text capability default…" });

function stubFetch(status: number, body: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "Content-Type": "application/json" } })));
}

afterEach(() => vi.unstubAllGlobals());

describe("refusals as sentences", () => {
  it("a 503 on /embeddings is the plain sentence, flagged unconfigured", async () => {
    stubFetch(503, RAW);
    const err = await embedTexts("http://gw.test", ["hello"]).catch((e) => e);
    expect(isEmbeddingsUnconfigured(err)).toBe(true);
    expect(err.message).toBe(EMBEDDINGS_UNCONFIGURED);
    expect(err.message).not.toContain("{");
  });

  it("other refusals give the detail, never the JSON body", async () => {
    stubFetch(500, JSON.stringify({ detail: "Embedding provider timed out." }));
    const err = await embedTexts("http://gw.test", ["hello"]).catch((e) => e);
    expect(isEmbeddingsUnconfigured(err)).toBe(false);
    expect(err.message).toBe("Embedding provider timed out.");
    stubFetch(404, JSON.stringify({ detail: "Entity 'castor' not found" }));
    const e2 = await fetchRecordVerbatim("http://gw.test", "castor", "g1").catch((e) => e);
    expect(e2.message).toBe("Entity 'castor' not found");
    expect(refusalDetail("plain words")).toBe("plain words");
  });

  it("the monitor note is the sentence with a link to the console's embedding setup", () => {
    const html = renderToStaticMarkup(<EmbeddingsUnconfiguredNote baseUrl="http://gw.test:8080" message={EMBEDDINGS_UNCONFIGURED} />);
    expect(html).toContain(EMBEDDINGS_UNCONFIGURED);
    expect(html).toContain(`href="${embeddingsSetupUrl("http://gw.test:8080")}"`);
    expect(embeddingsSetupUrl("http://gw.test:8080")).toBe("http://gw.test:8080/console#defaults");
    expect(html).not.toContain("{&quot;detail");
  });
});
