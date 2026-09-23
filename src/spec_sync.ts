/**
 * ONE-GRAPH drift check (laurent dm#79: "there is only one state graph per
 * entity and it MUST be shared across you guys"; mechanism adopted commons
 * 3561-3568). The gateway VENDORS this repo's spec/entity_phases.json and
 * serves it at GET /api/gateway/entities/spec/phases as
 * {spec, vendored, sha256, source}. This module compares the WIRE copy
 * against the copy bundled into this app at build time and reports drift —
 * byte comparison via sha256 (observer's amendment, adopted c3565: a
 * version-only check trusts the pen's bump discipline instead of
 * verifying it; a same-version content edit would slip past).
 *
 * Outcomes are honest, never alarmist:
 * - "match":       wire sha == bundled sha — one graph everywhere.
 * - "drift":       both sides answered and disagree — one side is stale
 *                  (bundle behind a spec bump, or gateway missed the
 *                  same-day re-vendor). Renders as a warning.
 * - "unavailable": older gateway (404) or fetch failure — the
 *                  pre-mechanism world; the bundled copy is the truth,
 *                  NO warning (absence of the endpoint is not drift).
 */

import bundledSpecRaw from "../spec/entity_phases.json?raw";

export interface SpecSyncResult {
  /** "modulated" (LEGACY one-morning wire only, gateway c-t-i #350): the
   * first-build PUT mutated the served spec bytes, so a sha mismatch with
   * operator_edited=true was laurent modulating. The v12 overlay rebuild
   * (c-t-i #357) made modulation ORTHOGONAL to drift: the structural sha
   * never changes on an operator edit — status reads "match" and the
   * modulation rides the `overlay` field below. */
  status: "match" | "drift" | "unavailable" | "modulated";
  bundled: { version: number | null; sha256: string };
  wire?: { version: number | null; sha256: string | null; operator_rev?: number | null };
  /** The operator's dial overlay (v12 shape): present with edit_seq >= 1
   * when laurent has modulated — rendered as the quiet 🎛 note by
   * consumers, independent of the drift status. */
  overlay?: { edit_seq?: number | null; edited_by?: string | null; edited_at?: string | null } | null;
  detail: string;
}

function specVersion(raw: string): number | null {
  try {
    const v = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compare the bundled spec against another raw copy (pure — testable
 * without a network). `operatorEdited` = the gateway's operator_edited
 * wire flag (v11 PUT lane): the served copy carries a laurent edit, so
 * a byte difference is MODULATION, not drift — the served spec is the
 * source of truth and this app's bundle is the fallback shape. */
export async function compareSpecs(
  bundledRaw: string,
  wireRaw: string,
  wireSha?: string | null,
  operatorEdited?: boolean,
  operatorRev?: number | null,
): Promise<SpecSyncResult> {
  const bundledSha = await sha256Hex(bundledRaw);
  const bundled = { version: specVersion(bundledRaw), sha256: bundledSha };
  const wire = { version: specVersion(wireRaw), sha256: wireSha ?? null, operator_rev: operatorRev ?? null };
  if (operatorEdited && wireSha && wireSha !== bundledSha) {
    return {
      status: "modulated",
      bundled,
      wire,
      detail: `the operator modulated the blueprint (rev ${operatorRev ?? "?"}) — the served copy is the ruling truth; this bundle is the pre-edit shape`,
    };
  }
  // The gateway's declared sha is over ITS vendored file bytes — the only
  // honest byte comparison. Without it, hashing our re-serialization of
  // the served object would compare FORMATTING, not content, and
  // false-drift on byte-identical graphs — so absent sha degrades to a
  // version-level check, labeled as such.
  if (!wireSha) {
    if (wire.version != null && wire.version === bundled.version) {
      return { status: "match", bundled, wire, detail: `one graph at version level (v${bundled.version}; wire sha absent — byte check unavailable)` };
    }
    return {
      status: wire.version == null ? "unavailable" : "drift",
      bundled,
      wire,
      detail:
        wire.version == null
          ? "wire spec carries no version and no sha — treated as pre-mechanism"
          : `version mismatch (bundled v${bundled.version} vs wire v${wire.version}; sha absent)`,
    };
  }
  if (wireSha === bundledSha) {
    return { status: "match", bundled, wire, detail: `one graph (v${bundled.version}, sha ${bundledSha.slice(0, 12)}…)` };
  }
  const who =
    bundled.version != null && wire.version != null && bundled.version !== wire.version
      ? bundled.version > wire.version
        ? `this app bundles v${bundled.version} but the gateway serves v${wire.version} — the gateway missed a same-day re-vendor`
        : `the gateway serves v${wire.version} but this app bundles v${bundled.version} — this build is behind a spec bump (hard-reload / rebuild)`
      : `same version (v${bundled.version}) with different bytes — a content edit without a version bump slipped one side`;
  return { status: "drift", bundled, wire, detail: who };
}

/** Fetch the gateway's vendored graph and compare. Never throws. */
export async function checkSpecSync(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<SpecSyncResult> {
  const bundledSha = await sha256Hex(bundledSpecRaw);
  const bundled = { version: specVersion(bundledSpecRaw), sha256: bundledSha };
  try {
    const res = await fetch(`${baseUrl}/api/gateway/entities/spec/phases`, { headers });
    if (!res.ok) {
      return { status: "unavailable", bundled, detail: `gateway does not serve the graph yet (HTTP ${res.status}) — bundled v${bundled.version} is the local truth` };
    }
    const body = (await res.json()) as {
      spec?: unknown;
      sha256?: string | null;
      operator_edited?: boolean;
      operator_rev?: number | null;
      overlay?: { edit_seq?: number | null; edited_by?: string | null; edited_at?: string | null } | null;
    };
    if (!body || body.spec === undefined) {
      return { status: "unavailable", bundled, detail: "endpoint answered without a spec body — treated as pre-mechanism" };
    }
    // The gateway's sha256 is over ITS vendored bytes; hashing our
    // re-serialization of body.spec would compare formatting, not bytes,
    // so the declared sha is authoritative for the wire side.
    const wireRaw = JSON.stringify(body.spec);
    const result = await compareSpecs(bundledSpecRaw, wireRaw, body.sha256 ?? null, Boolean(body.operator_edited), body.operator_rev ?? null);
    // v12 overlay wire (c-t-i #357): modulation rides BESIDE the structural
    // sha — carried through so consumers render the 🎛 note independently
    // of drift (an overlay edit is never drift by construction now).
    if (body.overlay && typeof body.overlay === "object" && Number(body.overlay.edit_seq ?? 0) >= 1) {
      result.overlay = body.overlay;
    }
    return result;
  } catch (err) {
    return { status: "unavailable", bundled, detail: `graph endpoint unreachable (${String(err).slice(0, 80)}) — bundled v${bundled.version} is the local truth` };
  }
}
