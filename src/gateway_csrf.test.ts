/**
 * P0 c4779 / gateway c4806: the direct-gateway session posture refuses
 * writes without x-abstractgateway-csrf. The client sends BOTH CSRF
 * spellings, each only when its own posture's cookie exists. Node-env
 * test: the readers only touch document.cookie, so a plain stub serves.
 */
import { afterEach, describe, expect, it } from "vitest";

import { proxyCsrfToken, gatewayCsrfToken } from "./stream_source";

function stubCookies(cookie: string): void {
  (globalThis as { document?: { cookie: string } }).document = { cookie };
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe("csrf twins", () => {
  it("proxy posture: only the app-proxy cookie yields the proxy token", () => {
    stubCookies("abstractentity_gateway_csrf=proxytok; other=1");
    expect(proxyCsrfToken()).toBe("proxytok");
    expect(gatewayCsrfToken()).toBeNull();
  });

  it("direct posture: only the gateway cookie yields the gateway token (the c4806 silent-403 fix)", () => {
    stubCookies("abstractgateway_csrf=gwtok");
    expect(gatewayCsrfToken()).toBe("gwtok");
    expect(proxyCsrfToken()).toBeNull();
  });

  it("no document (tests) or no cookies: both absent — direct-bearer posture sends no CSRF headers", () => {
    expect(proxyCsrfToken()).toBeNull();
    expect(gatewayCsrfToken()).toBeNull();
    stubCookies("");
    expect(proxyCsrfToken()).toBeNull();
    expect(gatewayCsrfToken()).toBeNull();
  });
});
