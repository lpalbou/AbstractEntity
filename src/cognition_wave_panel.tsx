/**
 * Cognition wave panel — the entity app's mount of uic's cognition-wave
 * monitor (the split ruled on the hub: uic owns the scorer + basis +
 * renderer, this owns the feed + mount; c1807/c1824/c1831).
 *
 * Pipeline: harvest the entity's own utterances (utterance_harvest) → embed
 * through the gateway pinned to the home's M1 embedder (cognition_adapter)
 * → uic's frozen-basis scorer → uic's Bloom renderer, animated on a canvas.
 *
 * Honesty (non-negotiable, per uic + me):
 * - The framing label ("reads the expressive character of text, not inner
 *   state") is ALWAYS shown — never hidden, never toned down.
 * - `wandering` is session-relative (labeled); the curated-only v0 basis
 *   names itself as such (provenance line).
 * - Embedder space is guarded end to end: the scorer refuses a pin↔basis
 *   mismatch and the panel surfaces it, rather than scoring across spaces.
 * - No live gateway / no readable utterances / an embed failure all degrade
 *   to an explicit message — never a fabricated bloom.
 *
 * The vendored uic code (src/vendor/cognition/) is a temporary copy pending
 * the `monitor-cognition` kit package; the swap is one import line.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AfCognitionBloom } from "@abstractframework/ui-kit";

import { scoreEntityUtterances, type ScoredSample } from "./cognition_adapter";
import { evidenceNote, evidenceTitle, MonitorInfoModal, type AxisInfo } from "./cognitive_monitor";
import type { FoldState } from "./stream_fold";
import { createScorer, type FrozenBasis } from "./vendor/cognition/cognition_scorer";

// The frozen basis is ~190 KB of numbers; lazy-load it so opening the Wave
// tab (not the default view) is what pays for it, not first paint. Cached
// after the first load. When the kit package ships, this becomes a normal
// import from the package (still code-splittable).
async function loadBasis(): Promise<FrozenBasis> {
  // v1 (2026-08-01): cut on HIS real utterances — see cognition_wave_inline's
  // loadBasis note; both mounts must load the SAME basis (one instrument).
  const mod = await import("./vendor/cognition/data/basis_v1.json");
  return (mod.default ?? mod) as unknown as FrozenBasis;
}

export interface CognitionWavePanelProps {
  fold: FoldState;
  /** Gateway base + entity; null on an exported file (scoring needs the
   * gateway embeddings route + operator doors). */
  source: { baseUrl: string; entity: string } | null;
  /** The bottom timeline's scrub position (journal seq). When timeline-
   * follow is on (default), the wave shows the utterance nearest BELOW this
   * seq — cognition, graph and discussion correlate on one axis. */
  scrubSeq: number;
}

type Phase =
  | { name: "idle" } // primed for a pull, not yet run (the resting state)
  | { name: "scoring" }
  | { name: "ready"; samples: ScoredSample[]; warnings: string[] }
  | { name: "empty"; warnings: string[] }
  | { name: "error"; message: string; warnings: string[] };

const FRAMING = "This reads the expressive character of his WORDS, not his inner state — a text performing calm scores calm.";

export function CognitionWavePanel({ fold, source, scrubSeq }: CognitionWavePanelProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [idx, setIdx] = useState(0);
  /** Replay mode: "timeline" (default — the bottom scrub bar drives the
   * wave, correlating it with the graph + discussion), "play" (autoplay
   * through the samples), or "manual" (prev/next stepping). */
  const [mode, setMode] = useState<"timeline" | "play" | "manual">("timeline");
  const [basis, setBasis] = useState<FrozenBasis | null>(null);
  const [modalAxis, setModalAxis] = useState<AxisInfo | "about" | null>(null);
  const scoringRef = useRef(false);

  // The fold is read AT PULL TIME from a ref — NEVER a scoring-effect
  // dependency. This is THE flood fix (agency c2155): `fold` is a fresh
  // object on every replay envelope (live tail) and every scrub, so an
  // effect keyed on it re-ran the whole harvest — ~120 diary/episode door
  // reads EACH — continuously while the Wave tab was open (~995 gateway
  // hits in 3 min + diary_read marker pollution). The c1824 ruling is ONE
  // operator-driven pull, never per-render sampling; the harvest now fires
  // ONLY from the explicit button below, over a snapshot of the current fold.
  const foldRef = useRef(fold);
  foldRef.current = fold;

  const provenance = useMemo(() => {
    if (!basis) return null;
    const c = (basis.calibrated_on ?? {}) as { curated_arc?: number; castor_utterances?: number };
    const real = c.castor_utterances ?? 0;
    return real > 0
      ? `basis v${basis.version} · calibrated on ${real} real utterance(s)`
      : `basis v${basis.version} · curated-only (no real utterances yet) — shapes are indicative`;
  }, [basis]);

  // Switching entity (or losing the gateway) discards any scored wave and
  // returns to the resting state — never carries one mind's wave onto
  // another, and never auto-scores the new one.
  useEffect(() => {
    setPhase({ name: "idle" });
    setIdx(0);
    setMode("timeline");
    scoringRef.current = false;
  }, [source?.baseUrl, source?.entity]);

  // THE ONE PULL (explicit operator act only). Reads a snapshot of the
  // current fold, harvests the entity's own words, embeds + scores once,
  // and caches the samples. A live/scrub fold change does NOT re-run this;
  // the operator re-reads on demand with the same button.
  const runScore = useCallback(async () => {
    if (!source || scoringRef.current) return;
    scoringRef.current = true;
    setPhase({ name: "scoring" });
    setIdx(0);
    try {
      const b = basis ?? (await loadBasis());
      if (!basis) setBasis(b);
      const scorer = createScorer(b, {
        embedderId: b.embedder_id,
        ...(typeof b.abstention_floor === "number" ? { abstention: { floor: b.abstention_floor } } : {}),
      });
      const res = await scoreEntityUtterances(source.baseUrl, source.entity, foldRef.current, scorer, { limit: 120 });
      if (res.samples.length === 0) setPhase({ name: "empty", warnings: res.warnings });
      else setPhase({ name: "ready", samples: res.samples, warnings: res.warnings });
    } catch (e) {
      setPhase({ name: "error", message: (e as Error).message, warnings: (e as { warnings?: string[] }).warnings ?? [] });
    } finally {
      scoringRef.current = false;
    }
  }, [source, basis]);

  // The kit's AfCognitionBloom owns the physics + render (morph gate,
  // vignette, GRAVITY). Which sample is CURRENT is selected below (timeline
  // scrub / autoplay / prev-next); its `emotions` feed the bloom's scores,
  // and the component re-targets — morph-gated — on every change.
  const samples = phase.name === "ready" ? phase.samples : null;
  useEffect(() => {
    if (samples && samples.length > 0) setIdx(0);
  }, [samples]);

  // TIMELINE mode (default): the bottom scrub bar drives the wave — show
  // the last utterance formed at or before the scrub seq (linear scan over
  // the ~120-sample corpus; samples are chronological, seqs are formation
  // anchors). A scrub position BEFORE any utterance selects nothing
  // (idx -1) — showing the first utterance there would display words that
  // had not been spoken yet at that point.
  useEffect(() => {
    if (mode !== "timeline" || !samples || samples.length === 0) return;
    let best = -1;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i].seq;
      if (s !== null && s <= scrubSeq) best = i;
    }
    setIdx(best);
  }, [mode, scrubSeq, samples]);

  // PLAY mode: advance one utterance every ~2.6s (readable, not frantic).
  useEffect(() => {
    if (mode !== "play" || !samples || samples.length === 0) return;
    const advance = window.setInterval(() => {
      setIdx((prev) => (prev + 1) % samples.length);
    }, 2600);
    return () => window.clearInterval(advance);
  }, [mode, samples]);

  const stepBy = (delta: number) => {
    if (!samples || samples.length === 0) return;
    setMode("manual");
    setIdx((prev) => Math.min(samples.length - 1, Math.max(0, prev + delta)));
  };

  const current = samples && idx >= 0 && samples[idx] ? samples[idx] : null;
  const scoring = phase.name === "scoring";

  return (
    <div className="cw_panel">
      <div className="cw_head">
        <span className="cw_title">🧠 Cognitive Monitor</span>
        <button className="cm_info" onClick={() => setModalAxis("about")} title="What is this? How to read it">
          ⓘ
        </button>
        {provenance ? <span className="cw_prov">{provenance}</span> : null}
      </div>
      <div className="cw_framing">{FRAMING}</div>
      {modalAxis !== null ? <MonitorInfoModal axis={modalAxis} onClose={() => setModalAxis(null)} /> : null}

      {/* THE ONE-PULL CONTROL (c1824 ruling, flood fix c2155): scoring is an
        * EXPLICIT operator act, never automatic — reading his words costs
        * gateway door reads (diary/episode verbatim) + embeddings and lands
        * visible diary_read markers in his stream, so it fires only on this
        * click, over a snapshot of the current graph. Re-read on demand. */}
      {!source ? (
        <p className="cw_note">A connected gateway is needed to embed and score his words (this is an exported view).</p>
      ) : (
        <div className="cw_pullbar">
          <button className="cw_pull_btn" onClick={() => void runScore()} disabled={scoring}>
            {scoring ? "reading his words…" : phase.name === "idle" ? "read the wave" : "re-read"}
          </button>
          <span className="cw_pull_hint">
            reads his words once (diary + episodes through the gateway; a visible read in his stream) — not live
          </span>
        </div>
      )}

      {phase.name === "empty" ? (
        <p className="cw_note">
          No readable utterances yet — the wave fills as he speaks (visit replies, diary entries, reflections).
          {phase.warnings.length ? <span className="cw_warn"> {phase.warnings[0]}</span> : null}
        </p>
      ) : null}
      {phase.name === "error" ? (
        <p className="cw_note cw_note_error">
          Could not score: {phase.message}
          {phase.warnings.length ? <span className="cw_warn"> · {phase.warnings.join(" · ")}</span> : null}
        </p>
      ) : null}

      {phase.name === "ready" ? (
        <>
          <div className="cw_bloom">
            <AfCognitionBloom scores={current?.emotions ?? {}} options={{ labels: true, vignette: true }} size={300} />
          </div>

          {/* Replay controls (operator 2026-07-15): grouped RIGHT like the
            * other tabs; the wave is timeline-driven by default so the
            * cognition monitor, the graph and the discussion correlate on
            * the one scrub axis at the bottom. Play/prev/next take over
            * explicitly; ⛓ returns to the timeline. */}
          <div className="cw_controls">
            <span className="cw_mode_hint">
              {mode === "timeline" ? "following the timeline below" : mode === "play" ? "playing his words in order" : "manual stepping"}
            </span>
            <div className="cw_controls_right">
              <button className="cw_ctl" onClick={() => stepBy(-1)} disabled={!samples || idx <= 0} title="Previous utterance">
                ⏮
              </button>
              <button
                className={`cw_ctl ${mode === "play" ? "cw_ctl_on" : ""}`}
                onClick={() => setMode((m) => (m === "play" ? "manual" : "play"))}
                title={mode === "play" ? "Pause the replay" : "Play his utterances in order"}
              >
                {mode === "play" ? "❚❚" : "▶"}
              </button>
              <button className="cw_ctl" onClick={() => stepBy(1)} disabled={!samples || idx >= (samples?.length ?? 1) - 1} title="Next utterance">
                ⏭
              </button>
              <span className="cw_pos" title="utterance position / total scored">
                {Math.max(0, idx + 1)}/{phase.samples.length}
              </span>
              <button
                className={`cw_ctl ${mode === "timeline" ? "cw_ctl_on" : ""}`}
                onClick={() => setMode("timeline")}
                title="Follow the timeline at the bottom — the wave shows the utterance at the scrub position (correlates with the graph + ledger)"
              >
                ⛓ timeline
              </button>
            </div>
          </div>

          {/* THE TURN (operator 2026-07-15: show request + answer at each
            * turn, like the uic widget): the other party's words are
            * display-only context; the ANSWER is what was scored. */}
          {!current && mode === "timeline" ? (
            <p className="cw_note">Nothing spoken yet at this scrub position — move the timeline forward to his first utterance.</p>
          ) : null}
          {current ? (
            <div className="cw_turn">
              <div className="cw_turn_head">
                <span className={`cw_src cw_src_${current.source}`}>{current.source}</span>
                {current.at ? <span className="cw_turn_when">{new Date(current.at).toLocaleString()}</span> : null}
                {current.seq !== null ? <span className="cw_turn_seq">seq {current.seq}</span> : null}
                {typeof current.novelty === "number" ? (
                  <span className="cw_wander" title="Session-relative drift from the conversation's own center — not an absolute scale">
                    wandering {current.novelty.toFixed(2)}
                  </span>
                ) : null}
                {/* The abstention gate, said per utterance (2026-08-01):
                  * a flat bloom on this sample is honest quiet, not a
                  * scoring failure — hover carries the live numbers. */}
                {evidenceNote(current.emotionEvidence) ? (
                  <span className="cw_quiet" title={evidenceTitle(current.emotionEvidence, current.emotionMaxSim)}>
                    {evidenceNote(current.emotionEvidence)}
                  </span>
                ) : null}
              </div>
              {current.request ? (
                <div className="cw_turn_block cw_turn_request">
                  <span className="cw_turn_role">request</span>
                  <p>{current.request}</p>
                </div>
              ) : null}
              {current.text ? (
                <div className="cw_turn_block cw_turn_answer">
                  <span className="cw_turn_role">{current.source === "diary" ? "his entry" : current.source === "summary" ? "his reflection" : "his answer"}</span>
                  <p>{current.text}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          {phase.warnings.length ? <div className="cw_warn">{phase.warnings.join(" · ")}</div> : null}
        </>
      ) : null}
    </div>
  );
}
