/**
 * The account the kit's top bar shows (top-bar set, operator ruling
 * 2026-10-29: the docs button, Appearance, About and the account are the
 * KIT's components in every app). `AfTopBarActions` with `identity="menu"`
 * renders ONE account button (person icon, name, connection light) from a
 * `GatewayConnectionState`: it reads `gateway.principal.user_id` and the
 * `gateway_url` host, and only while the phase is connected.
 *
 * Proxy posture: the state IS the app server's answer (`GET/POST
 * api/connection/gateway`, the kit modal's status): nothing is built here.
 * Direct posture (a cross-origin bearer): the gateway's operator probe
 * confirmed the credential; the account is the probe's user id, else the id
 * the browser signed in with (what the app already shows as "Connected as …"),
 * on the base it was verified against.
 */
import type { GatewayConnectionState } from "@abstractframework/ui-kit";

import type { GatewayAuthState } from "./connect_gateway_modal";
import type { OperatorAuthProbe } from "./stream_source";

export function bearerAccountStatus(auth: GatewayAuthState | null, probe?: OperatorAuthProbe | null): GatewayConnectionState | null {
  if (!auth || auth.mode !== "bearer") return null;
  const base = String(auth.base || "").trim();
  const userId = String(probe?.user_id || auth.userId || "").trim();
  if (!base || !userId) return null;
  return {
    ok: true,
    has_session: true,
    gateway_url: base,
    gateway: { ok: true, principal: { user_id: userId, ...(typeof probe?.admin === "boolean" ? { admin: probe.admin } : {}) } },
  };
}
