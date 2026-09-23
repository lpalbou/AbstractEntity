/**
 * The inspector: click a memory, a standing target, or nothing (the
 * current recall beat) and see the truth at the scrub position — including
 * WHY each memory entered the context (present by right / continuity /
 * matched), the never-decaying use counts, standing feelings with their
 * scars and bonds, and belief revisions.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import type { BeatState, FeelingEvent, FoldState, NodeState, StandingState } from "./stream_fold";
import type { TemporalActivation } from "./temporal_activation";
import { ADMISSION_LABELS } from "./stream_types";
import { fetchDiaryEntry, fetchRecordVerbatim } from "./stream_source";
import { shapeLabel } from "./node_label";
import { getCachedText, putCachedText, textCacheKey } from "./text_cache";
import type { VerbatimSource } from "./verbatim_modal";

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

/** The full feeling history (maintainer round 2 item 2): every valence
 * event with sign, magnitude, reason, and time — expandable, collapsed by
 * default to the summary chips. */
function FeelingEvents({ events }: { events: FeelingEvent[] }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  if (events.length === 0) return null;
  return (
    <div className="ei_feelings">
      <button className="ei_link" onClick={() => setOpen((v) => !v)}>
        {open ? "hide" : "show"} all {events.length} feeling event{events.length === 1 ? "" : "s"}
      </button>
      {open ? (
        <div className="ei_feeling_list">
          {[...events].reverse().map((ev, i) => (
            <div key={`${ev.seq}-${i}`} className="ei_feeling_row">
              <span className={`ei_feeling_sign ${ev.sign >= 0 ? "ei_feeling_pos" : "ei_feeling_neg"}`}>
                {ev.kind === "appraisal" ? `${ev.sign >= 0 ? "+" : "−"}${ev.magnitude}` : ev.kind}
              </span>
              <span className="ei_feeling_body">
                {ev.reason || "no reason recorded"}
                <span className="ei_feeling_when">
                  seq {ev.seq}
                  {ev.observed_at ? ` · ${ev.observed_at.slice(5, 16).replace("T", " ")}` : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The verbatim INLINE in the Detail tab (operator dm#28: "directly put
 * the verbatim of the node… remove the unnecessary button"). Texts go
 * through the shared text cache (immutable book entries / write-once
 * artifacts): a diary entry marks the biography ON ITS FIRST read only —
 * cache hits never touch the door (the read-flood lesson). Honest states:
 * loading, the text, born-digest notes, or the reason there is none. */
/** One speaker turn inside an exchange verbatim. */
export interface VerbatimTurn {
  speaker: string;
  text: string;
}

/** Parse an exchange verbatim ("person:admin:\n…\n\nEphemeral:\n…") into
 * labeled turns. STRICT speaker recognition (laurent dm#54 pt5: the
 * interlocutor belongs in metadata, not scrolling text): a line is a
 * speaker head only when the WHOLE line is `X:` where X is a namespaced
 * identity (person:/entity:/agent:…), the entity's own name
 * (case-insensitive), or the door — prose headers like "Note:" never
 * split. Returns null when the text doesn't open with a speaker head
 * (diary entries, born-digest words): the caller renders plain text. */
/** The semantics-blessed inner-speech section marker (framework c3313/
 * c3318): runtime appends "(thinking, unspoken)" to the turn verbatim at
 * the three formation sites, byte-identical forever. Split the spoken
 * verbatim from his unspoken reasoning so the render treats them
 * distinctly — say-vs-think honesty: his private reasoning must never read
 * as something he said aloud. Absent marker = no thinking section (pre-ship
 * verbatims and substrates that return no reasoning pass through whole). */
const UNSPOKEN_MARKER = "(thinking, unspoken)";

export function splitUnspokenThinking(raw: string): { spoken: string; thinking: string | null } {
  const text = String(raw || "");
  // The marker sits on its own line (a labeled section head). Match at a
  // line boundary so the literal string inside prose never false-splits.
  const idx = text.search(/(^|\n)\s*\(thinking, unspoken\)\s*(\n|$)/);
  if (idx < 0) return { spoken: text, thinking: null };
  const markerStart = text.indexOf(UNSPOKEN_MARKER, idx);
  const spoken = text.slice(0, markerStart).replace(/\n+$/, "");
  const thinking = text.slice(markerStart + UNSPOKEN_MARKER.length).replace(/^\n+/, "").trim();
  return { spoken, thinking: thinking || null };
}

export function parseVerbatimTurns(raw: string, entityName: string): VerbatimTurn[] | null {
  const lines = String(raw || "").split("\n");
  const name = entityName.trim().toLowerCase();
  const isSpeakerHead = (line: string): string | null => {
    const m = line.match(/^(\S+|\S+ \(while looking things up\)|\(the door\)):\s*$/);
    if (!m) return null;
    const head = m[1];
    const bare = head.replace(/ \(while looking things up\)$/, "");
    if (/^[a-z0-9_-]+:[\w.@-]+$/i.test(bare)) return head; // namespaced identity
    if (bare.toLowerCase() === name) return head; // the entity itself
    if (bare === "(the door)") return head;
    return null;
  };
  const turns: VerbatimTurn[] = [];
  let current: VerbatimTurn | null = null;
  for (let i = 0; i < lines.length; i++) {
    const head = isSpeakerHead(lines[i]);
    // A head mid-text only counts at a paragraph boundary (prev empty).
    if (head && (current === null || i === 0 || lines[i - 1].trim() === "")) {
      if (current) turns.push({ ...current, text: current.text.trim() });
      current = { speaker: head, text: "" };
      continue;
    }
    if (current === null) {
      if (lines[i].trim()) return null; // words before any speaker → not an exchange
      continue;
    }
    current.text += (current.text ? "\n" : "") + lines[i];
  }
  if (current) turns.push({ ...current, text: current.text.trim() });
  return turns.length > 0 ? turns : null;
}

function InlineVerbatim({
  node,
  source,
  onSpeakers,
}: {
  node: NodeState;
  source: VerbatimSource;
  /** Reports the exchange's OTHER participants up to the card's metadata
   * panel (dm#54 pt5) — fires once per fetch. */
  onSpeakers?(speakers: string[]): void;
}): React.ReactElement {
  const [state, setState] = useState<{ phase: "loading" } | { phase: "ready"; text: string; note: string | null } | { phase: "none"; message: string }>({
    phase: "loading",
  });
  const reportedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setState({ phase: "loading" });
    reportedRef.current = false; // a new node's speakers report fresh
    (async () => {
      try {
        if (node.diary && node.entry_id) {
          const ck = textCacheKey(source.baseUrl, source.entity, `diary:${node.entry_id}`);
          let cached = await getCachedText(ck);
          if (!cached) {
            const entry = await fetchDiaryEntry(source.baseUrl, source.entity, node.entry_id, "operator review (detail)");
            cached = { text: String(entry.text ?? entry.gist ?? "") };
            if (cached.text) void putCachedText(ck, cached);
          }
          if (!cancelled) {
            setState({
              phase: "ready",
              text: cached.text || "",
              note: "His diary entry, served through the operator door — the first read landed as a visible moment in his biography; later reads come from the local cache.",
            });
          }
          return;
        }
        const vk = textCacheKey(source.baseUrl, source.entity, `verbatim:${node.graph_id ?? node.id}`);
        let cached = await getCachedText(vk);
        let note: string | null = cached?.note ?? null;
        if (!cached) {
          const v = await fetchRecordVerbatim(source.baseUrl, source.entity, node.graph_id ?? node.id);
          note = v.born_digest
            ? node.kind === "world_model"
              ? "His working model — born as words by the sleep pass (mechanical distillation for now; it becomes his own prose only through his revisions)."
              : "Born as words — never a compression; these are all the words there are."
            : null;
          cached = { text: String(v.text ?? ""), note: note ?? "" };
          if (cached.text) void putCachedText(vk, cached);
        } else {
          note = cached.note || null;
        }
        if (!cancelled) setState({ phase: "ready", text: cached.text || "", note });
      } catch (e) {
        if (cancelled) return;
        const err = e as Error & { status?: number };
        setState({
          phase: "none",
          message:
            err.status === 404
              ? "No verbatim exists for this memory — the digest above is the honest summary (the record genuinely carries no stored words)."
              : `Verbatim unavailable: ${err.message}`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Field deps, never the source OBJECT (blink forensics: an inline
    // parent literal re-fired this per render — loading-flash loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id, node.graph_id, node.entry_id, node.diary, node.kind, source.baseUrl, source.entity]);

  // Speaker-labeled rendering (dm#54 pt6: "clear verbatim"): exchanges
  // split into turns with the speaker as a small header chip; anything
  // that isn't exchange-shaped renders as plain words. The interlocutor
  // list flows UP into the metadata panel (pt5).
  // Separate his unspoken reasoning (if the verbatim carries it) BEFORE
  // parsing turns — the spoken half parses as the exchange, the thinking
  // half renders as its own muted block, never as a turn he spoke.
  const { spoken, thinking } = useMemo(
    () => (state.phase === "ready" ? splitUnspokenThinking(state.text) : { spoken: "", thinking: null }),
    [state],
  );
  const turns = useMemo(
    () => (state.phase === "ready" ? parseVerbatimTurns(spoken, source.entity) : null),
    [state.phase, spoken, source.entity],
  );
  useEffect(() => {
    if (turns && onSpeakers && !reportedRef.current) {
      reportedRef.current = true;
      const name = source.entity.trim().toLowerCase();
      const others = [...new Set(turns.map((t) => t.speaker.replace(/ \(while looking things up\)$/, "")))].filter(
        (s) => s.toLowerCase() !== name && s !== "(the door)",
      );
      onSpeakers(others);
    }
  }, [turns, onSpeakers, source.entity]);

  if (state.phase === "loading") return <p className="ei_note">reading his words…</p>;
  if (state.phase === "none") return <p className="ei_note">{state.message}</p>;
  return (
    <div className="ei_verbatim_inline">
      {state.note ? <p className="ei_verbatim_note">{state.note}</p> : null}
      {turns ? (
        <div className="ei_turns">
          {turns.map((t, i) => (
            <div key={i} className={`ei_turn ${t.speaker.toLowerCase().startsWith(source.entity.trim().toLowerCase()) ? "ei_turn_self" : ""}`}>
              <span className="ei_turn_speaker">{t.speaker}</span>
              <pre className="ei_turn_text">{t.text}</pre>
            </div>
          ))}
        </div>
      ) : (
        <pre className="ei_verbatim_text">{spoken || state.text}</pre>
      )}
      {thinking ? (
        <div className="ei_unspoken">
          <span className="ei_unspoken_head">thinking · unspoken</span>
          <pre className="ei_unspoken_text">{thinking}</pre>
        </div>
      ) : null}
    </div>
  );
}

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
  const partners = useMemo(() => {
    const rows: Array<{ id: string; title: string; count: number }> = [];
    for (const e of fold.edges.values()) {
      const other = e.a === node.id ? e.b : e.b === node.id ? e.a : null;
      if (!other) continue;
      const otherNode = fold.nodes.get(other);
      rows.push({ id: other, title: otherNode?.title || other.slice(0, 18), count: e.count });
    }
    rows.sort((a, b) => b.count - a.count);
    return rows.slice(0, 8);
  }, [fold, node]);

  // Feelings ABOUT this record (valence targets may be record ids).
  const feeling = useMemo(() => {
    const byGraph = node.graph_id ? fold.standings.get(node.graph_id) : undefined;
    return byGraph ?? fold.standings.get(node.id);
  }, [fold, node]);

  // The interlocutor(s), reported by the verbatim parser (dm#54 pt5:
  // "person:admin" belongs in a metadata field, not the scrolling text).
  const [speakers, setSpeakers] = useState<string[]>([]);
  useEffect(() => setSpeakers([]), [node.id]);

  const bornDate = node.born_at ? node.born_at.slice(0, 16).replace("T", " ") : null;

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
      {/* The kind badge sits directly above — a "lesson:" prefix here said
        * it twice (laurent dm#84); shapeLabel strips type/gist scaffolding. */}
      <h3 className="ei_title">{shapeLabel(node.title || "") || node.id.slice(0, 24)}</h3>
      {node.digest_method ? (
        <p
          className="ei_digest_method"
          title="Digest provenance — who wrote this record's words: mechanical-v1/v2 = the driver's floor (never marker-only), mechanical-flow-v1 = the flow brain's mechanical digest; entity prose carries no method. Mechanical digests are repairable debt (the consent set governs re-digestion)."
        >
          digest: <code>{node.digest_method}</code>{node.digest_method.startsWith("mechanical") ? " — mechanical, repairable" : ""}
        </p>
      ) : null}
      {/* METADATA PANEL FIRST (dm#54 pt6: "clear metadata panel, clear
        * verbatim, links") — every fact in one labeled grid, the date
        * beside the seq (pt5: "it should have a clear date"), the
        * interlocutor as a field once the verbatim reports it. */}
      <dl className="ei_facts">
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
          {bornDate ? `${bornDate} · ` : ""}seq {node.first_seq}
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
      </dl>
      {/* THE WORDS (operator dm#28): no button between the click and the
        * verbatim — the Detail tab IS the reading surface. Only relation
        * rows and engine bookkeeping carry no words to show. */}
      {node.kind !== "relation" && !node.bookkeeping ? (
        verbatimSource ? (
          <InlineVerbatim node={node} source={verbatimSource} onSpeakers={setSpeakers} />
        ) : (
          <p className="ei_note">Verbatim reads need a connected gateway (this is an exported file).</p>
        )
      ) : null}
      {node.signals && node.signals.length > 0 ? (
        <div className="ei_section ei_night" title="The night's telemetry (wave-5 dream signals): what the sleep pass MOVED — structure decided what enters; the felt tint only COLORS it (a read of his accumulated feelings, never a deposit). Machine acts carry no tint by design.">
          <h4>The night moved</h4>
          <ul className="ei_signals">
            {node.signals.map((s, i) => {
              const tone = String(s.felt?.tone || "");
              const toneClass = tone === "warm" ? "ei_sig_warm" : tone === "sore" ? "ei_sig_sore" : tone === "mixed" ? "ei_sig_mixed" : "";
              const kindWord = String(s.kind || "signal").replace(/_/g, " ");
              return (
                <li key={i} className={`ei_signal ${toneClass}`}>
                  <span className="ei_sig_kind" title={`${s.kind || "signal"}${s.phase ? ` · phase: ${s.phase}` : ""}${s.act ? ` · act: ${s.act}` : ""}`}>
                    {kindWord}
                  </span>
                  {s.fragment ? <span className="ei_sig_frag">{s.fragment}</span> : null}
                  {tone ? (
                    <span
                      className="ei_sig_felt"
                      title={`Felt ${tone}${typeof s.felt?.weight === "number" ? ` (weight ${s.felt.weight})` : ""}${s.felt?.scarred ? " · a scar stands" : ""}${s.felt?.bonded ? " · a bond stands" : ""} — accumulated feeling READ by the night, coloring this line only.`}
                    >
                      {tone}
                      {s.felt?.scarred ? " ⚑" : ""}
                      {s.felt?.bonded ? " ♥" : ""}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {node.closed ? (
        <div className="ei_closed">
          <strong>{node.closed.kind === "supersede" ? "Superseded" : "Retracted"}</strong> — {node.closed.reason}
          {node.closed.replacement_ids.length > 0 ? (
            <div className="ei_replacements">
              replaced by{" "}
              {node.closed.replacement_ids.map((rid) => {
                const row = fold.graph_to_row.get(rid) ?? rid;
                const target = fold.nodes.get(row);
                return (
                  <button key={rid} className="ei_link" onClick={() => onSelect(row)}>
                    {target?.title || rid.slice(0, 22)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
      {feeling ? (
        <div className="ei_section">
          <h4>How it feels about this</h4>
          <div className="ei_channels">
            <div className="ei_channel ei_channel_pos">
              <span className="ei_channel_value">+{feeling.positive}</span>
              <span className="ei_channel_label">{feeling.positive_count} positive</span>
            </div>
            <div className="ei_channel ei_channel_neg">
              <span className="ei_channel_value">−{feeling.negative}</span>
              <span className="ei_channel_label">{feeling.negative_count} negative</span>
            </div>
          </div>
          {feeling.bonds.map((b) => (
            <div key={b.event_id} className="ei_peak ei_peak_bond">
              <strong>Bond</strong> (magnitude {b.magnitude}) — {b.reason || "no reason recorded"}
            </div>
          ))}
          {feeling.scars.map((s) => (
            <div key={s.event_id} className="ei_peak ei_peak_scar">
              <strong>Scar</strong> (magnitude {s.magnitude}) — {s.reason || "no reason recorded"}
            </div>
          ))}
          <FeelingEvents events={feeling.events} />
        </div>
      ) : null}
      {partners.length > 0 ? (
        <div className="ei_section">
          <h4>Used together with</h4>
          {partners.map((p) => (
            <button key={p.id} className="ei_link ei_partner" onClick={() => onSelect(p.id)}>
              <span>{p.title}</span>
              <span className="ei_count">×{p.count}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StandingCard({ standing }: { standing: StandingState }): React.ReactElement {
  const net = standing.positive - standing.negative;
  return (
    <div className="ei_card">
      <div className="ei_kind_row">
        <span className="ei_kind ei_kind_standing">standing</span>
      </div>
      <h3 className="ei_title">{standing.target_id}</h3>
      <div className="ei_channels">
        <div className="ei_channel ei_channel_pos">
          <span className="ei_channel_value">+{standing.positive}</span>
          <span className="ei_channel_label">{standing.positive_count} positive</span>
        </div>
        <div className="ei_channel ei_channel_neg">
          <span className="ei_channel_value">−{standing.negative}</span>
          <span className="ei_channel_label">{standing.negative_count} negative</span>
        </div>
        <div className="ei_channel">
          <span className="ei_channel_value">{net >= 0 ? `+${net}` : `${net}`}</span>
          <span className="ei_channel_label">net</span>
        </div>
      </div>
      <p className="ei_note">Both channels stay visible: a hundred small joys and one deep wound are both true.</p>
      {standing.bonds.map((b) => (
        <div key={b.event_id} className="ei_peak ei_peak_bond">
          <strong>Bond</strong> (magnitude {b.magnitude}) — {b.reason || "no reason recorded"}
        </div>
      ))}
      {standing.scars.map((s) => (
        <div key={s.event_id} className="ei_peak ei_peak_scar">
          <strong>Scar</strong> (magnitude {s.magnitude}) — {s.reason || "no reason recorded"}
        </div>
      ))}
      {standing.healed_count > 0 ? (
        <div className="ei_peak ei_peak_healed">
          {standing.healed_count} scar{standing.healed_count === 1 ? "" : "s"} healed — the wound became a lesson.
        </div>
      ) : null}
      {standing.broken_count > 0 ? (
        <div className="ei_peak ei_peak_scar">{standing.broken_count} bond{standing.broken_count === 1 ? "" : "s"} broken.</div>
      ) : null}
      <FeelingEvents events={standing.events} />
    </div>
  );
}

function BeatCard({ fold, beat, onSelect }: { fold: FoldState; beat: BeatState; onSelect(id: string): void }): React.ReactElement {
  const groups = useMemo(() => {
    const byLabel: Record<string, string[]> = {};
    for (const [rid, label] of Object.entries(beat.admissions)) {
      (byLabel[label] ??= []).push(rid);
    }
    return byLabel;
  }, [beat]);

  const order = ["self", "stm", "both", "stimulus"];
  return (
    <div className="ei_card">
      <div className="ei_kind_row">
        <span className="ei_kind ei_kind_beat">recall</span>
        {beat.turn_id ? <span className="ei_badge">{beat.turn_id}</span> : null}
      </div>
      <h3 className="ei_title">{beat.cue_text ? `“${beat.cue_text}”` : "The self read (no cue)"}</h3>
      <dl className="ei_facts">
        <dt>considered</dt>
        <dd>{beat.candidate_count}</dd>
        <dt>on the shelf</dt>
        <dd>{beat.selected.length}</dd>
        <dt>entered context</dt>
        <dd>{beat.committed ? `${beat.used_record_ids.length}${beat.prompt_token_estimate ? ` (~${beat.prompt_token_estimate} tokens)` : ""}` : "not committed"}</dd>
      </dl>
      {order.map((label) => {
        const ids = groups[label];
        if (!ids || ids.length === 0) return null;
        return (
          <div key={label} className="ei_section">
            <h4 className={`ei_adm_head ei_adm_${label}`}>{ADMISSION_LABELS[label] ?? label}</h4>
            {ids.map((rid) => {
              const node = fold.nodes.get(rid);
              return (
                <button key={rid} className="ei_link" onClick={() => onSelect(rid)}>
                  {node?.redacted ? "a diary entry (private)" : node?.title || rid.slice(0, 22)}
                </button>
              );
            })}
          </div>
        );
      })}
      {beat.dropped.length > 0 ? (
        <div className="ei_section">
          <h4>Considered but dropped</h4>
          {beat.dropped.slice(0, 10).map((d, i) => {
            const node = fold.nodes.get(d.record_id);
            return (
              <div key={`${d.record_id}-${i}`} className="ei_dropped">
                <span>{node?.redacted ? "a diary entry" : node?.title || d.record_id.slice(0, 18)}</span>
                <span className="ei_reason">{d.reason ?? ""}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function Inspector({ fold, temporal, scrubSeq, selectedId, onSelect, verbatimSource, onOpenMeet }: InspectorProps): React.ReactElement {
  // Maintainer ruling (2026-07-08 00:59): the operator reads without
  // ceremony — and dm#28 removed even the button: the verbatim renders
  // INLINE in the card (InlineVerbatim). Diary reads still land as
  // visible diary_read moments in the stream on their FIRST read (the
  // text cache serves later reads without touching the door).
  const content = useMemo(() => {
    if (selectedId?.startsWith("standing:")) {
      const standing = fold.standings.get(selectedId.slice("standing:".length));
      if (standing) return <StandingCard standing={standing} />;
    } else if (selectedId) {
      const node = fold.nodes.get(selectedId) ?? fold.nodes.get(fold.graph_to_row.get(selectedId) ?? "");
      if (node) return <NodeCard fold={fold} node={node} temporal={temporal} onSelect={onSelect} verbatimSource={verbatimSource} onOpenMeet={onOpenMeet} />;
      const standing = fold.standings.get(selectedId);
      if (standing) return <StandingCard standing={standing} />;
    }
    // No selection: show the beat active at the scrub position.
    let active: BeatState | null = null;
    for (const tid of fold.beat_order) {
      const beat = fold.beats.get(tid);
      if (beat && beat.first_seq <= scrubSeq) active = beat;
    }
    if (active) return <BeatCard fold={fold} beat={active} onSelect={onSelect} />;
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
