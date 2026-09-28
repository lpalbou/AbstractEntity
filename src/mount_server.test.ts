// AbstractEntity under the gateway's /apps/entity/ (the
// @abstractframework/app-server mount contract), with the real server
// (bin/server.js) on an ephemeral loopback port and the gateway simulated by
// the X-Forwarded-* headers it sends.
//
// Proves: the identity header on every response; the page's <base href> and
// base_path; a malformed forwarded header refused; the legacy /entity.html
// redirect is RELATIVE (lands under the base); sign-out clears the session
// cookies at the base path; the kit launch flags (--gateway-url and its
// aliases, legacy environment below them, the local gateway pointer).
// Standalone at `/` keeps working.
import { spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// @ts-expect-error plain-JS module without types
import { createEntityServer } from "../bin/server.js";

const PAGE = '<!DOCTYPE html><html><head><title>t</title><script type="module" src="./assets/app.js"></script></head><body></body></html>';
const PREFIX = "/apps/entity";
const REMOTE = "203.0.113.50";
// A dead port: no test here may reach a real gateway.
const DEAD_GATEWAY = "http://127.0.0.1:9";
const CLI = resolve(__dirname, "..", "bin", "cli.js");

let scratch = "";
let base = "";
let server: any;

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), "entity-mount-"));
  const dist = join(scratch, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), PAGE);
  writeFileSync(join(dist, "assets", "app.js"), "console.log('app');");
  server = createEntityServer({ distDir: dist, gatewayUrl: DEAD_GATEWAY });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((ok) => server.close(ok));
  rmSync(scratch, { recursive: true, force: true });
});

/** A loopback port nobody listens on right now. */
async function freePort(): Promise<number> {
  const { createServer } = await import("net");
  const srv = createServer();
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", () => ok()));
  const port = (srv.address() as AddressInfo).port;
  await new Promise((ok) => srv.close(ok));
  return port;
}

function viaGateway(client: string): Record<string, string> {
  return { "x-forwarded-for": client, "x-forwarded-prefix": PREFIX, "x-forwarded-proto": "http", "x-forwarded-host": "gw.example:8080" };
}

describe("serving under /apps/entity/", () => {
  it("standalone: base href '/' and the identity header", async () => {
    const r = await fetch(`${base}/`);
    const html = await r.text();
    expect(r.headers.get("x-abstractframework-app")).toBe("entity; mount=1");
    expect(html).toContain('<base href="/">');
    expect(html).toContain('"base_path":""');
    expect(html).toContain(`"gateway_url":"${DEAD_GATEWAY}"`);
  });

  it("mounted: base href and base_path under the prefix", async () => {
    const html = await (await fetch(`${base}/`, { headers: viaGateway(REMOTE) })).text();
    expect(html).toContain(`<base href="${PREFIX}/">`);
    expect(html).toContain(`"base_path":"${PREFIX}"`);
    expect(html.match(/<base /g)).toHaveLength(1);
  });

  it("every response announces the app: assets, host info, the SPA fallback, the API, 404s", async () => {
    for (const path of ["/assets/app.js", "/app/host", "/?entity=castor", "/api/connection/gateway", "/missing.html"]) {
      const r = await fetch(`${base}${path}`, { headers: viaGateway(REMOTE) });
      expect(r.headers.get("x-abstractframework-app"), path).toBe("entity; mount=1");
    }
  });

  it("refuses a malformed forwarded header (400)", async () => {
    const r = await fetch(`${base}/`, { headers: { "x-forwarded-prefix": "/apps/../x" } });
    expect(r.status).toBe(400);
  });

  it("the legacy /entity.html redirect is relative: home under the base, query kept", async () => {
    const r = await fetch(`${base}/entity.html?entity=castor`, { headers: viaGateway(REMOTE), redirect: "manual" });
    expect(r.status).toBe(302);
    const loc = r.headers.get("location") || "";
    expect(loc).toBe("./?entity=castor");
    expect(new URL(loc, `http://gw.example:8080${PREFIX}/entity.html`).pathname).toBe(`${PREFIX}/`);
    expect(new URL(loc, "http://127.0.0.1:3007/entity.html").pathname).toBe("/");
  });

  it("sign-out clears the session cookies at Path=/apps/entity/", async () => {
    const r = await fetch(`${base}/api/connection/gateway`, { method: "DELETE", headers: { ...viaGateway("127.0.0.1"), origin: "http://gw.example:8080", "x-abstract-csrf": "x" } });
    const cookies = r.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("abstractentity_gateway_session=") && c.includes(`Path=${PREFIX}/`))).toBe(true);
  });
});

describe("launch flags (the kit parser)", () => {
  function cli(args: string[], env: Record<string, string>) {
    return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf-8", env: { PATH: process.env.PATH || "", ...env }, timeout: 20000 });
  }

  it("--help names --gateway-url with its aliases and the legacy environment", () => {
    const r = cli(["--help"], { HOME: scratch });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--gateway-url <url>");
    expect(r.stdout).toContain("aliases: --gateway, --url");
    expect(r.stdout).toContain("ABSTRACTENTITY_GATEWAY_URL");
  });

  it("refuses an unknown flag (exit 2), never ignores it", () => {
    const r = cli(["--gateway-uri", "http://x:1"], { HOME: scratch });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Unknown option --gateway-uri/);
  });

  it("the gateway: flag (any alias) > legacy env > the local gateway pointer > built-in default", async () => {
    const home = join(scratch, "home");
    mkdirSync(join(home, ".abstractframework"), { recursive: true });
    writeFileSync(join(home, ".abstractframework", "gateway.json"), JSON.stringify({ schema: 1, url: "http://127.0.0.1:18899", port: 18899 }));
    // The real CLI: the gateway URL its page is served with (what the
    // sign-in and the session proxy use), with the source from the banner.
    const served = async (args: string[], env: Record<string, string>) => {
      const { spawn } = await import("child_process");
      const port = await freePort();
      const child = spawn(process.execPath, [CLI, "--port", String(port), ...args], { env: { PATH: process.env.PATH || "", HOME: home, ...env } });
      let out = "";
      try {
        await new Promise<void>((ok) => {
          child.stdout.on("data", (d) => {
            out += String(d);
            if (out.includes("Gateway:")) ok();
          });
          child.on("exit", () => ok());
          setTimeout(ok, 8000);
        });
        const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
        const url = (/"gateway_url":"([^"]+)"/.exec(html) || [])[1];
        const source = (/Gateway:\s+\S+ \((\S+)\)/.exec(out) || [])[1];
        return [url, source];
      } finally {
        child.kill();
        await new Promise((ok) => child.on("exit", ok));
      }
    };
    expect(await served(["--url", "http://flag:1"], { ABSTRACTENTITY_GATEWAY_URL: "http://env:1" })).toEqual(["http://flag:1", "flag"]);
    expect(await served([], { ABSTRACTENTITY_GATEWAY_URL: "http://env:1" })).toEqual(["http://env:1", "env:ABSTRACTENTITY_GATEWAY_URL"]);
    expect(await served([], {})).toEqual(["http://127.0.0.1:18899", "pointer"]);
  });
});
