/**
 * @handle parsing + resolution (operator 2026-07-15): mentioning another
 * entity by `name@address` in a visit offers to convene a meet. Local vs
 * remote vs self vs unknown, all pure.
 */

import { describe, expect, it } from "vitest";

import { parseEntityHandles, resolveMentions } from "./entity_handle";

const ROSTER = [
  { slug: "ephemeral", name: "Ephemeral" },
  { slug: "castor", name: "Castor" },
  { slug: "mnemosyne", name: "Mnemosyne" },
];
const LOCAL = ["127.0.0.1", "localhost", "0.0.0.0", "192.168.1.146"];

describe("parseEntityHandles", () => {
  it("finds ipv4 and hostname handles", () => {
    const hs = parseEntityHandles("bring in castor@192.168.1.146 and mnemosyne@gw.example.com please");
    expect(hs.map((h) => h.raw)).toEqual(["castor@192.168.1.146", "mnemosyne@gw.example.com"]);
    expect(hs[0]).toMatchObject({ name: "castor", address: "192.168.1.146" });
  });

  it("matches localhost with a port", () => {
    expect(parseEntityHandles("castor@localhost:8080")[0]).toMatchObject({ name: "castor", address: "localhost:8080" });
  });

  it("does NOT match a bare email-ish word without a dotted/host address", () => {
    // "you@home" — 'home' is a single bare token, not a host; must not fire.
    expect(parseEntityHandles("email you@home about it")).toEqual([]);
  });

  it("dedupes repeated handles, keeps order", () => {
    const hs = parseEntityHandles("castor@192.168.1.146 ... castor@192.168.1.146");
    expect(hs).toHaveLength(1);
  });
});

describe("resolveMentions", () => {
  it("a local address + existing OTHER entity → summonable (kind=local)", () => {
    const r = resolveMentions("let's ask castor@192.168.1.146", ROSTER, LOCAL, "ephemeral");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "local", slug: "castor", display: "Castor" });
  });

  it("resolves by display name too, case-insensitively", () => {
    const r = resolveMentions("Castor@LOCALHOST", ROSTER, LOCAL, "ephemeral");
    expect(r[0].kind).toBe("local");
    expect(r[0].slug).toBe("castor");
  });

  it("a remote address → kind=remote (cross-gateway not wired)", () => {
    const r = resolveMentions("castor@10.0.0.9", ROSTER, LOCAL, "ephemeral");
    expect(r[0].kind).toBe("remote");
    expect(r[0].slug).toBeUndefined();
  });

  it("mentioning the CURRENT entity → kind=self (no-op)", () => {
    const r = resolveMentions("what about ephemeral@127.0.0.1", ROSTER, LOCAL, "ephemeral");
    expect(r[0].kind).toBe("self");
  });

  it("a local address but no such entity → kind=unknown", () => {
    const r = resolveMentions("summon ghost@127.0.0.1", ROSTER, LOCAL, "ephemeral");
    expect(r[0].kind).toBe("unknown");
  });

  it("ignores the :port when comparing addresses", () => {
    const r = resolveMentions("castor@192.168.1.146:8080", ROSTER, LOCAL, "ephemeral");
    expect(r[0].kind).toBe("local");
  });

  it("no handles → empty", () => {
    expect(resolveMentions("just a normal message", ROSTER, LOCAL, "ephemeral")).toEqual([]);
  });
});
