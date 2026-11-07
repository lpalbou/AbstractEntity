/**
 * A dream, told by what it touched (operator 2026-11-07: the dream text "is
 * more a broadcast that something happened rather than describing what
 * happened, what tension arose, how it evolved, how it changed the
 * understanding").
 *
 * The dream's own words are the sleep pass's mechanical summary, quoting
 * titles cut short. Its signals name the exact records they touched
 * (memory's wave-5 night telemetry), so the card shows those instead:
 *   - a changed understanding: the card, and the memories that are new in
 *     this version of it (derived_from minus the card it refines), in full;
 *   - an open tension: the memories the night set side by side, in full;
 *   - anything else: what it touched, in full.
 * The summary stays one fold away.
 */

import React, { useMemo } from "react";

import type { DreamSignal, FoldState, NodeState } from "./stream_fold";
import type { VerbatimSource } from "./verbatim_modal";
import { MemoryRows, selectCardSources, sourcesFromIds, type CardSource } from "./world_model_sources";

/** A card's change: the card it refines and the memories new in this one. */
export function cardChange(fold: FoldState, cardGraphId: string): { card: NodeState | null; prior: NodeState | null; added: CardSource[]; all: CardSource[] } {
  const row = (gid: string) => fold.nodes.get(fold.graph_to_row.get(gid) ?? gid) ?? null;
  const card = row(cardGraphId);
  if (!card) return { card: null, prior: null, added: [], all: [] };
  let prior: NodeState | null = null;
  for (const e of fold.structural_edges.values()) {
    if (e.relation === "refines" && e.source_graph_id === cardGraphId) {
      prior = row(e.target_graph_id);
      break;
    }
  }
  const all = selectCardSources(fold, card);
  if (!prior) return { card, prior: null, added: all, all };
  const before = new Set(selectCardSources(fold, prior).map((s) => s.graphId));
  return { card, prior, added: all.filter((s) => !before.has(s.graphId)), all };
}

function cardName(node: NodeState | null, fallback: string): string {
  const t = String(node?.title || "").replace(/^World model:\s*/i, "").trim();
  return t || fallback;
}

const TONE_WORDS: Record<string, string> = { warm: "felt warm", sore: "felt sore", mixed: "felt mixed" };

export function DreamDetail({ fold, dream, source, onSelect }: { fold: FoldState; dream: NodeState; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement | null {
  const signals = dream.signals ?? [];
  // Only a card formed or revised is a change of understanding with a card
  // behind it; memory also tags groupings and minted candidates with this
  // kind (abstractmemory dream_signals) — those are shown as what they did.
  const isCardChange = (s: DreamSignal) => s.kind === "changed_understanding" && (s.act === "card_formed" || s.act === "card_revised");
  const changes = signals.filter(isCardChange);
  const tensions = signals.filter((s) => s.kind === "unresolved_tension");
  const others = signals.filter((s) => !isCardChange(s) && s.kind !== "unresolved_tension");
  if (signals.length === 0) return null;
  return (
    <div className="dr_detail">
      {changes.length > 0 ? (
        <section className="dr_section">
          <h4 className="dr_head">How his understanding changed</h4>
          {changes.flatMap((s, i) => (s.touched ?? []).map((gid) => <CardChangeBlock key={`${i}-${gid}`} fold={fold} cardGraphId={gid} signal={s} source={source} onSelect={onSelect} />))}
        </section>
      ) : null}
      {tensions.length > 0 ? (
        <section className="dr_section">
          <h4 className="dr_head">What the night set side by side</h4>
          <p className="dr_note">Memories the night found alike and left open — not confirmed; waking evidence decides.</p>
          {tensions.map((s, i) => (
            <SignalBlock key={i} fold={fold} signal={s} label={`Tension ${i + 1}`} source={source} onSelect={onSelect} />
          ))}
        </section>
      ) : null}
      {others.length > 0 ? (
        <section className="dr_section">
          <h4 className="dr_head">What else the night moved</h4>
          {others.map((s, i) => (
            <SignalBlock key={i} fold={fold} signal={s} label={String(s.act || s.kind || "moved").replace(/_/g, " ")} source={source} onSelect={onSelect} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function CardChangeBlock({ fold, cardGraphId, signal, source, onSelect }: { fold: FoldState; cardGraphId: string; signal: DreamSignal; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement {
  const change = useMemo(() => cardChange(fold, cardGraphId), [fold, cardGraphId]);
  const name = cardName(change.card, cardGraphId);
  const formed = signal.act === "card_formed" || !change.prior;
  return (
    <div className="dr_block">
      <div className="dr_block_head">
        <span>
          What he knows of <strong>{name}</strong> {formed ? "took shape" : "deepened"}
          {change.card ? ` — now ${change.all.length} ${change.all.length === 1 ? "memory" : "memories"} behind it` : ""}
        </span>
        {change.card ? (
          <button className="wm_open" onClick={() => onSelect(change.card!.id)}>
            open the card →
          </button>
        ) : null}
      </div>
      <SignalNote signal={signal} />
      {change.card ? (
        <>
          <p className="dr_note">{formed ? "Formed from:" : change.added.length > 0 ? "New since his last understanding:" : "No new memory; the evidence was revised."}</p>
          {change.added.length > 0 ? <MemoryRows items={change.added} source={source} onSelect={onSelect} /> : null}
        </>
      ) : (
        <p className="dr_note">This card is not in the current view (scrub forward or reload to see it).</p>
      )}
    </div>
  );
}

function SignalBlock({ fold, signal, label, source, onSelect }: { fold: FoldState; signal: DreamSignal; label: string; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement {
  const items = useMemo(() => sourcesFromIds(fold, signal.touched ?? []), [fold, signal]);
  return (
    <div className="dr_block">
      <div className="dr_block_head">
        <span className="dr_label">{label}</span>
      </div>
      <SignalNote signal={signal} />
      {items.length > 0 ? <MemoryRows items={items} source={source} onSelect={onSelect} /> : null}
    </div>
  );
}

/** What the night said about this signal, and how it felt — as memory
 * wrote it (its note is cut at 200 characters by the sleep pass; when it
 * was, that is said, and the memories below carry the full words). */
function SignalNote({ signal }: { signal: DreamSignal }): React.ReactElement | null {
  const felt = signal.felt;
  const tone = felt?.tone ? TONE_WORDS[String(felt.tone)] ?? `felt ${felt.tone}` : null;
  const marks = [typeof felt?.weight === "number" ? `weight ${felt.weight}` : null, felt?.scarred ? "a scar stands" : null, felt?.bonded ? "a bond stands" : null].filter(Boolean);
  const cut = (signal as DreamSignal & { fragment_truncation?: { kept?: number; of?: number } }).fragment_truncation;
  if (!signal.fragment && !tone) return null;
  return (
    <p className="dr_signal_note">
      {signal.fragment ? <span className="dr_fragment">{signal.fragment}</span> : null}
      {cut ? <span className="dr_cut"> (the sleep pass cut this note at {cut.kept} of {cut.of} characters; the memories below are complete)</span> : null}
      {tone ? (
        <span className="dr_tone">
          {" "}
          · {tone}
          {marks.length ? ` (${marks.join(", ")})` : ""}
        </span>
      ) : null}
    </p>
  );
}
