/**
 * The About dialog wiring for AbstractEntity.
 *
 * The dialog itself is the kit's shared `AfAboutDialog` (opened from the
 * About button of `AfTopBarActions`); this module supplies what only the
 * app knows:
 *   - its identity: `appIdentity("abstractentity", APP_VERSION)`, where
 *     APP_VERSION is package.json's version, baked in at build time
 *     (vite.config.ts `define`);
 *   - the connected gateway's versions, fetched LAZILY each time the dialog
 *     opens from `GET {base}/api/gateway/about`
 *     (`{ abstractframework, abstractgateway, packages }`) through the same
 *     request path as every other gateway read (credentials + read headers),
 *     reduced by the kit's `aboutVersionsFromGateway` to the framework and
 *     gateway versions (kit 0.7.0 compact About: never a package list). A
 *     failure is shown in place of the gateway version, never hidden.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { aboutVersionsFromGateway, appIdentity, type AfAboutVersions, type AppIdentity, type GatewayAboutPayload, joinBaseUrl } from "@abstractframework/ui-kit";

import { gatewayReadHeaders } from "./stream_source";

export const ENTITY_APP_ID = "abstractentity";

/** Resolve the build-time version. Production and dev builds always carry
 * the define; only the test runner may fall back, and it says so. */
export function resolveAppVersion(defined: string | undefined, mode: string): string {
  const v = typeof defined === "string" ? defined.trim() : "";
  if (v) return v;
  if (mode === "test") return "0.0.0-test";
  throw new Error("AbstractEntity: __APP_VERSION__ is not defined (vite.config.ts `define` is missing)");
}

export const APP_VERSION: string = resolveAppVersion(
  typeof __APP_VERSION__ === "undefined" ? undefined : __APP_VERSION__,
  import.meta.env.MODE,
);

/** The descriptor-backed identity of this app (name, links, version). */
export const ENTITY_IDENTITY: AppIdentity = appIdentity(ENTITY_APP_ID, APP_VERSION);

/** Read the gateway's About versions; never throws — a failure becomes the
 * gateway note ("unavailable (<reason>)"). */
export async function loadGatewayAboutVersions(base: string, fetchImpl: typeof fetch = fetch): Promise<AfAboutVersions> {
  const url = joinBaseUrl(base.trim(), "api/gateway/about");
  let res: Response;
  try {
    res = await fetchImpl(url, { credentials: "include", headers: gatewayReadHeaders({ Accept: "application/json" }) });
  } catch (e) {
    return aboutVersionsFromGateway(null, e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) return aboutVersionsFromGateway(null, `HTTP ${res.status}`);
  // A same-origin page with no gateway behind it answers the SPA's HTML.
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return aboutVersionsFromGateway(null, "not a gateway response");
  let body: GatewayAboutPayload;
  try {
    body = (await res.json()) as GatewayAboutPayload;
  } catch (e) {
    return aboutVersionsFromGateway(null, e instanceof Error ? e.message : String(e));
  }
  return aboutVersionsFromGateway(body);
}

export const ABOUT_NOT_CONNECTED: AfAboutVersions = { framework: null, gateway: null, gatewayNote: "not connected" };
export const ABOUT_CHECKING: AfAboutVersions = { framework: null, gateway: null, gatewayNote: "checking…" };

/** The `about` prop for `AfTopBarActions`. `gatewayBase` is the base the
 * app reads the gateway through ("" = same origin, the proxy posture), or
 * null when the page shows a demo or a file and no gateway is in use. */
export function useEntityAbout(gatewayBase: string | null): {
  identity: AppIdentity;
  versions: AfAboutVersions;
  onOpen: () => void;
} {
  const [versions, setVersions] = useState<AfAboutVersions>(gatewayBase === null ? ABOUT_NOT_CONNECTED : ABOUT_CHECKING);
  const seq = useRef(0);
  const onOpen = useCallback(() => {
    const mine = ++seq.current;
    if (gatewayBase === null) {
      setVersions(ABOUT_NOT_CONNECTED);
      return;
    }
    setVersions(ABOUT_CHECKING);
    void loadGatewayAboutVersions(gatewayBase).then((v) => {
      if (mine === seq.current) setVersions(v);
    });
  }, [gatewayBase]);
  return useMemo(() => ({ identity: ENTITY_IDENTITY, versions, onOpen }), [versions, onOpen]);
}
