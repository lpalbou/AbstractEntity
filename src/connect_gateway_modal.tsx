/**
 * Sign in to the gateway — the SHARED card (ui-kit GatewaySessionSignInCard,
 * the same component AbstractFlow renders), wired for the entity app.
 *
 * TWO POSTURES, decided by the HOST (entity_view detects them, the modal
 * never guesses — the 2026-07-10 regression was exactly a modal that
 * signed the browser in against a base the app then didn't use):
 *
 * - PROXY posture (the page is served by this app's CLI, which exposes
 *   POST /api/connection/gateway): the SHARED uic GatewayConnectModal owns
 *   the whole sign-in/sign-out lifecycle (2026-07-12 compliance wave) —
 *   token exchanged for a server-side session + FIRST-PARTY HttpOnly
 *   cookies, nothing persisted in localStorage. The kit dialog shows the
 *   gateway URL field; the app-server proxy still pins/validates the URL
 *   server-side (hosted deployments refuse browser-supplied changes).
 * - DIRECT posture (a cross-origin gateway base, e.g. ?gateway= deep
 *   links): the token is verified against the operator probe and kept as
 *   the browser's Bearer credential, stored WITH the base it was verified
 *   against (a base-less credential replayed against a different base was
 *   the "asks me at every refresh" bug).
 */

import React, { useRef, useState } from "react";

import { GatewayConnectModal, GatewaySessionSignInCard, type GatewayConnectionState } from "@abstractframework/ui-kit";

import { classifyOperatorAuth } from "./stream_source";

export interface GatewayAuthState {
  mode: "session" | "bearer";
  userId: string;
  token: string | null; // bearer mode only
  remembered: boolean;
  /** The base this credential was VERIFIED against (bearer mode). A
   * credential without its base is a split-brain seed — never replay it
   * against a different gateway. */
  base?: string;
}

export const AUTH_STORAGE_KEY = "abstractentity_gateway_auth";

/** TOKENS NEVER REST CLIENT-SIDE (framework ruling, restated by uic
 * 2026-07-12 c1142: "not dev-waivable"). Bearer credentials now live only
 * in memory for the tab's lifetime — the direct dev posture re-prompts on
 * reload, and that friction is the ruling working. This loader's only
 * remaining job is MIGRATION: scrub any token persisted by earlier builds
 * (including the pre-split observer-branded spellings, for anyone serving
 * this app on an origin the old build once used). */
export function loadStoredAuth(): GatewayAuthState | null {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem("abstractobserver_gateway_auth");
    localStorage.removeItem("abstractobserver_entity_token");
  } catch {
    // presentation state only
  }
  return null;
}

export function storeAuth(state: GatewayAuthState | null): void {
  void state;
  try {
    // Never persist — see the ruling note on loadStoredAuth. The proxy
    // session lives in HttpOnly cookies; bearer creds live in memory only.
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // best-effort
  }
}

export interface ConnectGatewayModalProps {
  /** PROXY posture: sign in through the page origin's connection API via
   * the shared uic dialog (URL shown, server-validated). */
  proxyMode: boolean;
  /** The app's RESOLVED base (direct posture). The modal signs in against
   * exactly this — never a divergent internal default. Empty = first
   * connect with no base known yet (the URL field is shown). */
  baseUrl: string;
  onBaseUrlChange(value: string): void;
  onConnected(state: GatewayAuthState): void;
  onClose(): void;
}

function ProxyKitModal(props: {
  onClose(): void;
  onConnected(state: GatewayAuthState): void;
  defaultGatewayUrl: string;
}): React.ReactElement {
  // First status = the open-probe baseline; only a session gained AFTER it
  // reports as a connection (see the posture note above).
  const sawFirstStatus = useRef(false);
  const hadSessionAtOpen = useRef(false);
  return (
    <GatewayConnectModal
      isOpen
      onClose={props.onClose}
      appName="AbstractEntity"
      defaultGatewayUrl={props.defaultGatewayUrl}
      onStatusChange={(s: GatewayConnectionState | null) => {
        const signed_in = Boolean(s && s.has_session && s.gateway?.ok);
        if (!sawFirstStatus.current) {
          sawFirstStatus.current = true;
          hadSessionAtOpen.current = signed_in;
          return;
        }
        if (signed_in && !hadSessionAtOpen.current) {
          const principal = String(s?.gateway?.principal?.user_id || "").trim();
          props.onConnected({ mode: "session", userId: principal || "operator", token: null, remembered: true });
        }
        // Sign-out inside the modal: the baseline resets so a re-sign-in
        // in the same open reports as fresh.
        if (!signed_in) hadSessionAtOpen.current = false;
      }}
    />
  );
}

export function ConnectGatewayModal({ proxyMode, baseUrl, onBaseUrlChange, onConnected, onClose }: ConnectGatewayModalProps): React.ReactElement {
  const [userId, setUserId] = useState("admin");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Direct posture only: when the app has no base yet, offer the injected
  // config, else the STANDARD gateway port — never this page's own origin
  // (the observer's static server port is not a gateway).
  const injected = (
    (window as unknown as { __ABSTRACT_UI_CONFIG__?: { gateway_url?: string } }).__ABSTRACT_UI_CONFIG__?.gateway_url || ""
  ).trim();
  const DEFAULT_GATEWAY = "http://127.0.0.1:8080";
  const effectiveUrl = proxyMode ? "" : (baseUrl || "").trim() || injected || DEFAULT_GATEWAY;

  // PROXY posture = the SHARED uic modal verbatim (maintainer directive
  // 2026-07-12: comply with abstractflow/console). It owns the whole
  // sign-in/sign-out lifecycle against /api/connection/gateway; this
  // wrapper only translates its status into the entity app's auth state.
  //
  // onStatusChange fires on OPEN too (the modal probes the existing
  // session) — only a session that APPEARS after open is a fresh sign-in.
  // Reporting the pre-existing one would instantly close the modal (the
  // host closes on onConnected), making sign-out unreachable.
  if (proxyMode) {
    return <ProxyKitModal onClose={onClose} onConnected={onConnected} defaultGatewayUrl={injected || DEFAULT_GATEWAY} />;
  }

  const submit = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      // Direct posture (dev cross-origin ?gateway= deep links): verify the
      // bearer against the app's resolved base.
      const url = effectiveUrl.replace(/\/+$/, "");
      const probe = await classifyOperatorAuth(url, token.trim());
      if (probe.kind === "operator") {
        const state: GatewayAuthState = {
          mode: "bearer",
          userId: probe.probe.user_id || userId.trim() || "operator",
          token: token.trim(),
          remembered: remember,
          base: url,
        };
        storeAuth(state);
        onConnected(state);
        return;
      }
      if (probe.kind === "refused") {
        setError("The gateway refused this token (401). Check the token — and that the gateway URL is right.");
      } else {
        setError(`Could not reach the gateway: ${probe.error}`);
      }
    } catch (e) {
      setError(`Sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="ev_backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ev_panel cgm_panel">
        <GatewaySessionSignInCard
          kicker="Entity app connection (direct dev)"
          title="Connect this browser to AbstractGateway"
          description="Sign in with a Gateway user token. The token stays in this browser as a Bearer credential for this gateway (development posture — served deployments use the shared session dialog)."
          statusLabel="Signed out"
          statusTone="warn"
          tokenSourceLabel="token: missing"
          showGatewayUrl
          gatewayUrl={effectiveUrl}
          gatewayUrlPlaceholder={injected || DEFAULT_GATEWAY}
          onGatewayUrlChange={onBaseUrlChange}
          userId={userId}
          onUserIdChange={setUserId}
          token={token}
          onTokenChange={setToken}
          showToken={showToken}
          onShowTokenChange={setShowToken}
          remember={remember}
          rememberLabel="Keep this browser signed in"
          onRememberChange={setRemember}
          submitting={submitting}
          error={error}
          showClose
          onClose={onClose}
          onSubmit={submit}
        />
      </div>
    </div>
  );
}
