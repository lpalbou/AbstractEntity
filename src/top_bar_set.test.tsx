// The shared top-bar set (operator ruling 2026-10-29: "change the widget once,
// it changes everywhere"): the docs drawer button, the theme picker
// (Appearance), the About dialog and the account widget are the KIT's
// components, never local copies. Entity passes all four to the kit's
// AfTopBarActions: the docs toggle opens panel-chat's DocsAssistantDrawer,
// Appearance opens the kit's AfAppearanceDialog, `about` renders the kit's
// AfAboutDialog, and identity="menu" with the account status
// (entity_account.ts) renders its ONE account widget. Removing a piece from
// entity_view.tsx (or re-implementing one locally) turns this red.
import React from "react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AfTopBarActions, appIdentity, type GatewayConnectionState } from "@abstractframework/ui-kit";

import { bearerAccountStatus } from "./entity_account";

const view = readFileSync(resolve(__dirname, "entity_view.tsx"), "utf8");

/** The props text of the first `<Tag ... />` in `src` (brace-aware: `/>` inside `{...}` does not end it). */
function jsxProps(src: string, tag: string): string {
  const start = src.indexOf(`<${tag}`);
  expect(start, `<${tag} in entity_view.tsx`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth === 0 && c === "/" && src[i + 1] === ">") return src.slice(start, i);
  }
  throw new Error(`<${tag} is never closed`);
}

function topBar(status: GatewayConnectionState | null): string {
  const noop = () => {};
  return renderToStaticMarkup(
    <AfTopBarActions
      docs={{ open: false, onToggle: noop }}
      appearance={{ onOpen: noop }}
      about={{ identity: appIdentity("abstractentity", "0.0.0") }}
      identity="menu"
      connection={{ phase: "connected", onConnect: noop, onDisconnect: noop, status }}
    />
  );
}

describe("the shared top-bar set", () => {
  const bar = jsxProps(view, "AfTopBarActions");

  it("passes the four kit pieces to AfTopBarActions", () => {
    expect(bar).toMatch(/\bdocs=\{\{ open: assistantOpen,/);
    expect(bar).toMatch(/\bappearance=\{\{ onOpen: \(\) => setAppearanceOpen\(true\) \}\}/);
    expect(bar).toMatch(/\babout=\{about\}/);
    expect(bar).toContain('identity="menu"');
    expect(bar).toMatch(/status: accountStatus,/);
  });

  it("keeps the account status with the sign-in: proxy answer, verified bearer, cleared on disconnect", () => {
    expect(view).toMatch(/setAccountStatus\(status\.state\);\n\s*setAuthVerified\(true\);/);
    expect(view).toMatch(/setAccountStatus\(bearerAccountStatus\(\{ \.\.\.authState, base: storedBase \|\| base \}, probe\.probe\)\);/);
    expect(view).toMatch(/setAccountStatus\(state\.mode === "bearer" \? bearerAccountStatus\(state\) : status \?\? null\);/);
    expect(view).toMatch(/setAuthState\(null\);\n\s*setAccountStatus\(null\);/);
  });

  it("opens the kit dialog and the panel-chat drawer, never local copies", () => {
    expect(jsxProps(view, "AfAppearanceDialog")).toMatch(/open=\{appearanceOpen\}/);
    expect(view).toMatch(/import \{ DocsAssistantDrawer \} from "@abstractframework\/panel-chat"/);
    expect(jsxProps(view, "DocsAssistantDrawer")).toMatch(/open=\{assistantOpen\}/);
    for (const local of [/function \w*About\w*Dialog/, /function \w*Appearance\w*Dialog/, /Signed in as/, /af-topbar__/]) expect(view).not.toMatch(local);
  });

  it("the proxy's answer renders ONE account widget (ui-kit ^0.9.6): name, light, gateway; no pill", () => {
    const html = topBar({ ok: true, has_session: true, gateway_url: "http://127.0.0.1:8080", gateway: { ok: true, principal: { user_id: "albou" } } });
    const at = ["af-topbar__btn--docs", "af-topbar__btn--appearance", "af-topbar__btn--about", 'data-af-identity="menu"'].map((m) => html.indexOf(m));
    expect(at.every((v, i) => v >= 0 && (i === 0 || v > at[i - 1]))).toBe(true);
    expect(html).toContain('<span class="af-topbar__identity-label">albou</span>');
    expect(html).toContain("gateway 127.0.0.1:8080");
    expect(html).not.toContain("af-topbar__pill");
  });
});

describe("bearerAccountStatus (direct posture)", () => {
  const bearer = { mode: "bearer" as const, userId: "typed", token: "t", remembered: true, base: "http://gw.example:8080" };

  it("the probe's user id wins over the typed one, on the verified base", () => {
    const s = bearerAccountStatus(bearer, { operator: true, user_id: "alice", admin: true });
    expect(s).toEqual({ ok: true, has_session: true, gateway_url: "http://gw.example:8080", gateway: { ok: true, principal: { user_id: "alice", admin: true } } });
    expect(topBar(s)).toContain('<span class="af-topbar__identity-label">alice</span>');
  });

  it("without a probe id: the id the browser signed in with", () => {
    expect(bearerAccountStatus(bearer)?.gateway?.principal?.user_id).toBe("typed");
  });

  it("nothing for a session (the proxy answers), no base, or no id", () => {
    expect(bearerAccountStatus({ mode: "session", userId: "x", token: null, remembered: true })).toBeNull();
    expect(bearerAccountStatus({ ...bearer, base: "" })).toBeNull();
    expect(bearerAccountStatus({ ...bearer, userId: "" }, { operator: true })).toBeNull();
    expect(bearerAccountStatus(null)).toBeNull();
  });
});
