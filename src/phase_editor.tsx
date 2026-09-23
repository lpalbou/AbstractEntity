/**
 * THE PHASE-GRAPH EDITOR (structural-edit build c4837, entity half —
 * laurent dm#276: "create/remove/redirect edges between states + per-edge
 * instructions, actually governing behavior").
 *
 * Design law, from the two adversary reports + the build order:
 * - EVERY row carries its three-tier honesty label (enforced / steering /
 *   fact-or-act / proposed) derived from the ARTIFACT's per-edge law —
 *   the 12 door/operator rows SAY "editing this changes nothing" rather
 *   than render a fake lever (the fabricated-selection boundary).
 * - The edit set is a WHOLESALE document (c4934): stored ops load from
 *   the GET, edits fold into the full desired list, save PUTs the whole
 *   thing under CAS. Refusals render VERBATIM (served code + message).
 * - Locked rows render locked WITH THEIR RULING; the door stays the law
 *   (client checks are courtesy, never authority).
 * - A LIST, not a canvas: 22 cause-labeled edges over 4 nodes is a
 *   multigraph that generic layout renders as spaghetti (observer's
 *   chair evidence); the readable form is rows grouped by from-phase.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";

import graphSpec from "../spec/entity_phases.json";
import {
  addPreviewRefusal,
  composeOps,
  edgeId,
  foldRows,
  honestyLabel,
  localRefusal,
  type RowState,
  type SpecTransition,
} from "./edge_ops";
import { PhaseMap } from "./phase_map";
import { getPhaseSpec, putPhaseSpecGraph, type EdgeOp, type PhaseSpecServed } from "./stream_source";

const TIER_CHIP: Record<string, { label: string; cls: string }> = {
  enforced: { label: "enforced", cls: "pe_tier_enforced" },
  fact: { label: "door fact", cls: "pe_tier_fact" },
  act: { label: "operator act", cls: "pe_tier_act" },
  election: { label: "his election", cls: "pe_tier_election" },
  proposed: { label: "proposed", cls: "pe_state_added" },
};

function stateChip(state: RowState): { label: string; cls: string } | null {
  if (state.kind === "removed") return { label: "removed (staged law)", cls: "pe_state_removed" };
  if (state.kind === "redirected") return { label: `redirected → ${state.to}`, cls: "pe_state_redirected" };
  if (state.kind === "added") return { label: "added — PROPOSED until the interpreter consult confirms", cls: "pe_state_added" };
  return null;
}

export function PhaseGraphEditor({ baseUrl, token }: { baseUrl: string; token: string | null }): React.ReactElement {
  const [served, setServed] = useState<PhaseSpecServed | null>(null);
  const [laneAbsent, setLaneAbsent] = useState(false);
  const [rows, setRows] = useState<Array<{ t: SpecTransition; state: RowState; rowKey: string }>>([]);
  const [orphans, setOrphans] = useState<EdgeOp[]>([]);
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState("");
  const [redirectInstruction, setRedirectInstruction] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState({ from: "personal", to: "work", cause: "", instruction: "", bound_h: "" });

  const phases = useMemo(() => Object.keys((served?.spec as { phases?: Record<string, unknown> } | undefined)?.phases ?? graphSpec.phases), [served]);
  const registry = useMemo(
    () =>
      ((served?.spec as Record<string, unknown> | undefined)?.cause_evaluators ??
        (graphSpec as unknown as Record<string, unknown>).cause_evaluators) as Record<string, { status?: string }>,
    [served],
  );

  const load = useCallback(() => {
    getPhaseSpec(baseUrl)
      .then((s) => {
        setServed(s);
        // The structural-edit lane exists when the GET carries the graph
        // overlay wire (even empty). Absent = pre-lane gateway: render
        // the law read-only with an honest absence line, never fake ops.
        const laneServed = s.graph_overlay !== undefined || s.effective_transitions !== undefined;
        setLaneAbsent(!laneServed);
        const stored = s.graph_overlay?.edge_ops ?? [];
        const spec = (s.spec as { transitions?: SpecTransition[] } | undefined)?.transitions ?? (graphSpec.transitions as unknown as SpecTransition[]);
        const folded = foldRows(spec, stored);
        setRows(folded.rows.map((r, i) => ({ ...r, rowKey: `${edgeId(r.t)}~${i}` })));
        setOrphans(folded.orphans);
        setDirty(false);
        setError(null);
      })
      .catch((e: Error & { status?: number }) => {
        setServed(null);
        setLaneAbsent(true);
        const folded = foldRows(graphSpec.transitions as unknown as SpecTransition[], []);
        setRows(folded.rows.map((r, i) => ({ ...r, rowKey: `${edgeId(r.t)}~${i}` })));
        setError(e.status === 404 ? null : `Blueprint read failed: ${e.message}`);
      });
  }, [baseUrl]);
  useEffect(() => load(), [load]);

  // Staged law edits are the worst thing this page can silently lose —
  // guard tab-close/navigation while dirty (UX pass P1-10).
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  // P0-1 (editor adversary): mutate by ROW identity, never by edge-id
  // string — two rows can legally share an edge id mid-edit and an
  // id-keyed undo corrupted both (phantom base row wearing the enforced
  // label, duplicate ops, duplicate React keys).
  const mutate = (rowKey: string, next: RowState | null) => {
    setRows((prev) => (next === null ? prev.filter((r) => r.rowKey !== rowKey) : prev.map((r) => (r.rowKey === rowKey ? { ...r, state: next } : r))));
    setDirty(true);
    setNote(null);
  };

  const save = () => {
    if (busy || !dirty) return;
    setBusy(true);
    setNote(null);
    setError(null);
    // P1-7: orphan ops RIDE — the door rules on them (a client-side
    // orphan verdict is a guess against possibly-newer server law; acting
    // on it destructively is the class rule 3 forbids). Discarding them
    // is the operator's explicit button, never a side effect of saving.
    const ops = [...composeOps(rows), ...orphans];
    putPhaseSpecGraph(baseUrl, ops, reason, token, served?.overlay?.edit_seq ?? null)
      .then((r) => {
        const seq = r.overlay?.edit_seq ?? null;
        setNote(
          `Saved — the structural overlay landed${seq != null ? ` (edit ${seq})` : ""}. Loops read the new law at their next boundary; the edit is a visible moment in every entity's biography.`,
        );
        setReason("");
        load();
      })
      .catch((e: Error & { status?: number }) => {
        if (e.status === 409) {
          // P1-6: the sibling dials panel shares this overlay's edit_seq,
          // so a 409 here is DETERMINISTIC after any dials save. Staged
          // intent survives: re-fold the just-composed ops over the
          // freshly served base instead of wiping the composition.
          getPhaseSpec(baseUrl)
            .then((fresh) => {
              setServed(fresh);
              const spec = (fresh.spec as { transitions?: SpecTransition[] } | undefined)?.transitions ?? (graphSpec.transitions as unknown as SpecTransition[]);
              const refolded = foldRows(spec, ops);
              setRows(refolded.rows.map((r, i) => ({ ...r, rowKey: `${edgeId(r.t)}~${i}` })));
              setOrphans(refolded.orphans);
              setDirty(true);
              setError("Another edit landed while you were editing (likely the dials) — your staged changes were re-applied over the current law; review and save again.");
            })
            .catch(() => {
              setError("Another edit landed and the reload failed — your staged changes are shown as-is; save again when the gateway answers.");
            });
          return;
        }
        // Served refusals render VERBATIM (code + message ride e.message
        // via putJson's detail fold) — never a client paraphrase.
        setError(`The write door refused (HTTP ${e.status ?? "?"}): ${e.message || "no reason served"}`);
      })
      .finally(() => setBusy(false));
  };

  const grouped = useMemo(() => {
    const by = new Map<string, Array<{ t: SpecTransition; state: RowState; rowKey: string }>>();
    for (const r of rows) {
      const k = r.t.from;
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(r);
    }
    return by;
  }, [rows]);

  // Staged-removed rows COUNT as existing for the add preview — the door
  // refuses remove+add of one identity (policy-downgrade class).
  const existingIds = useMemo(() => new Set(rows.map((r) => edgeId(r.t))), [rows]);
  const draftParsed = {
    from: draft.from,
    to: draft.to,
    cause: draft.cause.trim(),
    instruction: draft.instruction.trim() || undefined,
    bound_h: draft.bound_h.trim() ? Number(draft.bound_h) : undefined,
  };
  const addRefusal = showAdd && draftParsed.cause ? addPreviewRefusal(phases, registry, existingIds, draftParsed) : null;

  return (
    <div className="pe_editor">
      <PhaseMap
        rows={rows}
        selected={selected}
        hint={laneAbsent ? "drag to pan · ⌘/ctrl+wheel to zoom · click an edge to read its law below" : "drag to pan · ⌘/ctrl+wheel to zoom · click an edge to edit it below"}
        onSelect={(rowKey) => {
          setSelected(rowKey);
          if (rowKey) {
            // The graph and the rows are ONE surface: clicking an edge
            // brings its editable row into view.
            window.setTimeout(() => document.getElementById(`pe-row-${CSS.escape(rowKey)}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
          }
        }}
        onSelectPhase={(phase) => {
          document.getElementById(`pe-group-${phase}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      <div className="bp_tun_head">
        <h3>Structure — the transitions{laneAbsent ? " (read-only on this gateway)" : ", editable"}</h3>
        <span className="bp_tun_rev" title="Structural edits ride the same operator overlay as the dials: one edit_seq, CAS, recorded markers. The graph document is wholesale — save writes the full desired op set. This badge reflects the SERVED overlay; staged-unsaved work shows in the save bar.">
          {(served?.graph_overlay?.edge_ops?.length ?? 0) > 0 ? "modulated structure" : "base law"}
        </span>
      </div>
      <p className="wsp_quiet">
        Create, remove or redirect transitions; attach a standing instruction (steering) or a typed bound. Every row says what editing it
        DOES: <span className="pe_tier_enforced pe_chip_demo">enforced</span> rows are consulted by the machine at its decision boundaries;{" "}
        <span className="pe_tier_fact pe_chip_demo">door facts / operator acts</span> cannot be changed here — editing them changes nothing, and the door
        refuses naming the ruling; <span className="pe_tier_election pe_chip_demo">his election</span> is the entity&apos;s ruled right. Instruction prose is{" "}
        <strong>steering</strong> — usually followed, never guaranteed; hard numbers ride the typed bound and are enforced.
      </p>
      {laneAbsent ? (
        <p className="bp_editable_note">This gateway does not serve structural editing yet — the law below is READ-ONLY until its next deploy; the graph, chips and rulings are live.</p>
      ) : null}
      {error ? <p className="wsp_error">{error}</p> : null}
      {note ? <p className="bp_tun_note">{note}</p> : null}
      {orphans.length > 0 ? (
        <p className="wsp_error">
          {orphans.length} stored op(s) do not match the structural law this client sees (a re-vendor may have moved beneath them). They RIDE
          along on save — the door rules on them.{" "}
          <button
            className="eix_refresh pe_btn"
            onClick={() => {
              setOrphans([]);
              setDirty(true);
              setNote(null);
            }}
          >
            discard stale ops
          </button>
        </p>
      ) : null}

      {[...grouped.entries()].map(([from, group]) => (
        <div key={from} className="pe_group" id={`pe-group-${from}`}>
          <h4 className="pe_group_head">from {from}</h4>
          {group.map(({ t, state, rowKey }) => {
            const id = edgeId(t);
            const label = state.kind === "added" ? { tier: "proposed" as const, text: honestyLabel(t).text } : honestyLabel(t);
            const chip = TIER_CHIP[label.tier] ?? TIER_CHIP.enforced;
            const sChip = stateChip(state);
            const removeRefusal = localRefusal(t, "remove");
            const redirectRefusal = localRefusal(t, "redirect");
            const editable = !laneAbsent && state.kind !== "added";
            return (
              <div
                key={rowKey}
                id={`pe-row-${rowKey}`}
                className={`pe_row ${state.kind !== "base" ? "pe_row_touched" : ""} ${selected === rowKey ? "pe_row_selected" : ""}`}
                onClick={() => setSelected(rowKey)}
              >
                <div className="pe_row_main">
                  <code className="pe_edge">{t.from} → {state.kind === "redirected" ? <s>{t.to}</s> : t.to}{state.kind === "redirected" ? ` ${state.to}` : ""} <span className="pe_cause">#{t.cause}</span></code>
                  <span className={`pe_chip ${chip.cls}`} title={label.text}>{chip.label}</span>
                  {t.guards && t.guards.length > 0 ? (
                    <span className="pe_guards" title="Machine-readable preconditions — they TRAVEL with any redirect (guard-erasure refuses; collisions union both sets, v21 law).">
                      ⛓ {t.guards.join(" · ")}
                    </span>
                  ) : null}
                  {sChip ? <span className={`pe_chip ${sChip.cls}`}>{sChip.label}</span> : null}
                </div>
                {(state.kind === "redirected" || state.kind === "added") && (state.instruction || state.bound_h != null) ? (
                  <p className="pe_instruction" title="Steering — injected as a labeled cue at transition time; usually followed, never guaranteed. The typed bound is enforced.">
                    {state.instruction ? <>🗒 “{state.instruction}”</> : null} {state.bound_h != null ? <em>bound {state.bound_h}h</em> : null}
                  </p>
                ) : null}
                {!editable && state.kind === "base" && removeRefusal !== null && redirectRefusal !== null ? (
                  <div className="pe_row_actions">
                    <span className="pe_locked_note">🔒 {removeRefusal}</span>
                  </div>
                ) : null}
                {editable ? (
                  <div className="pe_row_actions">
                    {state.kind === "base" ? (
                      removeRefusal !== null && redirectRefusal !== null ? (
                        // P2-9: a refusal on a disabled button's tooltip is
                        // invisible to keyboard/touch — locked rows say it
                        // in text.
                        <span className="pe_locked_note">🔒 {removeRefusal}</span>
                      ) : (
                      <>
                        <button
                          className="eix_refresh pe_btn"
                          disabled={removeRefusal !== null}
                          title={removeRefusal ?? "Stage removal — the machine stops taking this transition at its next boundary read."}
                          onClick={() => mutate(rowKey, { kind: "removed" })}
                        >
                          remove
                        </button>
                        <button
                          className="eix_refresh pe_btn"
                          disabled={redirectRefusal !== null}
                          title={redirectRefusal ?? "Stage a redirect — the arrow keeps its cause and guards, lands elsewhere."}
                          onClick={() => {
                            setRedirecting(redirecting === id ? null : id);
                            setRedirectTo("");
                            setRedirectInstruction("");
                          }}
                        >
                          redirect…
                        </button>
                      </>
                      )
                    ) : (
                      <button className="eix_refresh pe_btn" onClick={() => mutate(rowKey, { kind: "base" })}>
                        undo
                      </button>
                    )}
                    {redirecting === id ? (
                      <span className="pe_redirect_form">
                        →{" "}
                        <select value={redirectTo} onChange={(e) => setRedirectTo(e.target.value)}>
                          <option value="">target…</option>
                          {phases
                            .filter((p) => p !== "visit" && p !== t.to && p !== t.from)
                            .map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                        <input
                          placeholder="standing instruction (steering, optional, ≤400)"
                          maxLength={400}
                          value={redirectInstruction}
                          onChange={(e) => setRedirectInstruction(e.target.value)}
                        />
                        <button
                          className="eix_refresh pe_btn"
                          disabled={!redirectTo}
                          onClick={() => {
                            mutate(rowKey, { kind: "redirected", to: redirectTo, instruction: redirectInstruction.trim() || undefined });
                            setRedirecting(null);
                          }}
                        >
                          stage
                        </button>
                      </span>
                    ) : null}
                  </div>
                ) : state.kind === "added" && !laneAbsent ? (
                  <div className="pe_row_actions">
                    <button className="eix_refresh pe_btn" onClick={() => mutate(rowKey, null)}>undo</button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      {!laneAbsent ? (
        <div className="pe_add">
          {showAdd ? (
            <div className="pe_add_form">
              <select value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })}>
                {phases.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              →
              <select value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })}>
                {phases.filter((p) => p !== "visit").map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select value={draft.cause} onChange={(e) => setDraft({ ...draft, cause: e.target.value })}>
                <option value="">cause…</option>
                {Object.entries(registry)
                  .filter(([k, v]) => !k.startsWith("$") && v && typeof v === "object")
                  .map(([k, v]) => (
                    <option key={k} value={k} disabled={v.status === "reserved"}>
                      {k}
                      {v.status === "reserved" ? " (reserved — evaluator not built)" : ""}
                    </option>
                  ))}
              </select>
              <input
                placeholder="standing instruction (steering, optional, ≤400)"
                maxLength={400}
                value={draft.instruction}
                onChange={(e) => setDraft({ ...draft, instruction: e.target.value })}
              />
              <input className="pe_bound" placeholder="bound h" value={draft.bound_h} onChange={(e) => setDraft({ ...draft, bound_h: e.target.value })} />
              <button
                className="eix_refresh pe_btn"
                disabled={!draftParsed.cause || addRefusal !== null}
                title={addRefusal ?? "Stage the new transition — PROPOSED until the machine's consult confirms it fires."}
                onClick={() => {
                  setRows((prev) => [
                    ...prev,
                    {
                      t: { from: draftParsed.from, to: draftParsed.to, cause: draftParsed.cause, edge_id: edgeId(draftParsed) },
                      state: { kind: "added", instruction: draftParsed.instruction, bound_h: draftParsed.bound_h },
                      rowKey: `${edgeId(draftParsed)}~add~${Date.now()}`,
                    },
                  ]);
                  setDirty(true);
                  setShowAdd(false);
                  setDraft({ from: "personal", to: "work", cause: "", instruction: "", bound_h: "" });
                }}
              >
                stage add
              </button>
              <button className="eix_refresh pe_btn" onClick={() => setShowAdd(false)}>cancel</button>
              {addRefusal ? <p className="wsp_error pe_add_refusal">{addRefusal}</p> : null}
            </div>
          ) : (
            <button className="eix_refresh pe_btn" onClick={() => setShowAdd(true)}>＋ add transition</button>
          )}
        </div>
      ) : null}

      {!laneAbsent ? (
        <div className={`bp_tun_save ${dirty ? "pe_save_sticky" : ""}`}>
          {dirty ? (
            <span className="pe_staged_count">
              {rows.filter((r) => r.state.kind !== "base").length} staged change(s) — unsaved
            </span>
          ) : null}
          <input
            className="bp_tun_reason"
            placeholder="why (rides the recorded act — optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="eix_refresh"
            disabled={busy || !dirty}
            onClick={save}
            title="Write the full structural op set through the gateway's door — validated against the artifact's law, recorded as a visible moment."
          >
            {busy ? "writing…" : "save structure"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
