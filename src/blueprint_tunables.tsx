/**
 * THE OPERATOR'S DIALS (laurent dm#104: "make those blueprints editable by
 * me, so i can slightly modulate the entity cognition and cycle... when we
 * want new behaviors or fine tune others, we do it on this blueprint").
 *
 * Renders the served blueprint's `tunables` block as editable dials and
 * writes them through the gateway's PUT door (v11 lane, c-t-i #350):
 * deep-merge, rev bump, sha recompute, and a blueprint_edited marker in
 * every entity's biography — an edit is a visible moment, never a silent
 * config change. The machinery re-reads the dials at its next boundary
 * (runtime c-t-i #349: windows re-read at every trigger, no restart).
 *
 * Deliberately DIALS-ONLY: the wire accepts full-spec replacement, but
 * structural edits (phases, transitions, invariants) stay the seat's pen
 * behind review — a slip there rewrites cognition, not a rhythm.
 *
 * Client-side bounds REFUSE loudly (never silently clamp): each dial
 * carries a sane range seeded from the rulings; an out-of-range value
 * names the bound and blocks the save. The server may hold stricter law.
 */
import React, { useCallback, useEffect, useState } from "react";

import { getPhaseSpec, putPhaseSpecTunables, type PhaseSpecServed } from "./stream_source";

interface DialSpec {
  /** Dot path inside tunables (e.g. "personal_cycle.personal_window_h"). */
  path: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  title: string;
}

/** The ruled dials (spec v11 tunables block). Bounds are conservative
 * operator-safety rails, not law: the ruled numbers sit well inside. */
export const DIALS: DialSpec[] = [
  {
    path: "personal_cycle.personal_window_h",
    label: "personal window",
    unit: "h",
    min: 0.25,
    max: 12,
    step: 0.25,
    title:
      "How long a stretch of personal time runs before the maintenance sleep (dm#104: ~2h). The cycle exists to keep his graph healthy — consolidation runs in the sleep window, then he wakes back into personal while the grant stands.",
  },
  {
    path: "personal_cycle.sleep_window_h",
    label: "maintenance sleep",
    unit: "h",
    min: 0.1,
    max: 6,
    step: 0.25,
    title: "The maintenance sleep's length inside the personal cycle (dm#104: ~1h). Bounded by the MAX-SLEEP-6H cap.",
  },
  {
    path: "sleep_bound_h",
    label: "sleep bound",
    unit: "h",
    min: 0.1,
    max: 6,
    step: 0.25,
    title: "Bound for personal-entered sleeps WITHOUT a stamped duration (v5 ruling ~1h; hard cap 6h per the v9 sleep-preemption rules). Renamed from seconds in v12 — the one seconds-dial in an hours block was an operator footgun.",
  },
  {
    path: "unattended_wake_cadence_h",
    label: "unattended wake cadence",
    unit: "h",
    min: 0.5,
    max: 6,
    step: 0.5,
    title: "How often an unattended sleeper wakes for a need-check (dm#89: 'wake at least once every 6h if i am not around' — 6 is the ruled maximum, lower is more vigilant).",
  },
  {
    path: "grant_unused_floor_h",
    label: "grant-use floor",
    unit: "h",
    min: 0,
    max: 12,
    step: 0.5,
    title: "Sleep may not be chosen over an armed personal grant with less than this many hours used (v9: 'personal time was given and not used for at least 2h'). Cycle-sleep windows never count against it (runtime, by construction).",
  },
];

function readPath(obj: Record<string, unknown> | undefined, path: string): number | null {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "number" && Number.isFinite(cur) ? cur : null;
}

/** A dial's wired status from the spec's own tunables_meta (v12 consumption
 * contract): false = declared, not yet consumed — editing it would be the
 * fabricated-selection class (a version bump, a marker, zero behavior), so
 * the surface renders it read-only with the honest words. Absent meta
 * (pre-v12 copy) = unknown, treated as wired (the pre-contract world). */
function metaRow(spec: Record<string, unknown> | undefined, path: string): Record<string, unknown> | null {
  const meta = (spec as { tunables?: { tunables_meta?: Record<string, unknown> } } | undefined)?.tunables?.tunables_meta;
  if (!meta || typeof meta !== "object") return null;
  const row = meta[path];
  return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
}

function dialWired(spec: Record<string, unknown> | undefined, path: string): boolean {
  const row = metaRow(spec, path);
  if (!row) return true;
  return row.wired !== false;
}

/** Refusal bounds come from the SERVED tunables_meta when present (cells
 * adversary P1: this file's seed bounds had already diverged from the
 * served meta on two dials — the two-copies class; the served meta is the
 * law, the local DialSpec numbers are the pre-contract fallback only). */
function dialBounds(spec: Record<string, unknown> | undefined, d: DialSpec): { min: number; max: number } {
  const row = metaRow(spec, d.path);
  const min = row && typeof row.min === "number" && Number.isFinite(row.min) ? (row.min as number) : d.min;
  const max = row && typeof row.max === "number" && Number.isFinite(row.max) ? (row.max as number) : d.max;
  return { min, max };
}

function buildTunables(values: Record<string, number>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, v] of Object.entries(values)) {
    const keys = path.split(".");
    let cur = out;
    for (let i = 0; i < keys.length - 1; i += 1) {
      cur = (cur[keys[i]] ??= {}) as Record<string, unknown>;
    }
    cur[keys[keys.length - 1]] = v;
  }
  return out;
}

export function BlueprintTunables({ baseUrl, token }: { baseUrl: string; token: string | null }): React.ReactElement {
  const [served, setServed] = useState<PhaseSpecServed | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getPhaseSpec(baseUrl)
      .then((s) => {
        setServed(s);
        // v12 overlay wire (gateway c-t-i #357): effective_tunables =
        // base ⊕ operator overlay — the CURRENT law. Older wires fall
        // back to the structural spec's own block.
        const tun = s.effective_tunables ?? (s.spec as { tunables?: Record<string, unknown> } | undefined)?.tunables;
        const next: Record<string, number> = {};
        for (const d of DIALS) {
          const v = readPath(tun, d.path);
          if (v !== null) next[d.path] = v;
        }
        setValues(next);
        setDirty(false);
        setError(null);
      })
      .catch((e: Error & { status?: number }) => {
        // Pre-lane gateway (404) or fetch failure: honest absence, no form.
        setServed(null);
        setError(
          e.status === 404
            ? "This gateway does not serve the blueprint yet — the dials arrive with its next deploy."
            : `Blueprint read failed: ${e.message}`,
        );
      });
  }, [baseUrl]);
  useEffect(() => load(), [load]);

  const violations = DIALS.filter((d) => {
    const v = values[d.path];
    if (v === undefined) return false;
    const { min, max } = dialBounds(served?.spec, d);
    return v < min || v > max;
  });

  const save = () => {
    if (busy || violations.length > 0) return;
    setBusy(true);
    setNote(null);
    setError(null);
    // CAS: send the edit_seq we READ (v12 overlay). Older wires ignore it.
    const readSeq = served?.overlay?.edit_seq ?? null;
    putPhaseSpecTunables(baseUrl, buildTunables(values), reason, token, readSeq)
      .then((r) => {
        // P0 repro finding (c4779, entity probe 2026-07-23): the PUT
        // response carries NO overlay block — reading edit_seq from it
        // rendered "Saved — dial edit ?", which an operator fairly reads
        // as a FAILURE. The GET after save carries the real seq; the
        // header chip shows it. The note states success without a number
        // it cannot know yet.
        const seq = r.overlay?.edit_seq ?? r.operator_rev ?? null;
        setNote(
          seq != null
            ? `Saved — dial edit ${seq}. The machinery reads the new numbers at its next boundary, and the edit is a visible moment in every entity's biography.`
            : "Saved — the dial overlay landed (the edit number appears in the header above). The machinery reads the new numbers at its next boundary, and the edit is a visible moment in every entity's biography.",
        );
        setReason("");
        load();
      })
      .catch((e: Error & { status?: number }) => {
        if (e.status === 409) {
          // The CAS raced another edit: reload the current dials so the
          // operator re-applies over the REAL state, never blind-overwrites.
          setError("Another edit landed while you were editing — the dials below are reloaded to the current values; re-apply your change.");
          load();
          return;
        }
        // Never guess a 403's cause (c4806: csrf_required and admin-only
        // are DIFFERENT refusals; labeling both "admin-only" hid the real
        // one for two days). Show the served reason verbatim.
        setError(`The write door refused (HTTP ${e.status ?? "?"}): ${e.message || "no reason served"}`);
      })
      .finally(() => setBusy(false));
  };

  if (error && !served) return <p className="bp_tun_note">{error}</p>;
  if (!served) return <p className="bp_tun_note">reading the served blueprint…</p>;
  const anyDial = DIALS.some((d) => values[d.path] !== undefined);
  if (!anyDial) {
    return <p className="bp_tun_note">The served blueprint carries no tunables block yet (pre-v11 copy) — the dials appear when it re-vendors.</p>;
  }

  return (
    <div className="bp_tunables" id="bp-dials">
      <div className="bp_tun_head">
        <h3>Operator dials</h3>
        <span
          className="bp_tun_rev"
          title={(() => {
            const seq = served.overlay?.edit_seq ?? null;
            if (seq != null && Number(seq) >= 1)
              return `Modulated by the operator (edit ${seq}${served.overlay?.edited_at ? `, ${served.overlay.edited_at}` : ""}) — the dial overlay rules; the structural law is untouched.`;
            if (served.operator_edited) return `Modulated by the operator (legacy rev ${served.operator_rev ?? "?"}) — the served copy rules.`;
            return "Unmodulated — the dials are the blueprint's ruled seeds.";
          })()}
        >
          {(() => {
            const seq = served.overlay?.edit_seq ?? null;
            if (seq != null && Number(seq) >= 1) return `edit ${seq}`;
            if (served.operator_edited) return `rev ${served.operator_rev ?? "?"}`;
            return "unmodulated";
          })()}
        </span>
      </div>
      <p className="bp_tun_note">
        The rhythm of his life, editable here (dm#104): each save writes the blueprint through the gateway&apos;s door — versioned, hashed, and
        recorded as a visible moment in every entity&apos;s biography. Structure (phases, transitions, laws) is deliberately not editable here.
      </p>
      <div className="bp_tun_grid">
        {DIALS.map((d) => {
          const v = values[d.path];
          if (v === undefined) return null;
          const { min, max } = dialBounds(served.spec, d);
          const bad = v < min || v > max;
          const wired = dialWired(served.spec, d.path);
          return (
            <label
              key={d.path}
              className={`bp_tun_row ${bad ? "bp_tun_bad" : ""} ${wired ? "" : "bp_tun_unwired"}`}
              title={wired ? d.title : `${d.title} — DECLARED, NOT YET CONSUMED (tunables_meta wired:false): its runtime consumer has not landed, so editing it today would change nothing; the dial unlocks when the consumer ships.`}
            >
              <span className="bp_tun_label">{d.label}</span>
              <input
                type="number"
                value={v}
                min={min}
                max={max}
                step={d.step}
                disabled={!wired}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setValues((prev) => ({ ...prev, [d.path]: n }));
                  setDirty(true);
                  setNote(null);
                }}
              />
              <span className="bp_tun_unit">{d.unit}</span>
              {!wired ? <span className="bp_tun_unwired_tag">not yet wired</span> : null}
              {bad ? (
                <span className="bp_tun_bound">
                  out of range ({min}–{max} {d.unit}) — refused, not clamped
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      <div className="bp_tun_actions">
        <input
          className="bp_tun_reason"
          type="text"
          placeholder="why this change (optional — rides the biography marker)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button className="eix_refresh" disabled={busy || !dirty || violations.length > 0} onClick={save} title="Write the dials through the gateway's door (admin-only).">
          {busy ? "writing…" : "save dials"}
        </button>
      </div>
      {/* G3 loud-degrade (gateway c-t-i #376): a corrupt overlay serves seed
        * dials + a labeled warning — rendered verbatim, never absorbed. */}
      {typeof served.warning === "string" && served.warning ? <p className="bp_tun_err">{served.warning}</p> : null}
      {note ? <p className="bp_tun_ok">{note}</p> : null}
      {error ? <p className="bp_tun_err">{error}</p> : null}
    </div>
  );
}
