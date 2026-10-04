/**
 * The About dialog (kit 0.7.0 compact card): build-time version, descriptor
 * identity, the top-bar About action, the card content (name + version,
 * framework + gateway versions, six links, licence line, NO package list),
 * and the gateway versions read on open.
 * No DOM in this package's tests (see roster_empty.test.tsx), so the kit
 * components render with react-dom/server.
 */

import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AfAboutDialog, AfTopBarActions, aboutVersionsFromGateway, frameworkIdentity } from "@abstractframework/ui-kit";

import { ABOUT_NOT_CONNECTED, APP_VERSION, ENTITY_IDENTITY, loadGatewayAboutVersions, resolveAppVersion } from "./app_about";
import { ENTITY_DOCS_URL } from "./entities_index";

const ROOT = resolve(__dirname, "..");
const PKG = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string };

// Wrap the kit's reducer (behaviour unchanged) so the tests can prove the
// versions come from it and not from a local copy.
vi.mock("@abstractframework/ui-kit", async (importOriginal) => {
  const kit = await importOriginal<typeof import("@abstractframework/ui-kit")>();
  return { ...kit, aboutVersionsFromGateway: vi.fn(kit.aboutVersionsFromGateway) };
});

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
        about={{ identity: ENTITY_IDENTITY, versions: ABOUT_NOT_CONNECTED, onOpen: () => undefined }}
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

describe("About card content", () => {
  let html = "";
  beforeAll(async () => {
    const fakeFetch = (async () =>
      jsonResponse({
        abstractgateway: "0.4.3",
        abstractframework: "0.3.3",
        packages: { abstractgateway: "0.4.3", abstractcore: "2.15.2", abstractruntime: "0.4.33" },
      })) as unknown as typeof fetch;
    const versions = await loadGatewayAboutVersions("", fakeFetch);
    html = renderToStaticMarkup(<AfAboutDialog open onClose={() => undefined} identity={ENTITY_IDENTITY} versions={versions} />);
  });

  it("names the app and its version", () => {
    expect(html).toContain(`AbstractEntity <span class="af-about-card__version">${PKG.version}</span>`);
  });

  it("states the framework and gateway versions", () => {
    expect(html).toContain("<dt>AbstractFramework</dt><dd>0.3.3</dd>");
    expect(html).toContain("<dt>AbstractGateway</dt><dd>0.4.3</dd>");
  });

  it("links website, source, docs, issues and feedback in a new tab, then contact by mail", () => {
    const links = [...html.matchAll(/data-link="([a-z]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]);
    expect(links).toEqual([
      ["website", ENTITY_IDENTITY.website],
      ["source", ENTITY_IDENTITY.repo],
      ["docs", ENTITY_IDENTITY.docs],
      ["issues", ENTITY_IDENTITY.issues],
      ["feedback", ENTITY_IDENTITY.feedback],
      ["contact", `mailto:${frameworkIdentity().contact_email}`],
    ]);
    expect((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length).toBe(5);
  });

  it("carries the author/licence line", () => {
    expect(html).toContain(frameworkIdentity().copyright.replace(/&/g, "&amp;"));
  });

  it("never lists packages", () => {
    for (const s of ["abstractcore", "abstractruntime", "2.15.2", "0.4.33", "Gateway package"]) expect(html).not.toContain(s);
  });
});

describe("gateway versions (read on open)", () => {
  it("reads /api/gateway/about through the app's request path", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ abstractframework: null, abstractgateway: "0.4.3", packages: { abstractcore: "2.15.2" } });
    }) as unknown as typeof fetch;
    vi.mocked(aboutVersionsFromGateway).mockClear();
    const v = await loadGatewayAboutVersions("http://127.0.0.1:8080/", fakeFetch);
    expect(vi.mocked(aboutVersionsFromGateway)).toHaveBeenCalledWith({
      abstractframework: null,
      abstractgateway: "0.4.3",
      packages: { abstractcore: "2.15.2" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:8080/api/gateway/about");
    expect(calls[0].init?.credentials).toBe("include");
    expect(v).toEqual({ framework: null, gateway: "0.4.3", frameworkNote: "not installed on the gateway host" });
  });

  it("uses the app base (a RELATIVE path) in the proxy posture", async () => {
    let seen = "";
    const fakeFetch = (async (url: string) => {
      seen = url;
      return jsonResponse({ abstractframework: "0.3.3", abstractgateway: "0.4.3", packages: {} });
    }) as unknown as typeof fetch;
    await loadGatewayAboutVersions("", fakeFetch);
    expect(seen).toBe("api/gateway/about");
  });

  it("says the HTTP status when the gateway refuses", async () => {
    const fakeFetch = (async () => jsonResponse({ detail: "nope" }, 404)) as unknown as typeof fetch;
    vi.mocked(aboutVersionsFromGateway).mockClear();
    expect((await loadGatewayAboutVersions("", fakeFetch)).gatewayNote).toBe("unavailable (HTTP 404)");
    expect(vi.mocked(aboutVersionsFromGateway)).toHaveBeenCalledWith(null, "HTTP 404");
  });

  it("says the error when the gateway is unreachable", async () => {
    const fakeFetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect((await loadGatewayAboutVersions("", fakeFetch)).gatewayNote).toBe("unavailable (Failed to fetch)");
  });

  it("does not mistake the app's own HTML page for a gateway", async () => {
    const fakeFetch = (async () => jsonResponse("<!doctype html>", 200, "text/html")) as unknown as typeof fetch;
    expect((await loadGatewayAboutVersions("", fakeFetch)).gatewayNote).toBe("unavailable (not a gateway response)");
  });

  it("reports a body without the gateway version as unavailable", async () => {
    const fakeFetch = (async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
    expect((await loadGatewayAboutVersions("", fakeFetch)).gatewayNote).toBe("unavailable (the gateway did not report its version)");
  });

  it("a page without a gateway says not connected", () => {
    const html = renderToStaticMarkup(<AfAboutDialog open onClose={() => undefined} identity={ENTITY_IDENTITY} versions={ABOUT_NOT_CONNECTED} />);
    expect(html).toContain("<dt>AbstractGateway</dt><dd>not connected</dd>");
  });
});
