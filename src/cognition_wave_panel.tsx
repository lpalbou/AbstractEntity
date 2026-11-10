/**
 * THE COGNITIVE MONITOR, inside the timeline (operator 2026-11-10, backlog 0032: "the monitor should
 * open in the empty space above" the timeline's controls, beside the lanes; never a strip that takes
 * the graph's height). The timeline's Monitor toggle opens it; it is mounted only while open, so a
 * closed monitor renders and reads nothing. Compact (about 110 px tall): a small bloom and the five
 * tone channels; live with his conversation open, the reply in view with its conduct gauge. No title,
 * no framing block, no button: the press on Monitor is the act that starts the one read of his words
 * (kept per entity for the page's life); the basis and the framing are the ⓘ's hover. The timeline
 * drives it:
 * - LIVE with his conversation open in the chat: the reply in view, read per message
 *   (cognition_wave_inline.tsx, fed by the chat drawer's ReplyFeed).
 * - Otherwise: his words at the replay position, the utterance formed at or before the timeline's
 *   seq, from that one read.
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
 * - The framing ("reads the expressive character of text, not inner state")
 *   is the ⓘ's card, reached by hover, focus or a long-press, never toned
 *   down (the operator removed the visible block, backlog 0032).
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

import { scoreEntityUtterances, type ScoredSample } from "./cognition_adapter";
import { ExplainedCode, type ExplainerContent } from "./code_explainer";
import { basisProvenanceNote, bloomScoresOf, CHANNEL_AXES, dominantEmotion, simText, ToneRow, TONE_POLES } from "./cognitive_monitor";
import type { FoldState } from "./stream_fold";
import { EMBEDDINGS_UNCONFIGURED, embedTexts, fetchEntityEmbedding, isEmbeddingsUnconfigured } from "./stream_source";
import { CognitionWaveInline, EmbeddingsUnconfiguredNote, NamedBloom, useMonitorBloomSize, type ReplyFeed } from "./cognition_wave_inline";
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

export type Phase =
  | { name: "idle" } // primed for a pull, not yet run (the resting state)
  | { name: "scoring" }
  | { name: "ready"; samples: ScoredSample[]; warnings: string[] }
  | { name: "empty"; warnings: string[] }
  | { name: "error"; message: string; warnings: string[] }
  | { name: "unconfigured"; message: string };


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

/** THE ONE PULL for a home: starts `read` unless one is in flight (null then, nothing starts). A
 * read is kept for the page's life; a failed one (no embeddings, an error) is not, so the next press
 * tries again (after the route is set up, say). */
export function startCorpusRead(key: string, read: () => Promise<Phase>): Promise<Phase> | null {
  if (corpusInFlight(key)) return null;
  const pending = read();
  corpusReads.set(key, pending);
  void pending.then((done) => (done.name === "unconfigured" || done.name === "error" ? corpusReads.delete(key) : corpusReads.set(key, done)));
  return pending;
}

/** Before his words are read (each read of his book is recorded in his life, one marker per entry,
 * the transparency contract): the home's embedder and the embedding route, so a read that cannot
 * score never opens his book. null = go on; else the phase to show. */
export async function corpusPreflight(baseUrl: string, entity: string): Promise<Phase | null> {
  const home = await fetchEntityEmbedding(baseUrl, entity);
  // The door resolves no embedder: the embeddings route has none either (it answers 503).
  if (home && !home.resolved_embedder) return { name: "unconfigured", message: EMBEDDINGS_UNCONFIGURED };
  if (home?.match === "mismatch") {
    return { name: "error", message: `His memory is embedded with ${home.pin?.model_id ?? "another model"}, this gateway embeds with ${home.resolved_embedder}: his words cannot be read here.`, warnings: [] };
  }
  try {
    await embedTexts(baseUrl, ["a check of the embedding route"], home?.pin?.model_id ?? undefined);
  } catch (e) {
    if (isEmbeddingsUnconfigured(e)) return { name: "unconfigured", message: e.message };
    return { name: "error", message: (e as Error).message, warnings: [] };
  }
  return null;
}

/** The ⓘ's card (hover, focus or a long-press): what the monitor reads, the five tone channels with
 * their poles on one −1..+1 scale, and the basis it reads with. */
export function monitorAbout(provenance: string | null, calibration: string | null): ExplainerContent {
  return {
    code: "ⓘ",
    name: "cognitive monitor",
    color: "var(--text-dim)",
    summary: FRAMING,
    facts: CHANNEL_AXES.filter((a) => a.id in TONE_POLES).map((a) => ({
      label: a.name,
      value: `${TONE_POLES[a.id].positive[0]} (+1) to ${TONE_POLES[a.id].negative[0]} (−1)`,
    })),
    note: ["The bloom: how close his words are to each register. The tone channels: each from −1 to +1.", provenance, calibration].filter(Boolean).join(" "),
  };
}

/** The monitor's one short line (its height never depends on it; the full reason in the hover). */
export function MonitorState({ phase, source, conversation, nothingHere }: { phase: Phase; source: { baseUrl: string } | null; conversation: boolean; nothingHere: boolean }): React.ReactElement | null {
  if (!source) return <span className="cw_note">exported view: not read</span>;
  if (conversation) return null;
  if (phase.name === "scoring") return <span className="cw_note">reading…</span>;
  if (phase.name === "ready") return nothingHere ? <span className="cw_note">nothing said yet here</span> : null;
  if (phase.name === "empty") return <span className="cw_note" title={phase.warnings.join(" · ") || undefined}>nothing readable yet</span>;
  if (phase.name === "error") return <span className="cw_note cw_note_error" title={[phase.message, ...phase.warnings].join(" · ")}>could not read</span>;
  if (phase.name === "unconfigured") return <EmbeddingsUnconfiguredNote baseUrl={source.baseUrl} message={phase.message} className="cw_note cw_note_error" short />;
  return null;
}

/** Whether the monitor is on screen, so mounted: open, his page (not the roster), his content not
 * behind the content gate, and not beside the avatar view (which takes the whole main area). */
export function monitorShown(state: { open: boolean; locked: boolean; roster: boolean; avatar: boolean }): boolean {
  return state.open && !state.locked && !state.roster && !state.avatar;
}

export function CognitionWavePanel({ fold, source, scrubSeq, live, replyFeed }: CognitionWavePanelProps): React.ReactElement {
  const key = corpusKey(source);
  const [phase, setPhase] = useState<Phase>(() => keptCorpus(key));
  const [basis, setBasis] = useState<FrozenBasis | null>(null);
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

  // THE PRESS IS THE ACT (backlog 0032): opening the monitor (it mounts only then) starts the one
  // read of his words when this home has none kept; a position change never reads.
  useEffect(() => {
    if (keptCorpus(key).name === "idle") runScore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // THE ONE PULL (explicit operator act only: the press that opened the monitor). Reads a snapshot of the
  // current fold, harvests the entity's own words, embeds + scores once,
  // and caches the samples. A live/scrub fold change does NOT re-run this;
  // the operator re-reads on demand with the same button.
  const runScore = useCallback(() => {
    if (!source) return;
    const read = startCorpusRead(key, async (): Promise<Phase> => {
      try {
        // No embeddings (or another space): said at once, his book never opened.
        const stop = await corpusPreflight(source.baseUrl, source.entity);
        if (stop) return stop;
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
  const mood = useMemo(() => dominantEmotion(current?.emotions), [current]);
  // The ⓘ's hover: what this reads (never his inner state), and the basis it reads with.
  const about = useMemo(() => monitorAbout(provenance, calibration), [provenance, calibration]);
  const bloom = useMonitorBloomSize();

  return (
    <div className="cw_panel cw_compact" data-reading-state={conversation ? "conversation" : phase.name}>
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
        <div className="cm_body cw_reading">
          {/* Same input and labels as the conversation's reading: every register on the bloom (its
            * closest one in the hover), each tone channel with its signed score beside it. */}
          <div className="cm_canvas_box" style={{ width: bloom.box, height: bloom.canvas }} title={mood ? `closest to ${mood.axis.name} (${simText(mood.value)})` : undefined}>
            {/* The tree's labels back (backlog 0036): each register's name at its petal, its number under it. */}
            <NamedBloom size={bloom} scores={bloomScores} emotions={current?.emotions} />
          </div>
          <ToneRow scores={current?.scores} />
        </div>
      )}
      <div className="cw_state">
        <ExplainedCode className="cw_about" explain={about}>
          ⓘ
        </ExplainedCode>
        <MonitorState phase={phase} source={source} conversation={Boolean(conversation)} nothingHere={!current} />
      </div>
    </div>
  );
}
