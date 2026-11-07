/**
 * The inspector: click a memory, a standing target, or nothing (the
 * current recall beat) and see the truth at the scrub position — including
 * WHY each memory entered the context (present by right / continuity /
 * matched), the never-decaying use counts, standing feelings with their
 * scars and bonds, and belief revisions.
 */

import React, { useEffect, useMemo, useState } from "react";

import type { BeatState, FoldState, NodeState } from "./stream_fold";
import type { TemporalActivation } from "./temporal_activation";
import { ADMISSION_LABELS } from "./stream_types";
import { shapeLabel } from "./node_label";
import type { VerbatimSource } from "./verbatim_modal";
import { SectionDisclosure } from "./section_disclosure";
import { WorldModelView } from "./world_model_view";
import { EpisodeDetail } from "./episode_view";
import { isDiaryShaped } from "./episode_parse";
import { ClosedNotice, FeelingEventList, Peaks, RecordDetail, StandingDetail, WordsLine } from "./record_detail";
import { Words } from "./verbatim_view";
import { beatTurnWords, recallLine, standingLine } from "./record_detail_parts";

/** Rows listed before "(…) N more" — every one stays one click away. */
const PARTNERS_SHOWN = 8;

/** A list section's head: what it is, and what is inside (DESIGN §12's
 * disclosure, foldable on every width and remembered per viewer, so the
 * key information and facts above stay first). */
function Head({ title, summary }: { title: string; summary: string }): React.ReactElement {
  return (
    <>
      {title}
      <span className="rd_fold_summary"> · {summary}</span>
    </>
  );
}


export interface InspectorProps {
  fold: FoldState;
  /** The decaying activation at the scrub position (two-count model:
   * shown beside the lifetime count so both truths stay visible). */
  temporal?: TemporalActivation;
  scrubSeq: number;
  selectedId: string | null;
  onSelect(id: string | null): void;
  /** Present when the life is served by a gateway (verbatim reads possible). */
  verbatimSource: VerbatimSource | null;
  /** Open the meet reader for a correlated moment (gateway sources only). */
  onOpenMeet?(visitId: string): void;
}

function admissionBadge(admission: string | null): React.ReactElement | null {
  if (!admission) return null;
  return <span className={`ei_badge ei_adm_${admission}`}>{ADMISSION_LABELS[admission] ?? admission}</span>;
}

export { parseVerbatimTurns, splitUnspokenThinking, type VerbatimTurn } from "./verbatim_parse";

/** A record's card, informative first (operator 2026-11-07): what it is
 * and its facts, then its words and the rest one click away
 * (record_detail.tsx; a lived moment: episode_view.tsx; a world model:
 * world_model_view.tsx). */
function NodeCard({
  fold,
  node,
  temporal,
  onSelect,
  verbatimSource,
  onOpenMeet,
}: {
  fold: FoldState;
  node: NodeState;
  temporal?: TemporalActivation;
  onSelect(id: string): void;
  verbatimSource: VerbatimSource | null;
  onOpenMeet?(visitId: string): void;
}): React.ReactElement {
  // The interlocutor(s), reported by the words' reader (dm#54 pt5:
  // "person:admin" belongs in a metadata field, not the scrolling text).
  const [speakers, setSpeakers] = useState<string[]>([]);
  useEffect(() => setSpeakers([]), [node.id]);

  const bornDate = node.born_at ? node.born_at.slice(0, 16).replace("T", " ") : null;

  // `extra`: rows a kind adds first (an episode's moment and lookups).
  const renderFacts = (extra?: React.ReactNode): React.ReactNode => (
      <dl className="ei_facts">
        {extra}
        {speakers.length > 0 ? (
          <>
            <dt>with</dt>
            <dd>
              {speakers.map((s) => (
                <span key={s} className="ei_with_chip">
                  {s}
                </span>
              ))}
            </dd>
          </>
        ) : null}
        <dt>born</dt>
        <dd>
          {bornDate ? `${bornDate} UTC · ` : ""}seq {node.first_seq}
        </dd>
        <dt>used</dt>
        <dd>
          {node.selected_count} time{node.selected_count === 1 ? "" : "s"} (lifetime — never decays)
        </dd>
        {temporal ? (
          <>
            <dt>warm</dt>
            <dd>
              {(temporal.records.get(node.id) ?? 0) > 0.05
                ? `${(temporal.records.get(node.id) ?? 0).toFixed(1)} now (recent selections, decays)`
                : "cold — not recently selected"}
            </dd>
          </>
        ) : null}
        <dt>scope</dt>
        <dd>{node.scope || "—"}</dd>
        <dt>visibility</dt>
        <dd>
          {node.search_state} / {node.prompt_state}
        </dd>
        {node.visit_id ? (
          <>
            <dt>shared moment</dt>
            <dd title="Interaction correlation (item 14): the other participant's home holds ITS OWN record of this moment under the same key — perspectives correlate as data, streams never merge.">
              {node.visit_id}
              {onOpenMeet ? (
                <button className="ei_link ei_meet_btn" onClick={() => onOpenMeet(node.visit_id as string)} title="Read the conversation — every participating life's own perspective, side by side">
                  read the conversation →
                </button>
              ) : null}
            </dd>
          </>
        ) : null}
        {node.token_estimate ? (
          <>
            <dt>size</dt>
            <dd>~{node.token_estimate} tokens</dd>
          </>
        ) : null}
        {node.digest_method ? (
          <>
            <dt>written by</dt>
            <dd title="Digest provenance — who wrote this record's words: mechanical-v1/v2 = the driver's floor (never marker-only), mechanical-flow-v1 = the flow brain's mechanical digest; entity prose carries no method. Mechanical digests are repairable debt (the consent set governs re-digestion).">
              {node.digest_method}
              {node.digest_method.startsWith("mechanical") ? " (mechanical, repairable)" : ""}
            </dd>
          </>
        ) : null}
      </dl>
  );
  const recordFacts = renderFacts();

  // A lived moment reads facts and summary first, then the exchange, then
  // how he got there (operator 2026-11-07). Never for a diary-shaped record:
  // reading one is recorded in his biography.
  const episode = node.kind === "episode" && !node.bookkeeping && !isDiaryShaped(node) && verbatimSource ? verbatimSource : null;
  const worldModel = node.kind === "world_model";

  return (
    <div className="ei_card">
      <div className="ei_kind_row">
        {/* Bookkeeping markers are kind="claim" but NOT identity — the chip
         * must not wear identity gold (engine excludes them from the self). */}
        <span className={`ei_kind ei_kind_${node.diary ? "diary" : node.bookkeeping ? "bookkeeping" : node.kind}`}>
          {node.diary ? "diary" : node.bookkeeping ? `engine act${node.maintenance ? ` · ${node.maintenance}` : ""}` : node.kind}
        </span>
        {admissionBadge(node.last_admission)}
      </div>
      {episode ? (
        <EpisodeDetail node={node} source={episode} renderFacts={renderFacts} onSpeakers={setSpeakers} />
      ) : worldModel ? (
        <>
          <h3 className="ei_title">{shapeLabel(node.title || "") || node.id.slice(0, 24)}</h3>
          {verbatimSource ? <WorldModelView fold={fold} card={node} source={verbatimSource} onSelect={onSelect} /> : null}
          <SectionDisclosure id="wm_record" title="Record details">
            {recordFacts}
          </SectionDisclosure>
        </>
      ) : (
        <RecordDetail fold={fold} node={node} source={verbatimSource} renderFacts={renderFacts} onSelect={onSelect} onSpeakers={setSpeakers} />
      )}
      {episode || worldModel ? <ClosedNotice fold={fold} node={node} onSelect={onSelect} /> : null}
      <RecordTail fold={fold} node={node} onSelect={onSelect} signals={!(node.kind === "dream" && verbatimSource)} />
    </div>
  );
}

/** The rest of a record: feelings about it, what it was used with, the
 * night's signals — each folded. */
function RecordTail({ fold, node, onSelect, signals = true }: { fold: FoldState; node: NodeState; onSelect(id: string): void; signals?: boolean }): React.ReactElement {
  const partners = useMemo(() => {
    const rows: Array<{ id: string; title: string; count: number }> = [];
    for (const e of fold.edges.values()) {
      const other = e.a === node.id ? e.b : e.b === node.id ? e.a : null;
      if (!other) continue;
      const otherNode = fold.nodes.get(other);
      rows.push({ id: other, title: otherNode?.title || other, count: e.count });
    }
    rows.sort((a, b) => b.count - a.count);
    return rows;
  }, [fold, node]);
  const [allPartners, setAllPartners] = useState(false);
  useEffect(() => setAllPartners(false), [node.id]);
  const feeling = useMemo(() => (node.graph_id ? fold.standings.get(node.graph_id) : undefined) ?? fold.standings.get(node.id), [fold, node]);
  return (
    <>
      {feeling ? (
        <SectionDisclosure id="feeling" narrow title={<Head title="How he feels about this" summary={standingLine(feeling)} />}>
          <Peaks standing={feeling} />
          <FeelingEventList events={feeling.events} />
        </SectionDisclosure>
      ) : null}
      {partners.length > 0 ? (
        <SectionDisclosure id="partners" narrow title={<Head title="Used together with" summary={`${partners.length} ${partners.length === 1 ? "memory" : "memories"}`} />}>
          {(allPartners ? partners : partners.slice(0, PARTNERS_SHOWN)).map((p) => (
            <button key={p.id} className="ei_link ei_partner" onClick={() => onSelect(p.id)}>
              <WordsLine text={shapeLabel(p.title) || p.title} />
              <span className="ei_count">×{p.count}</span>
            </button>
          ))}
          {partners.length > PARTNERS_SHOWN ? (
            <button className="wm_more" onClick={() => setAllPartners((v) => !v)}>
              {allPartners ? `show the first ${PARTNERS_SHOWN}` : `(…) ${partners.length - PARTNERS_SHOWN} more`}
            </button>
          ) : null}
        </SectionDisclosure>
      ) : null}
      {signals && node.signals && node.signals.length > 0 ? (
        <SectionDisclosure id="night" narrow className="ei_night" title={<Head title="The night's signals" summary={`${node.signals.length} ${node.signals.length === 1 ? "signal" : "signals"}`} />}>
          <ul className="ei_signals">
            {node.signals.map((s, i) => {
              const tone = String(s.felt?.tone || "");
              const toneClass = tone === "warm" ? "ei_sig_warm" : tone === "sore" ? "ei_sig_sore" : tone === "mixed" ? "ei_sig_mixed" : "";
              return (
                <li key={i} className={`ei_signal ${toneClass}`}>
                  <span className="ei_sig_kind">{String(s.kind || "signal").replace(/_/g, " ")}</span>
                  {s.fragment ? <WordsLine text={s.fragment} className="ei_sig_frag" /> : null}
                  {tone ? <span className="ei_sig_felt">felt {tone}{s.felt?.scarred ? " · a scar stands" : ""}{s.felt?.bonded ? " · a bond stands" : ""}</span> : null}
                </li>
              );
            })}
          </ul>
        </SectionDisclosure>
      ) : null}
    </>
  );
}

// ----------------------------------------------------------- a recall

const ADMISSION_ORDER = ["self", "stm", "both", "stimulus"];

function RecallDetail({ fold, beat, onSelect }: { fold: FoldState; beat: BeatState; onSelect(id: string): void }): React.ReactElement {
  const groups = useMemo(() => {
    const byLabel: Record<string, string[]> = {};
    for (const [rid, label] of Object.entries(beat.admissions)) (byLabel[label] ??= []).push(rid);
    return byLabel;
  }, [beat]);
  const turn = beatTurnWords(beat.turn_id);
  const rowTitle = (rid: string) => {
    const node = fold.nodes.get(rid);
    return node?.redacted ? "a diary entry (private)" : node?.title || rid;
  };
  return (
    <div className="ei_card">
      <div className="ei_kind_row">
        <span className="ei_kind ei_kind_beat">recall</span>
      </div>
      <h3 className="ei_title">What came to mind</h3>
      <p className="rd_kind">A recall — the memories his mind reached for at one moment</p>
      <div className="rd_key">
        <p className="rd_key_line">{recallLine(beat)}</p>
        {beat.cue_text ? (
          <div className="rd_cue">
            <span className="rd_cue_label">What it was for</span>
            <Words text={beat.cue_text} className="ev_markdown rd_summary" />
          </div>
        ) : (
          <p className="rd_note">The self read: no words prompted it.</p>
        )}
      </div>
      <dl className="ei_facts">
        <dt>considered</dt>
        <dd>{beat.candidate_count}</dd>
        <dt>came to mind</dt>
        <dd>{beat.selected.length}</dd>
        <dt>entered context</dt>
        <dd>{beat.committed ? `${beat.used_record_ids.length}${beat.prompt_token_estimate ? ` (~${beat.prompt_token_estimate} tokens)` : ""}` : "not recorded"}</dd>
        {turn ? (
          <>
            <dt>when</dt>
            <dd>{turn}</dd>
          </>
        ) : null}
      </dl>
      {ADMISSION_ORDER.map((label) => {
        const ids = groups[label];
        if (!ids || ids.length === 0) return null;
        return (
          <SectionDisclosure key={label} id={`admission:${label}`} narrow headClassName={`ei_adm_head ei_adm_${label}`} title={<Head title={ADMISSION_LABELS[label] ?? label} summary={`${ids.length} ${ids.length === 1 ? "memory" : "memories"}`} />}>
            {ids.map((rid) => (
              <button key={rid} className="ei_link rd_row_link" onClick={() => onSelect(rid)}>
                <WordsLine text={shapeLabel(rowTitle(rid)) || rowTitle(rid)} />
              </button>
            ))}
          </SectionDisclosure>
        );
      })}
      {beat.dropped.length > 0 ? (
        <SectionDisclosure id="dropped" narrow title={<Head title="Considered but left out" summary={`${beat.dropped.length} ${beat.dropped.length === 1 ? "memory" : "memories"}`} />}>
          {beat.dropped.map((d, i) => (
            <div key={`${d.record_id}-${i}`} className="ei_dropped">
              <WordsLine text={shapeLabel(rowTitle(d.record_id)) || rowTitle(d.record_id)} />
              <span className="ei_reason">{d.reason ? String(d.reason).replace(/_/g, " ") : ""}</span>
            </div>
          ))}
        </SectionDisclosure>
      ) : null}
    </div>
  );
}

export function Inspector({ fold, temporal, scrubSeq, selectedId, onSelect, verbatimSource, onOpenMeet }: InspectorProps): React.ReactElement {
  // An ordinary record's words are read with the card (a pure read); a
  // diary entry's only on the operator's click, which lands as a visible
  // diary_read moment in his biography on its FIRST read (the text cache
  // serves later reads without touching the door).
  const content = useMemo(() => {
    if (selectedId?.startsWith("beat:")) {
      // A ledger recall line: what came to mind at that moment.
      const beat = fold.beats.get(selectedId.slice("beat:".length));
      if (beat) return <RecallDetail fold={fold} beat={beat} onSelect={onSelect} />;
    } else if (selectedId?.startsWith("standing:")) {
      const standing = fold.standings.get(selectedId.slice("standing:".length));
      if (standing) return <StandingDetail fold={fold} standing={standing} onSelect={onSelect} />;
    } else if (selectedId) {
      const node = fold.nodes.get(selectedId) ?? fold.nodes.get(fold.graph_to_row.get(selectedId) ?? "");
      if (node) return <NodeCard fold={fold} node={node} temporal={temporal} onSelect={onSelect} verbatimSource={verbatimSource} onOpenMeet={onOpenMeet} />;
      const standing = fold.standings.get(selectedId);
      if (standing) return <StandingDetail fold={fold} standing={standing} onSelect={onSelect} />;
    }
    // No selection: show the beat active at the scrub position.
    let active: BeatState | null = null;
    for (const tid of fold.beat_order) {
      const beat = fold.beats.get(tid);
      if (beat && beat.first_seq <= scrubSeq) active = beat;
    }
    if (active) return <RecallDetail fold={fold} beat={active} onSelect={onSelect} />;
    return <div className="ei_empty">Click a memory in the graph, or scrub to a recall.</div>;
  }, [fold, temporal, scrubSeq, selectedId, onSelect, verbatimSource, onOpenMeet]);

  return (
    <div className="entity_inspector">
      {selectedId ? (
        <div className="ei_head">
          <button className="ei_clear" onClick={() => onSelect(null)}>
            ← current recall
          </button>
        </div>
      ) : null}
      {content}
    </div>
  );
}
