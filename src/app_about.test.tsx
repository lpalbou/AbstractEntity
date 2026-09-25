/**
 * The About dialog: build-time version, descriptor identity, the top-bar
 * About action, the dialog rows, and the gateway versions read on open.
 * No DOM in this package's tests (see roster_empty.test.tsx), so the kit
 * components render with react-dom/server.
 */

import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AfAboutDialog, AfTopBarActions } from "@abstractframework/ui-kit";

import {
  APP_VERSION,
  ENTITY_IDENTITY,
  gatewayAboutRows,
  loadGatewayAboutRows,
  resolveAppVersion,
} from "./app_about";
import { ENTITY_DOCS_URL } from "./entities_index";

const ROOT = resolve(__dirname, "..");
const PKG = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string };

function jsonResponse(body: unknown, status = 200, contentType = "application/json"): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

describe("app version", () => {
  it("is package.json's version, baked in by the vite define", () => {
    expect(APP_VERSION).toBe(PKG.version);
    expect(ENTITY_IDENTITY.version).toBe(PKG.version);
  });

  it("only the test runner may fall back; a build without the define fails loudly", () => {
    expect(resolveAppVersion("1.2.3", "production")).toBe("1.2.3");
    expect(resolveAppVersion(undefined, "test")).toBe("0.0.0-test");
    expect(() => resolveAppVersion(undefined, "production")).toThrow(/__APP_VERSION__/);
    expect(() => resolveAppVersion("  ", "development")).toThrow(/__APP_VERSION__/);
  });
});

describe("identity", () => {
  it("comes from the AbstractFramework descriptor", () => {
    expect(ENTITY_IDENTITY.id).toBe("abstractentity");
    expect(ENTITY_IDENTITY.name).toBe("AbstractEntity");
    expect(ENTITY_IDENTITY.repo).toBe("https://github.com/lpalbou/AbstractEntity");
    expect(ENTITY_IDENTITY.docs).toBe("https://github.com/lpalbou/AbstractEntity/tree/main/docs");
    expect(ENTITY_IDENTITY.issues).toBe("https://github.com/lpalbou/AbstractEntity/issues");
  });

  it("the empty-state docs link sits on the same repository", () => {
    expect(ENTITY_DOCS_URL).toBe(`${ENTITY_IDENTITY.repo}#what-is-an-entity`);
  });

  it("package.json homepage and bugs match the descriptor", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      homepage?: string;
      bugs?: { url?: string };
    };
    expect(pkg.homepage).toBe(ENTITY_IDENTITY.website);
    expect(pkg.bugs?.url).toBe(ENTITY_IDENTITY.issues);
  });
});

describe("top-bar About action", () => {
  it("renders an About button when the about prop is given", () => {
    const html = renderToStaticMarkup(
      <AfTopBarActions
        about={{ identity: ENTITY_IDENTITY, extraRows: [], onOpen: () => undefined }}
        connection={{ phase: "disconnected", onConnect: () => undefined, onDisconnect: () => undefined }}
      />,
    );
    expect(html).toContain("af-topbar__btn--about");
    expect(html).toContain('aria-label="About AbstractEntity"');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it("every AfTopBarActions in the app passes the about prop", () => {
    const srcDir = resolve(ROOT, "src");
    let seen = 0;
    for (const name of readdirSync(srcDir)) {
      if (!name.endsWith(".tsx") || name.includes(".test.")) continue;
      const text = readFileSync(resolve(srcDir, name), "utf8");
      const re = /<AfTopBarActions\b([\s\S]*?)\/>/g;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        seen += 1;
        expect(m[1], `${name}: AfTopBarActions without about=`).toMatch(/\babout=\{/);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("About dialog rows", () => {
  const extraRows = gatewayAboutRows({
    abstractgateway: "0.4.3",
    abstractframework: "0.3.3",
    packages: { abstractgateway: "0.4.3", abstractcore: "2.15.2", abstractruntime: "0.4.33" },
  });
  const html = renderToStaticMarkup(
    <AfAboutDialog open onClose={() => undefined} identity={ENTITY_IDENTITY} extraRows={extraRows} />,
  );

  it("names the app and its version", () => {
    expect(html).toContain("About AbstractEntity");
    expect(html).toContain(`AbstractEntity ${PKG.version}`);
  });

  it("states the framework website and the author", () => {
    expect(html).toContain("AbstractFramework — https://abstractframework.ai");
    expect(html).toContain("Laurent-Philippe Albou, PhD (2023-2026)");
  });

  it("links website, source, documentation, issues and feedback in a new tab", () => {
    const links = [...html.matchAll(/<a class="af-about__link" href="([^"]+)" target="_blank" rel="noopener noreferrer">/g)].map(
      (m) => m[1],
    );
    expect(links).toEqual([
      ENTITY_IDENTITY.website,
      ENTITY_IDENTITY.repo,
      ENTITY_IDENTITY.docs,
      ENTITY_IDENTITY.issues,
      ENTITY_IDENTITY.feedback,
    ]);
  });

  it("appends the gateway versions after the standard rows", () => {
    expect(extraRows).toEqual([
      ["Gateway", "0.4.3"],
      ["Gateway framework", "0.3.3"],
      ["abstractcore", "2.15.2"],
      ["abstractruntime", "0.4.33"],
    ]);
    expect(html.indexOf("Give feedback")).toBeLessThan(html.indexOf("Gateway framework"));
    expect(html).toContain("abstractruntime");
  });
});

describe("gateway versions (read on open)", () => {
  it("reads /api/gateway/about through the app's request path", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ abstractframework: null, abstractgateway: "0.4.3", packages: { abstractcore: "2.15.2" } });
    }) as unknown as typeof fetch;
    const rows = await loadGatewayAboutRows("http://127.0.0.1:8080/", fakeFetch);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:8080/api/gateway/about");
    expect(calls[0].init?.credentials).toBe("include");
    expect(rows).toEqual([
      ["Gateway", "0.4.3"],
      ["Gateway framework", "not installed"],
      ["abstractcore", "2.15.2"],
    ]);
  });

  it("uses the page origin in the proxy posture", async () => {
    let seen = "";
    const fakeFetch = (async (url: string) => {
      seen = url;
      return jsonResponse({ abstractframework: "0.3.3", abstractgateway: "0.4.3", packages: {} });
    }) as unknown as typeof fetch;
    await loadGatewayAboutRows("", fakeFetch);
    expect(seen).toBe("/api/gateway/about");
  });

  it("shows one row with the HTTP status when the gateway refuses", async () => {
    const fakeFetch = (async () => jsonResponse({ detail: "nope" }, 404)) as unknown as typeof fetch;
    expect(await loadGatewayAboutRows("", fakeFetch)).toEqual([["Gateway", "unavailable (HTTP 404)"]]);
  });

  it("shows one row with the error when the gateway is unreachable", async () => {
    const fakeFetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await loadGatewayAboutRows("", fakeFetch)).toEqual([["Gateway", "unavailable (Failed to fetch)"]]);
  });

  it("does not mistake the app's own HTML page for a gateway", async () => {
    const fakeFetch = (async () => jsonResponse("<!doctype html>", 200, "text/html")) as unknown as typeof fetch;
    expect(await loadGatewayAboutRows("", fakeFetch)).toEqual([["Gateway", "unavailable (not a gateway response)"]]);
  });

  it("rejects a body that is not the About shape", async () => {
    const fakeFetch = (async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
    expect(await loadGatewayAboutRows("", fakeFetch)).toEqual([["Gateway", "unavailable (unexpected response shape)"]]);
  });
});
