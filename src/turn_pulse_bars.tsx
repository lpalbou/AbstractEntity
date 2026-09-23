/**
 * The thinking bars, made to MEAN something (operator 2026-08-01) — pixels
 * only; every number comes from turn_pulse.ts (pure, tested). Three rows in
 * the Cognitive Monitor's own palette so the wait and the gauge read as one
 * instrument family:
 *
 *   turns    #5eead4 (ACT teal)  — pips, one per turn of THIS THREAD (the
 *                                  drawer's whole conversation history —
 *                                  honest label, adversary F5); the one
 *                                  being lived pulses.
 *   recall   #6ea8d8 (ATT blue)  — memories the recall put on the shelf;
 *                                  fill = shelf/considered ONLY when the
 *                                  trace shipped a candidate count (a
 *                                  fabricated denominator was adversary
 *                                  N2); "+N formed" rides here live.
 *   recall~tk #e7b45a (EFF amber)— the snapshot's token estimate for the
 *                                  RECALLED MEMORIES serialized into his
 *                                  context (NOT the full prompt — adversary
 *                                  F1), drawn against the recall budget
 *                                  (12% of the 50k recommendation — the
 *                                  operator's 2026-08-01 re-ruling). Lands
 *                                  at commit — late in the turn, honestly.
 *
 * Absent-not-zero: until a signal's envelope lands, its row shimmers
 * indeterminate exactly like the old skeleton — a bar at 0 would claim a
 * read that was never made. No own aria-live: the parent thinking block is
 * already a polite region (adversary N4 — nested regions double-announce).
 */

import React from "react";

import { fmtTokens, RECALL_TOKENS_SCALE, type TurnPulse } from "./turn_pulse";

const TURN_PIPS_CAP = 12;

export function TurnPulseBars({ turns, pulse }: { turns: number; pulse: TurnPulse }): React.ReactElement {
  const shelfFill = pulse.shelf && pulse.shelf.considered !== null && pulse.shelf.considered > 0 ? Math.min(1, pulse.shelf.selected / pulse.shelf.considered) : null;
  const tokenFill = pulse.recallTokens !== null ? Math.min(1, pulse.recallTokens / RECALL_TOKENS_SCALE) : null;
  const pips = Math.min(turns, TURN_PIPS_CAP);
  const formedSuffix = pulse.formed ? ` +${pulse.formed}` : "";
  return (
    <div className="cd_pulse" aria-label="Live turn signals">
      <div className="cd_pulse_row" title="Turns in this thread — the one being lived now pulses.">
        <span className="cd_pulse_label" style={{ color: "#5eead4" }}>
          turns
        </span>
        <span className="cd_pulse_pips">
          {Array.from({ length: pips }, (_, i) => (
            <span key={i} className={`cd_pulse_pip ${i === pips - 1 ? "cd_pulse_pip_live" : ""}`} />
          ))}
          {turns > TURN_PIPS_CAP ? <span className="cd_pulse_more">+{turns - TURN_PIPS_CAP}</span> : null}
        </span>
        <span className="cd_pulse_val">{turns}</span>
      </div>
      <div
        className="cd_pulse_row"
        title={
          pulse.shelf
            ? `Recall — ${pulse.shelf.selected} memories on the shelf${pulse.shelf.considered !== null ? ` of ${pulse.shelf.considered} considered` : ""}${pulse.formed ? ` · +${pulse.formed} formed this turn` : ""}.`
            : `Recall — waiting for the shelf read (the trace envelope has not landed yet)${pulse.formed ? ` · +${pulse.formed} formed this turn` : ""}.`
        }
      >
        <span className="cd_pulse_label" style={{ color: "#6ea8d8" }}>
          recall
        </span>
        {pulse.shelf && shelfFill !== null ? (
          <span className="cd_pulse_bar">
            <span className="cd_pulse_fill" style={{ width: `${Math.round(shelfFill * 100)}%`, background: "#6ea8d8" }} />
          </span>
        ) : (
          <span className="cd_pulse_bar cd_shimmer" />
        )}
        <span className="cd_pulse_val">
          {pulse.shelf ? `${pulse.shelf.selected}${pulse.shelf.considered !== null ? `/${pulse.shelf.considered}` : ""}${formedSuffix}` : `…${formedSuffix}`}
        </span>
      </div>
      <div
        className="cd_pulse_row"
        title={
          pulse.recallTokens !== null
            ? `~${Math.round(pulse.recallTokens)} tokens of recalled memories serialized into his context (the stream's own estimate — the recall payload, not the full prompt), vs the ${fmtTokens(RECALL_TOKENS_SCALE)} recall budget (12% of the 50k recommended working size). Lands when the turn commits.`
            : "Recalled-memory tokens — the snapshot's estimate lands when the turn commits (late in the turn; some lanes never ship it)."
        }
      >
        <span className="cd_pulse_label" style={{ color: "#e7b45a" }}>
          recall~tk
        </span>
        {pulse.recallTokens !== null && tokenFill !== null ? (
          <span className="cd_pulse_bar">
            <span className="cd_pulse_fill" style={{ width: `${Math.round(tokenFill * 100)}%`, background: "#e7b45a" }} />
          </span>
        ) : (
          <span className="cd_pulse_bar cd_shimmer" />
        )}
        <span className="cd_pulse_val">{pulse.recallTokens !== null ? fmtTokens(pulse.recallTokens) : "…"}</span>
      </div>
    </div>
  );
}
