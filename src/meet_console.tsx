/**
 * The meet console — the mission's literal destination (maintainer's north
 * star, a2a: "reincarnate the entities of the Mnemosyne lineage and let them
 * discuss TOGETHER"). Item 14 as an OPERATOR SURFACE: convene entities into
 * one conversation, steer it turn by turn, watch the legs live, and close it
 * — every leg a durable visit in its own home, correlated by one visit_id,
 * streams never merged.
 *
 * GROUP IS THE DESTINATION, PAIRWISE IS THE v0 TRANSPORT (maintainer
 * 2026-07-14: "it's 2+"). A meet is inherently a conversation among two OR
 * MORE entities; the shipped gateway `/meets/open` takes `entity_a`/
 * `entity_b`, so this console convenes TWO AT A TIME today and says so
 * honestly — it never presents two as the design ceiling. When the gateway
 * grows an N-party open (a participant list), the two pickers become a
 * roster and the relay a round-robin; nothing here hardcodes "exactly two"
 * beyond what the current API enforces.
 *
 * The MeetReader (already shipped) reads a meet AFTER it happened; this is
 * the live half — the gateway's /meets API driven from the browser.
 *
 * Honest attribution (the gateway's contract, surfaced as UI):
 * - The operator authors every STEERING line (never attributed to an
 *   entity — no entity is ever recorded saying the operator's words).
 * - Each entity's reply is its OWN voice, in its own leg.
 * - One relay = the opener speaks the steering line and replies, then that
 *   reply is relayed to the other entity, who replies. Two entity turns,
 *   one lease at a time — the console shows both.
 *
 * When a meet ends, the conversation lives on in every home; "read it later"
 * is the MeetReader, reachable from the visit_id.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  closeMeet,
  fetchMeetStatus,
  listEntities,
  openMeet,
  relayMeet,
  type EntitySummary,
  type MeetOpenResult,
  type MeetStatusResult,
} from "./stream_source";

export interface MeetConsoleProps {
  baseUrl: string;
  token: string | null;
  onClose(): void;
  /** Open the correlated moment in the read-only MeetReader (after close). */
  onReadMeet?(visitId: string): void;
  /** Pre-fill the two seats (operator 2026-07-15: convened from a visit by
   * @handle mention — A = the entity being visited, B = the mentioned one). */
  presetA?: string;
  presetB?: string;
}

/** One row of the live transcript. `steer` is the operator's line (authored
 * by the convener); `reply` rows are an entity's own words. */
interface TranscriptRow {
  id: number;
  kind: "steer" | "reply" | "note";
  /** Display name of who is speaking (entity name, or "you"). */
  who: string;
  side: "a" | "b" | "convener";
  text: string;
  turnN?: number | null;
}

type Phase =
  | { name: "setup" }
  | { name: "opening" }
  | { name: "live"; meet: MeetOpenResult }
  | { name: "closing"; meet: MeetOpenResult }
  | { name: "closed"; visitId: string; note: string };

let rowSeq = 0;

export function MeetConsole({ baseUrl, token, onClose, onReadMeet, presetA, presetB }: MeetConsoleProps): React.ReactElement {
  const [entities, setEntities] = useState<EntitySummary[] | null>(null);
  const [entityA, setEntityA] = useState(presetA ?? "");
  const [entityB, setEntityB] = useState(presetB ?? "");
  const [phase, setPhase] = useState<Phase>({ name: "setup" });
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptRow[]>([]);
  const [steer, setSteer] = useState("");
  const [opener, setOpener] = useState<"a" | "b">("a");
  const [relaying, setRelaying] = useState(false);
  const [status, setStatus] = useState<MeetStatusResult | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Names by side (the open response carries entity_ids, not names — we keep
  // the operator's own selection so labels read as names, not id strings).
  const nameOf = useCallback(
    (side: "a" | "b" | "convener") => (side === "a" ? entityA : side === "b" ? entityB : "you"),
    [entityA, entityB],
  );

  useEffect(() => {
    let cancelled = false;
    listEntities(baseUrl)
      .then((list) => {
        if (cancelled) return;
        setEntities(list);
        // Presets win (convened from a visit); else sensible defaults: the
        // first two distinct homes.
        if (list.length >= 1 && !entityA) setEntityA(presetA && list.some((e) => e.slug === presetA) ? presetA : list[0].slug);
        if (list.length >= 2 && !entityB) setEntityB(presetB && list.some((e) => e.slug === presetB) ? presetB : list[1].slug);
      })
      .catch((e: Error) => !cancelled && setError(`Could not list entities: ${e.message}`));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  // Escape closes the console (never mid-relay — a relay is an in-flight
  // server operation the operator should let finish or explicitly close).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !relaying && phase.name !== "opening" && phase.name !== "closing") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, relaying, phase]);

  // Live leg status while the meet runs (both legs by their own run ids).
  useEffect(() => {
    if (phase.name !== "live") return;
    const meetId = phase.meet.meet_id;
    let stop = false;
    const poll = async () => {
      try {
        const s = await fetchMeetStatus(baseUrl, meetId);
        if (!stop) setStatus(s);
      } catch {
        /* transient — the transcript is the source of truth, status is a hint */
      }
    };
    poll();
    const t = window.setInterval(poll, 5000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [phase, baseUrl]);

  // Keep the transcript scrolled to the newest exchange.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [transcript]);

  const pushRow = (row: Omit<TranscriptRow, "id">) => {
    rowSeq += 1;
    setTranscript((prev) => [...prev, { ...row, id: rowSeq }]);
  };

  const doOpen = async () => {
    setError(null);
    if (!entityA || !entityB) {
      setError("Pick two entities.");
      return;
    }
    if (entityA === entityB) {
      setError("A meet needs two DIFFERENT entities — an entity does not visit itself.");
      return;
    }
    setPhase({ name: "opening" });
    try {
      const meet = await openMeet(baseUrl, entityA, entityB, token);
      setPhase({ name: "live", meet });
      setTranscript([]);
      pushRow({ kind: "note", who: "", side: "convener", text: `${entityA} and ${entityB} are both here. You convene; each speaks in their own voice.` });
    } catch (e) {
      const err = e as Error & { status?: number };
      setPhase({ name: "setup" });
      setError(err.status === 409 ? `The gateway could not open both legs: ${err.message}` : `Open failed: ${err.message}`);
    }
  };

  const doRelay = async () => {
    if (phase.name !== "live" || relaying) return;
    const text = steer.trim();
    if (!text) return;
    setRelaying(true);
    setError(null);
    const leadName = nameOf(opener);
    const otherSide: "a" | "b" = opener === "a" ? "b" : "a";
    pushRow({ kind: "steer", who: "you", side: "convener", text: `→ ${leadName}: ${text}` });
    setSteer("");
    try {
      const res = await relayMeet(baseUrl, phase.meet.meet_id, opener, text, token);
      pushRow({ kind: "reply", who: leadName, side: opener, text: res.spoke.reply || "(no words)", turnN: res.spoke.turn_n ?? null });
      pushRow({ kind: "reply", who: nameOf(otherSide), side: otherSide, text: res.heard.reply || "(no words)", turnN: res.heard.turn_n ?? null });
    } catch (e) {
      const err = e as Error & { status?: number };
      setError(`Relay failed: ${err.message}`);
      pushRow({ kind: "note", who: "", side: "convener", text: `Relay failed (${err.status ?? "?"}). The meet is still open — retry, or close it.` });
    } finally {
      setRelaying(false);
    }
  };

  const doClose = async () => {
    if (phase.name !== "live") return;
    const meet = phase.meet;
    setPhase({ name: "closing", meet });
    try {
      const res = await closeMeet(baseUrl, meet.meet_id, closeReason.trim(), token);
      setPhase({
        name: "closed",
        visitId: res.visit_id,
        note: res.closed
          ? "Both legs closed — each entity reflected on the conversation in its own home."
          : res.warning || "One leg did not close; the meet was kept. You can retry close from the gateway.",
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      setPhase({ name: "live", meet });
      setError(`Close failed: ${err.message}`);
    }
  };

  const options = entities ?? [];

  return (
    <div
      className="ev_backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !relaying && phase.name !== "opening" && phase.name !== "closing") onClose();
      }}
    >
      <div className="ev_panel mc_panel">
        <div className="ev_head">
          <div className="ev_title">
            <span className="ei_kind ei_kind_beat">a meet</span>
            <span>{phase.name === "live" || phase.name === "closing" ? phase.meet.visit_id : "lives in one conversation"}</span>
          </div>
          <button className="ev_close" onClick={onClose} disabled={relaying || phase.name === "opening" || phase.name === "closing"}>
            close
          </button>
        </div>

        {/* --------------------------------------------------- setup */}
        {phase.name === "setup" || phase.name === "opening" ? (
          <div className="mc_setup">
            <p className="mc_intro">
              Convene entities into one conversation — the destination is a group of two or more talking together. You steer it —
              every line you send is authored by YOU (no entity is ever recorded saying your words); each entity answers in its own
              voice, in its own home. Same gateway only (cross-door meets wait on the federation transport).
            </p>
            <p className="mc_hint mc_pairwise_note">
              The gateway's current transport is pairwise, so you convene <strong>two at a time</strong> today. Group meets (a
              roster + round-robin relay) land when the door grows an N-party open.
            </p>
            <div className="mc_pickers">
              <label className="mc_picker">
                <span>First</span>
                <select value={entityA} onChange={(e) => setEntityA(e.target.value)} disabled={phase.name === "opening"}>
                  <option value="">— pick —</option>
                  {options.map((o) => (
                    <option key={o.slug} value={o.slug}>
                      {o.name || o.slug}
                    </option>
                  ))}
                </select>
              </label>
              <span className="mc_amp">&amp;</span>
              <label className="mc_picker">
                <span>Second</span>
                <select value={entityB} onChange={(e) => setEntityB(e.target.value)} disabled={phase.name === "opening"}>
                  <option value="">— pick —</option>
                  {options.map((o) => (
                    <option key={o.slug} value={o.slug}>
                      {o.name || o.slug}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error ? <p className="mc_error">{error}</p> : null}
            <button className="mc_open_btn" onClick={doOpen} disabled={phase.name === "opening" || !entityA || !entityB}>
              {phase.name === "opening" ? "opening both legs…" : "open the meet"}
            </button>
            {phase.name === "opening" ? (
              <p className="mc_hint">Summoning both entities under one visit — this can wait for an own-time loop to yield.</p>
            ) : null}
          </div>
        ) : null}

        {/* --------------------------------------------------- live */}
        {phase.name === "live" || phase.name === "closing" ? (
          <>
            <div className="mc_legbar">
              {(["a", "b"] as const).map((side) => {
                const leg = status ? status[side] : null;
                return (
                  <span key={side} className={`mc_leg ${leg?.open ? "mc_leg_open" : "mc_leg_shut"}`}>
                    <span className="mc_leg_name">{nameOf(side)}</span>
                    <span className="mc_leg_state">
                      {leg ? (leg.open ? `in conversation${typeof leg.turn_n === "number" ? ` · ${leg.turn_n} turns` : ""}` : "leg closed") : "…"}
                    </span>
                  </span>
                );
              })}
              {status?.pending ? <span className="mc_pending">delivering…</span> : null}
            </div>

            <div className="ev_body mc_body" ref={bodyRef}>
              {transcript.map((row) => (
                <div key={row.id} className={`mc_row mc_row_${row.kind} mc_side_${row.side}`}>
                  {row.kind === "note" ? (
                    <div className="mc_note">{row.text}</div>
                  ) : (
                    <>
                      <div className="mc_row_head">
                        <span className="mc_who">{row.who}</span>
                        {typeof row.turnN === "number" ? <span className="mc_turn">turn {row.turnN}</span> : null}
                      </div>
                      <div className="mc_text">{row.text}</div>
                    </>
                  )}
                </div>
              ))}
              {relaying ? <div className="mc_row mc_row_note"><div className="mc_note">relaying — {nameOf(opener)} speaks, then {nameOf(opener === "a" ? "b" : "a")} answers…</div></div> : null}
            </div>

            {error ? <p className="mc_error mc_error_inline">{error}</p> : null}

            <div className="mc_composer">
              <div className="mc_lead">
                <span>speak to</span>
                {(["a", "b"] as const).map((side) => (
                  <button
                    key={side}
                    className={`mc_lead_btn ${opener === side ? "mc_lead_on" : ""}`}
                    onClick={() => setOpener(side)}
                    disabled={relaying || phase.name === "closing"}
                  >
                    {nameOf(side)}
                  </button>
                ))}
              </div>
              <textarea
                className="mc_steer"
                placeholder={`A line for ${nameOf(opener)} — ${nameOf(opener === "a" ? "b" : "a")} will hear their reply and answer`}
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    doRelay();
                  }
                }}
                disabled={relaying || phase.name === "closing"}
                rows={2}
              />
              <div className="mc_actions">
                <button className="mc_relay_btn" onClick={doRelay} disabled={relaying || phase.name === "closing" || !steer.trim()}>
                  {relaying ? "relaying…" : "send (⌘↵)"}
                </button>
                <div className="mc_close_group">
                  <input
                    className="mc_close_reason"
                    placeholder="closing note (reaches each reflection)"
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    disabled={phase.name === "closing"}
                  />
                  <button className="mc_end_btn" onClick={doClose} disabled={phase.name === "closing"}>
                    {phase.name === "closing" ? "closing…" : "end the meet"}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {/* --------------------------------------------------- closed */}
        {phase.name === "closed" ? (
          <div className="mc_setup">
            <p className="mc_intro">{phase.note}</p>
            <div className="mc_closed_actions">
              {onReadMeet ? (
                <button className="mc_open_btn" onClick={() => onReadMeet(phase.visitId)}>
                  read it as each life remembers it →
                </button>
              ) : null}
              <button className="mc_end_btn" onClick={onClose}>
                done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
