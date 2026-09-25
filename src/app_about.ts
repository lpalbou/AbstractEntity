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
 *     request path as every other gateway read (credentials + read headers).
 *     A failure is shown as one row, never hidden.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { appIdentity, type AppIdentity } from "@abstractframework/ui-kit";

import { gatewayReadHeaders } from "./stream_source";

export const ENTITY_APP_ID = "abstractentity";

type Row = [string, string];

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

export interface GatewayAbout {
  abstractframework: string | null;
  abstractgateway: string;
  packages: Record<string, string>;
}

/** Rows appended to the About dialog for a gateway that answered. */
export function gatewayAboutRows(about: GatewayAbout): Row[] {
  const rows: Row[] = [
    ["Gateway", String(about.abstractgateway || "version not reported")],
    ["Gateway framework", about.abstractframework ? String(about.abstractframework) : "not installed"],
  ];
  const shown = new Set(["abstractgateway", "abstractframework"]);
  const names = Object.keys(about.packages || {})
    .filter((name) => !shown.has(name))
    .sort();
  for (const name of names) rows.push([name, String(about.packages[name])]);
  return rows;
}

/** The one row shown when the gateway versions could not be read. */
export function gatewayUnavailableRow(reason: string): Row {
  return ["Gateway", `unavailable (${reason})`];
}

/** Read the gateway's About; never throws — failures become one row. */
export async function loadGatewayAboutRows(base: string, fetchImpl: typeof fetch = fetch): Promise<Row[]> {
  const url = `${base.trim().replace(/\/+$/, "")}/api/gateway/about`;
  let res: Response;
  try {
    res = await fetchImpl(url, { credentials: "include", headers: gatewayReadHeaders({ Accept: "application/json" }) });
  } catch (e) {
    return [gatewayUnavailableRow(e instanceof Error ? e.message : String(e))];
  }
  if (!res.ok) return [gatewayUnavailableRow(`HTTP ${res.status}`)];
  // A same-origin page with no gateway behind it answers the SPA's HTML.
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return [gatewayUnavailableRow("not a gateway response")];
  try {
    const body = (await res.json()) as Partial<GatewayAbout> | null;
    if (!body || typeof body.abstractgateway !== "string") {
      return [gatewayUnavailableRow("unexpected response shape")];
    }
    const packages: Record<string, string> = {};
    if (body.packages && typeof body.packages === "object") {
      for (const [k, v] of Object.entries(body.packages)) packages[k] = String(v);
    }
    return gatewayAboutRows({
      abstractgateway: body.abstractgateway,
      abstractframework: typeof body.abstractframework === "string" ? body.abstractframework : null,
      packages,
    });
  } catch (e) {
    return [gatewayUnavailableRow(e instanceof Error ? e.message : String(e))];
  }
}

/** The `about` prop for `AfTopBarActions`. `gatewayBase` is the base the
 * app reads the gateway through ("" = same origin, the proxy posture), or
 * null when the page shows a demo or a file and no gateway is in use. */
export function useEntityAbout(gatewayBase: string | null): {
  identity: AppIdentity;
  extraRows: ReadonlyArray<readonly [string, string]>;
  onOpen: () => void;
} {
  const [extraRows, setExtraRows] = useState<Row[]>([]);
  const seq = useRef(0);
  const onOpen = useCallback(() => {
    const mine = ++seq.current;
    if (gatewayBase === null) {
      setExtraRows([["Gateway", "not connected"]]);
      return;
    }
    setExtraRows([["Gateway", "checking…"]]);
    void loadGatewayAboutRows(gatewayBase).then((rows) => {
      if (mine === seq.current) setExtraRows(rows);
    });
  }, [gatewayBase]);
  return useMemo(() => ({ identity: ENTITY_IDENTITY, extraRows, onOpen }), [extraRows, onOpen]);
}
