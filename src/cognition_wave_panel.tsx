/**
 * THE COGNITIVE MONITOR, docked above the timeline (operator 2026-11-10,
 * backlog 0018: "the cognitive monitor lives at the bottom with the temporal
 * replay, evolving with the replay and per message, so nothing of it at the
 * top"). The timeline's Monitor toggle opens it; it is mounted only while
 * open, so a closed monitor renders and reads nothing. The timeline drives
 * it (no transport of its own):
 * - LIVE with his conversation open in the chat: the reply in view, read per
 *   message (cognition_wave_inline.tsx, fed by the chat drawer's ReplyFeed).
 * - Otherwise: his words at the replay position, from the corpus read on
 *   demand with its button (the scoring below), the utterance formed at or
 *   before the timeline's seq.
 *
 * The entity app's mount of uic's cognition-wave monitor (the split ruled on
 * the hub: uic owns the scorer + basis + renderer, this owns the feed +
 * mount; c1807/c1824/c1831).
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

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AfCognitionBloom } from "@abstractframework/ui-kit";

import { scoreEntityUtterances, type ScoredSample } from "./cognition_adapter";
import { basisProvenanceNote, BloomAxisOverlay, bloomScoresOf, MonitorInfoModal, ToneRow } from "./cognitive_monitor";
import type { FoldState } from "./stream_fold";
import { isEmbeddingsUnconfigured } from "./stream_source";
import { CognitionWaveInline, EmbeddingsUnconfiguredNote, type ReplyFeed } from "./cognition_wave_inline";
import { WordsLine } from "./words_line";
import { createScorer, type FrozenBasis } from "./vendor/cognition/cognition_scorer";

// The frozen basis is ~190 KB of numbers; lazy-load it so opening the
// monitor (not the default view) is what pays for it, not first paint.
// Cached after the first load. When the kit package ships, this becomes a normal
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
  /** The timeline's position (journal seq): the monitor shows the utterance
   * formed at or before it — cognition, graph and discussion correlate on
   * one axis. */
  scrubSeq: number;
  /** The timeline follows the live journal: the reply in view in his open
   * conversation (when there is one) is read, per message. */
  live: boolean;
  /** The chat drawer's reply in view (createReplyFeed). */
  replyFeed: ReplyFeed;
}

type Phase =
  | { name: "idle" } // primed for a pull, not yet run (the resting state)
  | { name: "scoring" }
  | { name: "ready"; samples: ScoredSample[]; warnings: string[] }
  | { name: "empty"; warnings: string[] }
  | { name: "error"; message: string; warnings: string[] }
  | { name: "unconfigured"; message: string };

/** The bloom's side in the dock (it shares the strip's height with the turn beside it). */
const BLOOM = 200;

const FRAMING = "This reads the expressive character of his WORDS, not his inner state — a text performing calm scores calm.";

/** The utterance the monitor shows at a timeline position: the last one formed at or before it;
 * null before his first (never words not yet spoken there). */
export function sampleAt(samples: readonly ScoredSample[], seq: number): ScoredSample | null {
  let best: ScoredSample | null = null;
  for (const sample of samples) if (sample.seq !== null && sample.seq <= seq) best = sample;
  return best;
}

/** The corpus read, kept per gateway + entity for the page's life: the monitor
 * mounts only while open, and a re-open must not cost his words another read.
 * A read in flight is its promise (a re-open while scoring waits on it).
 * Never evicted: one entry per home visited, one ~120-sample corpus each. */
const corpusReads = new Map<string, Phase | Promise<Phase>>();
export const corpusKey = (source: { baseUrl: string; entity: string } | null): string => (source ? `${source.baseUrl}\u0000${source.entity}` : "");

/** What the monitor shows for a home on (re)opening: the kept read, "scoring" while one is in
 * flight, else the resting state. */
export function keptCorpus(key: string): Phase {
  const kept = corpusReads.get(key);
  return kept === undefined ? { name: "idle" } : kept instanceof Promise ? { name: "scoring" } : kept;
}

/** The read in flight for a home (a re-open waits on it), or null. */
export function corpusInFlight(key: string): Promise<Phase> | null {
  const kept = corpusReads.get(key);
  return kept instanceof Promise ? kept : null;
}

/** THE ONE PULL for a home: starts `read` unless one is in flight (null then, nothing starts);
 * its result is kept for the page's life. */
export function startCorpusRead(key: string, read: () => Promise<Phase>): Promise<Phase> | null {
  if (corpusInFlight(key)) return null;
  const pending = read();
  corpusReads.set(key, pending);
  void pending.then((done) => corpusReads.set(key, done));
  return pending;
}

/** Whether the monitor is on screen, so mounted: open, his page (not the roster), his content not
 * behind the content gate, and not beside the avatar view (which takes the whole main area). */
export function monitorShown(state: { open: boolean; locked: boolean; roster: boolean; avatar: boolean }): boolean {
  return state.open && !state.locked && !state.roster && !state.avatar;
}

/** The dock under the graph (backlog 0018): nothing at all unless shown. */
export function MonitorDock({ shown, ...panel }: CognitionWavePanelProps & { shown: boolean }): React.ReactElement | null {
  if (!shown) return null;
  return (
    <section className="entity_monitor_dock" aria-label="Cognitive monitor">
      <CognitionWavePanel {...panel} />
    </section>
  );
}

export function CognitionWavePanel({ fold, source, scrubSeq, live, replyFeed }: CognitionWavePanelProps): React.ReactElement {
  const key = corpusKey(source);
  const [phase, setPhase] = useState<Phase>(() => keptCorpus(key));
  const [basis, setBasis] = useState<FrozenBasis | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const feed = useSyncExternalStore(replyFeed.subscribe, replyFeed.get, replyFeed.get);

  // The fold is read AT PULL TIME from a ref — NEVER a scoring-effect
  // dependency. This is THE flood fix (agency c2155): `fold` is a fresh
  // object on every replay envelope (live tail) and every scrub, so an
  // effect keyed on it re-ran the whole harvest — ~120 diary/episode door
  // reads EACH — continuously while the old Wave tab was open (~995 gateway
  // hits in 3 min + diary_read marker pollution). The c1824 ruling is ONE
  // operator-driven pull, never per-render sampling; the harvest now fires
  // ONLY from the explicit button below, over a snapshot of the current fold.
  const foldRef = useRef(fold);
  foldRef.current = fold;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const provenance = useMemo(() => {
    if (!basis) return null;
    const c = (basis.calibrated_on ?? {}) as { curated_arc?: number; castor_utterances?: number };
    const real = c.castor_utterances ?? 0;
    return real > 0
      ? `basis v${basis.version} · generic registers, normalization fitted on a mixed corpus incl. ${real} real replies`
      : `basis v${basis.version} · generic registers, normalization fitted on curated texts only — shapes are indicative`;
  }, [basis]);
  const calibration = useMemo(() => (basis ? basisProvenanceNote(basis.calibrated_on) : null), [basis]);

  // The basis (provenance line, the ⓘ's calibration note) loads with the
  // open monitor; nothing is read or scored by it.
  useEffect(() => {
    let alive = true;
    void loadBasis().then((b) => alive && setBasis(b));
    return () => {
      alive = false;
    };
  }, []);

  // Switching entity (or losing the gateway) shows THAT mind's kept read, or
  // the resting state — never carries one mind's wave onto another, and
  // never auto-scores the new one. A read in flight lands when it ends.
  useEffect(() => {
    let alive = true;
    const flight = corpusInFlight(key);
    if (flight) {
      setPhase({ name: "scoring" });
      void flight.then((p) => alive && setPhase(p));
    } else setPhase(keptCorpus(key));
    return () => {
      alive = false;
    };
  }, [key]);

  // THE ONE PULL (explicit operator act only). Reads a snapshot of the
  // current fold, harvests the entity's own words, embeds + scores once,
  // and caches the samples. A live/scrub fold change does NOT re-run this;
  // the operator re-reads on demand with the same button.
  const runScore = useCallback(() => {
    if (!source) return;
    const read = startCorpusRead(key, async (): Promise<Phase> => {
      try {
        const b = await loadBasis();
        const scorer = createScorer(b, {
          embedderId: b.embedder_id,
          ...(typeof b.abstention_floor === "number" ? { abstention: { floor: b.abstention_floor } } : {}),
        });
        const res = await scoreEntityUtterances(source.baseUrl, source.entity, foldRef.current, scorer, { limit: 120 });
        return res.samples.length === 0 ? { name: "empty", warnings: res.warnings } : { name: "ready", samples: res.samples, warnings: res.warnings };
      } catch (e) {
        if (isEmbeddingsUnconfigured(e)) return { name: "unconfigured", message: e.message };
        return { name: "error", message: (e as Error).message, warnings: (e as { warnings?: string[] }).warnings ?? [] };
      }
    });
    if (!read) return; // one in flight already: it lands when it ends
    setPhase({ name: "scoring" });
    void read.then((p) => setPhase((cur) => (cur.name === "scoring" && corpusKey(sourceRef.current) === key ? p : cur)));
  }, [source, key]);

  // The kit's AfCognitionBloom owns the physics + render (morph gate,
  // vignette, GRAVITY). The CURRENT sample follows the timeline: the last
  // utterance formed at or before its seq (a scan over the ~120-sample
  // corpus; samples are chronological, seqs are formation anchors). A
  // position BEFORE any utterance selects nothing — showing the first one
  // there would display words not yet spoken at that point.
  const samples = phase.name === "ready" ? phase.samples : null;
  const current = useMemo(() => (samples ? sampleAt(samples, scrubSeq) : null), [samples, scrubSeq]);

  // LIVE, his conversation open in the chat: the reply in view, per message.
  const conversation = live && source && feed && (feed.focusReply ?? feed.latestReply) ? feed : null;

  const bloomScores = useMemo(() => bloomScoresOf(current?.emotions), [current]);
  const scoring = phase.name === "scoring";

  return (
    <div className="cw_panel cw_dock">
      <div className="cw_head">
        <span className="cw_title">🧠 Cognitive Monitor</span>
        <button className="cm_info" onClick={() => setAboutOpen(true)} title="What is this? How to read it">
          ⓘ
        </button>
        <span className="cw_follow">{conversation ? "the reply in view in his conversation" : "his words at the timeline's position"}</span>
        {provenance ? <span className="cw_prov">{provenance}</span> : null}
      </div>
      <div className="cw_framing">{FRAMING}</div>
      {aboutOpen ? <MonitorInfoModal onClose={() => setAboutOpen(false)} calibration={calibration} /> : null}

      {conversation && source ? (
        // Per message: each distinct reply is read once (cached), the reply scrolled to retunes it.
        <CognitionWaveInline
          baseUrl={source.baseUrl}
          entity={source.entity}
          latestReply={conversation.latestReply}
          focusReply={conversation.focusReply}
          focusAt={conversation.focusAt}
          effort={conversation.effort}
          effortKey={conversation.effortKey}
          tools={conversation.tools}
        />
      ) : (
        <>
          {/* THE ONE-PULL CONTROL (c1824 ruling, flood fix c2155): scoring is an
            * EXPLICIT operator act, never automatic — reading his words costs
            * door reads (diary/episode verbatim) + embeddings and lands visible
            * diary_read markers in his stream, so it fires only on this click,
            * over a snapshot of the current graph. Re-read on demand. */}
          {!source ? (
            <p className="cw_note">Reading his words needs a connection to his home (this is an exported view).</p>
          ) : (
            <div className="cw_pullbar">
              <button className="cw_pull_btn" onClick={runScore} disabled={scoring}>
                {scoring ? "reading his words…" : phase.name === "idle" ? "read his words" : "re-read"}
              </button>
              <span className="cw_pull_hint">reads his diary and conversations once, for the replay; the read shows in his stream</span>
            </div>
          )}

          {phase.name === "empty" ? (
            <p className="cw_note">
              No readable words yet — the monitor fills as he speaks (visit replies, diary entries, reflections).
              {phase.warnings.length ? <span className="cw_warn"> {phase.warnings[0]}</span> : null}
            </p>
          ) : null}
          {phase.name === "unconfigured" ? (
            <p className="cw_note cw_note_error">
              <EmbeddingsUnconfiguredNote baseUrl={source?.baseUrl ?? ""} message={phase.message} className="" />
            </p>
          ) : null}
          {phase.name === "error" ? (
            <p className="cw_note cw_note_error">
              Could not score: {phase.message}
              {phase.warnings.length ? <span className="cw_warn"> · {phase.warnings.join(" · ")}</span> : null}
            </p>
          ) : null}

          {phase.name === "ready" ? (
            <div className="cw_ready">
              {/* Same input and labels as the conversation's reading: every register, its number
                * beside it; no edge tint (operator 2026-11-07). Before his first utterance every
                * petal sits on the inner ring and every number reads "—". Under it, the same tone
                * row: each channel's signed score (no sentence comments on the values). */}
              <div className="cw_bloom_col" style={{ width: BLOOM }}>
                <div style={{ position: "relative", width: BLOOM, height: BLOOM }}>
                  <AfCognitionBloom scores={bloomScores} options={{ labels: false, vignette: false }} size={BLOOM} />
                  <BloomAxisOverlay width={BLOOM} height={BLOOM} emotions={current?.emotions ?? {}} />
                </div>
                {current ? <ToneRow scores={current.scores} /> : null}
              </div>

              {/* THE TURN (operator 2026-07-15: show request + answer at each
                * turn, like the uic widget): the other party's words are
                * display-only context; the ANSWER is what was scored. */}
              <div className="cw_ready_text">
                {!current ? <p className="cw_note">Nothing spoken yet at this point of his life — move the timeline forward to his first utterance.</p> : null}
                {current ? (
                  <div className="cw_turn">
                    <div className="cw_turn_head">
                      <span className={`cw_src cw_src_${current.source}`}>{current.source}</span>
                      {current.at ? <span className="cw_turn_when">{new Date(current.at).toLocaleString()}</span> : null}
                      {typeof current.novelty === "number" ? (
                        <span className="cw_wander" title="Session-relative drift from the conversation's own center — not an absolute scale">
                          wandering {current.novelty.toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                    {current.request ? (
                      <div className="cw_turn_block cw_turn_request">
                        <span className="cw_turn_role">request</span>
                        <div className="cw_turn_text">
                          <WordsLine text={current.request} />
                        </div>
                      </div>
                    ) : null}
                    {current.text ? (
                      <div className="cw_turn_block cw_turn_answer">
                        <span className="cw_turn_role">{current.source === "diary" ? "his entry" : current.source === "summary" ? "his reflection" : "his answer"}</span>
                        {/* The shared renderer (Markdown, images never load), block mode: a reply's
                          * paragraphs stay paragraphs. */}
                        <div className="cw_turn_text">
                          <WordsLine text={current.text} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {phase.warnings.length ? <div className="cw_warn">{phase.warnings.join(" · ")}</div> : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
