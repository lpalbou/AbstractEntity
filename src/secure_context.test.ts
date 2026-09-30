import { afterEach, describe, expect, it, vi } from "vitest";

import { clipboardWrite, sha256Hex as sha256HexAnyContext } from "./lib/secure-context";
import { compareSpecs, sha256Hex } from "./spec_sync";

// Plain http from another machine (LAN, Tailscale) is not a secure context:
// the browser withholds crypto.subtle and navigator.clipboard. These tests run
// the spec drift check and the copy path with those APIs removed.

const realCrypto = globalThis.crypto;
const spec = JSON.stringify({ version: 6, phases: { sleep: {}, "réveil ✓": {} } }, null, 2);

function withoutSubtle(): void {
  Object.defineProperty(globalThis, "crypto", {
    value: { getRandomValues: (a: Uint8Array) => realCrypto.getRandomValues(a) },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", { value: realCrypto, configurable: true, writable: true });
  vi.unstubAllGlobals();
});

describe("non-secure context (plain http)", () => {
  it("the spec drift check hashes the same without crypto.subtle", async () => {
    const shaWithSubtle = await sha256Hex(spec);
    withoutSubtle();
    expect((globalThis.crypto as { subtle?: unknown }).subtle).toBeUndefined();
    expect(await sha256Hex(spec)).toBe(shaWithSubtle);
    const r = await compareSpecs(spec, spec, shaWithSubtle);
    expect(r.status).toBe("match");
    expect(await sha256HexAnyContext("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("clipboardWrite falls back to execCommand and reports its result", async () => {
    const appended: unknown[] = [];
    const textarea = { value: "", style: {}, setAttribute() {}, select() {}, setSelectionRange() {} };
    const execCommand = vi.fn(() => true);
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      body: { appendChild: (el: unknown) => appended.push(el), removeChild: (el: unknown) => appended.splice(appended.indexOf(el), 1) },
      activeElement: null,
      createElement: () => textarea,
      execCommand,
    });
    expect(await clipboardWrite("visit transcript")).toBe(true);
    expect(textarea.value).toBe("visit transcript");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(appended.length).toBe(0);
    execCommand.mockReturnValue(false);
    expect(await clipboardWrite("visit transcript")).toBe(false);
  });
});
