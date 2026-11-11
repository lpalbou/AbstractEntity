/**
 * THE COGNITIVE MONITOR, inside the timeline and always on (operator 2026-11-11 02:00, backlog 0040:
 * "remove the cognitive monitor button and let it always on"; the five channel readings stacked above
 * Live and the transport, next to the lanes, "then to the right, the radar"; "goal: no empty space").
 * Two places in the timeline's grid (MonitorReading): the tone channels in the middle column, the
 * bloom with its nine register names in the last column, the block's full height. No title, no
 * framing block, no button: the basis and the framing are the ⓘ's hover. One read of his words per
 * entity, started once his life has loaded (kept for the page's life); the timeline drives what it
 * shows:
 * - LIVE with his conversation open in the chat: the reply in view, read per message as it lands
 *   (cognition_wave_inline.tsx, fed by the chat drawer's ReplyFeed).
 * - Otherwise: his words at the position drawn (the play head every frame while playing), the
 *   utterance formed at or before its seq, LOOKED UP in that one read (sampleAt), never read again.
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

import { automaticReadItems, foldOfRows, readItemId, scoreEntityUtterances, stablePicks, type ScoredSample } from "./cognition_adapter";
import { scoreStore, type ScoreStore } from "./cognition_score_cache";
import type { ExplainerContent } from "./code_explainer";
import { basisProvenanceNote, CHANNEL_AXES, TONE_POLES } from "./cognitive_monitor";
import type { FoldState } from "./stream_fold";
import { EMBEDDINGS_UNCONFIGURED, embedTexts, fetchEntityEmbedding, isEmbeddingsUnconfigured } from "./stream_source";
import { CognitionWaveInline, EmbeddingsUnconfiguredNote, MonitorReading, type ReplyFeed } from "./cognition_wave_inline";
import { createScorer, type FrozenBasis } from "./vendor/cognition/cognition_scorer";

// The frozen basis is ~190 KB of numbers; lazy-load it so first paint never
// waits for it (the monitor loads it once mounted).
// Cached after the first load. When the kit package ships, this becomes a normal
// import from the package (still code-splittable).
async function loadBasis(): Promise<FrozenBasis> {
  // v1 (2026-08-01): cut on HIS real utterances — see cognition_wave_inline's
  // loadBasis note; both mounts must load the SAME basis (one instrument).
  const mod = await import("./vendor/cognition/data/basis_v1.json");
  return (mod.default ?? mod) as unknown as FrozenBasis;
}

export interface CognitionWavePanelProps {
  /** His whole life's fold, read at pull time: the one read covers every position, whatever the
   * position when it starts (the page's own fold is the state AT its position). */
  lifeFold: () => FoldState;
  /** His life has loaded (the read waits for it: a read of a half-loaded life would be kept). */
  ready: boolean;
  /** Gateway base + entity; null on an exported file (scoring needs the
   * gateway embeddings route + operator doors). */
  source: { baseUrl: string; entity: string } | null;
  /** The position drawn (journal seq; the play head while playing): the monitor shows the utterance
   * formed at or before it — cognition, graph and discussion correlate on one axis. */
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

/** The corpus read, kept per gateway + entity for the page's life: a return to his page must not cost
 * his words another read. A read in flight is its promise (a remount while scoring waits on it).
 * Never evicted: one entry per home visited, one ~120-sample corpus each. */
const corpusReads = new Map<string, Phase | Promise<Phase>>();
export const corpusKey = (source: { baseUrl: string; entity: string } | null): string => (source ? `${source.baseUrl}\u0000${source.entity}` : "");

/** What the monitor shows for a home on mounting: the kept read, "scoring" while one is in flight,
 * else the resting state. */
export function keptCorpus(key: string): Phase {
  const kept = corpusReads.get(key);
  return kept === undefined ? { name: "idle" } : kept instanceof Promise ? { name: "scoring" } : kept;
}

/** The read in flight for a home (a remount waits on it), or null. */
export function corpusInFlight(key: string): Promise<Phase> | null {
  const kept = corpusReads.get(key);
  return kept instanceof Promise ? kept : null;
}

/** THE ONE PULL for a home: starts `read` unless one is in flight (null then, nothing starts). A
 * read is kept for the page's life; a failed one (no embeddings, an error) is not, so the next visit
 * to his page tries again (after the route is set up, say). */
export function startCorpusRead(key: string, read: () => Promise<Phase>): Promise<Phase> | null {
  if (corpusInFlight(key)) return null;
  const pending = read();
  corpusReads.set(key, pending);
  void pending.then((done) => (done.name === "unconfigured" || done.name === "error" ? corpusReads.delete(key) : corpusReads.set(key, done)));
  return pending;
}

/** Before his words are read (only when a pick is not scored yet): the home's embedder and the
 * embedding route, so a read that cannot score reads no record. null = go on; else the phase to show. */
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

/** THE AUTOMATIC READ (review round 6b F4: performance first, the ledger stays honest): his replies
 * and moments, never his diary (automaticReadItems: no diary door, so nothing is written in his
 * life), at most `limit` of them at stable picks over his life (stablePicks: a new record adds a pick
 * at the end, the rest stay); a pick already scored in this browser comes from the score cache, so
 * only new picks are read (the plain record route) and embedded. Nothing new: no request at all (not
 * even the preflight). */
export async function readLife(source: { baseUrl: string; entity: string }, fold: FoldState, basis: FrozenBasis, store: ScoreStore, limit = 120): Promise<Phase> {
  const picks = stablePicks(automaticReadItems(fold), limit);
  const missing = picks.filter((row) => !store.get(readItemId(row)));
  const warnings: string[] = [];
  const fresh = new Map<string, ScoredSample>();
  if (missing.length > 0) {
    // No embeddings (or another space): said at once, no record read.
    const stop = await corpusPreflight(source.baseUrl, source.entity);
    if (stop && missing.length === picks.length) return stop;
    if (stop) warnings.push(`${missing.length} newer records not read: ${"message" in stop ? stop.message : stop.name}`);
    else {
      const scorer = createScorer(basis, {
        embedderId: basis.embedder_id,
        ...(typeof basis.abstention_floor === "number" ? { abstention: { floor: basis.abstention_floor } } : {}),
      });
      const res = await scoreEntityUtterances(source.baseUrl, source.entity, foldOfRows(fold, missing), scorer);
      warnings.push(...res.warnings);
      for (const s of res.samples) fresh.set(s.id, s);
    }
  }
  const samples = picks.map((row) => fresh.get(readItemId(row)) ?? store.get(readItemId(row))).filter((s): s is ScoredSample => s !== undefined);
  if (fresh.size > 0) store.save(samples);
  // In the order of his life (sampleAt takes the last one formed at or before a position).
  samples.sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity));
  return samples.length === 0 ? { name: "empty", warnings } : { name: "ready", samples, warnings };
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
    note: [
      "It reads his replies and moments, not his diary: up to 120 through his life, each at the moment it formed, and live, each reply of his. The bloom: how close his words are to each register. The tone channels: each from −1 to +1.",
      provenance,
      calibration,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/** What the replay's reading says, in one short line each (the block's height never depends on it;
 * the full reason in the hover): `instead` takes the bloom's place when no bloom can be drawn (an
 * exported view, no embeddings, a failed read); `note` sits over the bloom (reading…, nothing
 * readable yet, nothing said yet here). */
export function monitorLines(phase: Phase, source: { baseUrl: string } | null, nothingHere: boolean): { instead: React.ReactElement | null; note: React.ReactElement | null } {
  if (!source) return { instead: <span className="cw_note">exported view: not read</span>, note: null };
  if (phase.name === "unconfigured") return { instead: <EmbeddingsUnconfiguredNote baseUrl={source.baseUrl} message={phase.message} className="cw_note cw_note_error" short />, note: null };
  if (phase.name === "error") return { instead: <span className="cw_note cw_note_error" title={[phase.message, ...phase.warnings].join(" · ")}>could not read</span>, note: null };
  if (phase.name === "scoring") return { instead: null, note: <span className="cw_note">reading…</span> };
  if (phase.name === "empty") return { instead: null, note: <span className="cw_note" title={phase.warnings.join(" · ") || undefined}>nothing readable yet</span> };
  if (phase.name === "ready" && nothingHere) return { instead: null, note: <span className="cw_note">nothing said yet here</span> };
  return { instead: null, note: null };
}

/** Whether the monitor is mounted: always on his page (backlog 0040), unless his content is behind
 * the content gate (it reads his words). */
export function monitorShown(state: { locked: boolean; roster: boolean }): boolean {
  return !state.locked && !state.roster;
}

export function CognitionWavePanel({ lifeFold, ready, source, scrubSeq, live, replyFeed }: CognitionWavePanelProps): React.ReactElement {
  const key = corpusKey(source);
  const [phase, setPhase] = useState<Phase>(() => keptCorpus(key));
  const [basis, setBasis] = useState<FrozenBasis | null>(null);
  const feed = useSyncExternalStore(replyFeed.subscribe, replyFeed.get, replyFeed.get);

  // His life's fold is read AT PULL TIME from a ref — NEVER a scoring-effect
  // dependency. This is THE flood fix (agency c2155): the fold is a fresh
  // object on every replay envelope (live tail) and every scrub, so an
  // effect keyed on it re-ran the whole harvest — ~120 diary/episode door
  // reads EACH — continuously while the old Wave tab was open (~995 gateway
  // hits in 3 min + diary_read marker pollution). The c1824 ruling is ONE
  // pull, never per-render sampling: the harvest fires once per home, when
  // his life has loaded, over his whole life.
  const lifeFoldRef = useRef(lifeFold);
  lifeFoldRef.current = lifeFold;
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
  // monitor; nothing is read or scored by it.
  useEffect(() => {
    let alive = true;
    void loadBasis().then((b) => alive && setBasis(b));
    return () => {
      alive = false;
    };
  }, []);

  // Switching entity (or losing the gateway) shows THAT mind's kept read, or
  // the resting state — never carries one mind's wave onto another (the new
  // one is read once its life has loaded, below). A read in flight lands
  // when it ends.
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

  // ALWAYS ON (backlog 0040): once his life has loaded, the one read of his words starts when this
  // home has none kept; a position change never reads (the effect is keyed by the home and the load).
  useEffect(() => {
    if (ready && keptCorpus(key).name === "idle") runScore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  // THE ONE PULL (once per home, when his life has loaded): readLife over his whole life's fold (his
  // replies and moments, stable picks, the browser's score cache), kept for the page's life. A
  // live/scrub fold change does NOT re-run this.
  const runScore = useCallback(() => {
    if (!source) return;
    const read = startCorpusRead(key, async (): Promise<Phase> => {
      try {
        const b = await loadBasis();
        return await readLife(source, lifeFoldRef.current(), b, scoreStore(source, b.version));
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
  // corpus; samples are chronological, seqs are formation anchors), so a
  // scrub or each frame of a 100x replay is a lookup and the bloom morphs to
  // it. A position BEFORE any utterance selects nothing — showing the first
  // one there would display words not yet spoken at that point.
  const samples = phase.name === "ready" ? phase.samples : null;
  const current = useMemo(() => (samples ? sampleAt(samples, scrubSeq) : null), [samples, scrubSeq]);

  // LIVE, his conversation open in the chat: the reply in view, per message.
  const conversation = live && source && feed && (feed.focusReply ?? feed.latestReply) ? feed : null;

  // The ⓘ's hover: what this reads (never his inner state), and the basis it reads with.
  const about = useMemo(() => monitorAbout(provenance, calibration), [provenance, calibration]);

  if (conversation && source) {
    // Per message, in the same places: each distinct reply is read once (cached), the reply scrolled
    // to retunes it.
    return (
      <CognitionWaveInline
        baseUrl={source.baseUrl}
        entity={source.entity}
        about={about}
        latestReply={conversation.latestReply}
        focusReply={conversation.focusReply}
        focusAt={conversation.focusAt}
        effort={conversation.effort}
        effortKey={conversation.effortKey}
        tools={conversation.tools}
      />
    );
  }
  const { instead, note } = monitorLines(phase, source, !current);
  return <MonitorReading state={phase.name} emotions={current?.emotions} scores={current?.scores} instead={instead} note={note} about={about} />;
}
