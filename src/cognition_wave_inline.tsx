/**
 * The Cognitive Monitor's reading of HIS CONVERSATION, per message: the live
 * part of the monitor inside the timeline (cognition_wave_panel.tsx;
 * operator 2026-11-10, backlogs 0018 and 0032: "the cognitive monitor lives
 * at the bottom with the temporal replay, evolving with the replay and per
 * message, so nothing of it at the top"). The DIAGRAM is the kit's
 * `AfCognitionBloom` (co-designed component, c2242: nine registers incl.
 * GRAVITY, morph-gated breath, settledness-gated valence vignette, optional
 * effort column); this app owns the FEED (embed → scorer → register values),
 * the DOM 3-letter code overlay with each value, and scroll-follow. No
 * sentence comments on the values (operator 2026-11-07).
 *
 * THE FEED (createReplyFeed): the chat drawer publishes the reply in view —
 * the newest assistant reply, or the one scrolled to (`focusReply`) — into a
 * small store; only the open monitor subscribes, so a closed monitor costs
 * no render and no read. Each distinct text scores once (embed-per-unique-
 * text, cached). "as of" is labeled when not the latest.
 *
 * Honesty (unchanged): reads the expressive character of his WORDS, never
 * inner state; a known pin↔basis embedder mismatch renders NOTHING (sticky).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AF_MEDIA,
  useAfMedia,
  AfCognitionBloom,
  AfConductGauge,
  runningMedian,
  type ConductAxis,
  type ConductBaseline,
  type ConductFacts,
  type ConductToolCall,
} from "@abstractframework/ui-kit";

import { isUsableVector, readingFromScore } from "./cognition_adapter";
import { BloomAxisOverlay, bloomScoresOf, CONDUCT_AXES, conductCell, conductExplainer, dominantEmotion, simText, ToneRow } from "./cognitive_monitor";
import { ExplainedCode } from "./code_explainer";
import { embeddingsSetupUrl, embedTexts, fetchEntityEmbedding, isEmbeddingsUnconfigured } from "./stream_source";
import { proxyConnectionStatus } from "./gateway_session";
import { createScorer, type FrozenBasis, type VendorScorer } from "./vendor/cognition/cognition_scorer";
import { ScoringReads } from "./cognition_reads";

async function loadBasis(): Promise<FrozenBasis> {
  // v1 (2026-08-01): the generic registers and channels (anchor-text
  // prototypes, the same for every entity) with whitening statistics and
  // the abstention floor re-fitted on a mixed corpus (curated arc + anchor
  // texts + 74 real replies). Ships GRV (nine registers); v0 stays beside
  // it (the gate tests pin it).
  const mod = await import("./vendor/cognition/data/basis_v1.json");
  return (mod.default ?? mod) as unknown as FrozenBasis;
}

/** The reply in view in his open conversation, as the chat drawer publishes it (null: no
 * conversation open in the chat). */
export interface ReplyFeedValue {
  latestReply: string | null;
  focusReply: string | null;
  focusAt: string | null;
  effort: ConductFacts | null;
  effortKey: string | null;
  tools: ConductToolCall[] | null;
}

/** The chat drawer → monitor channel: the drawer sets, the open monitor subscribes. A set equal
 * field by field to the current value notifies nobody. */
export interface ReplyFeed {
  get(): ReplyFeedValue | null;
  set(value: ReplyFeedValue | null): void;
  subscribe(listener: () => void): () => void;
}

export function createReplyFeed(): ReplyFeed {
  let value: ReplyFeedValue | null = null;
  const listeners = new Set<() => void>();
  const same = (a: ReplyFeedValue | null, b: ReplyFeedValue | null): boolean =>
    a === b ||
    (a !== null &&
      b !== null &&
      a.latestReply === b.latestReply &&
      a.focusReply === b.focusReply &&
      a.focusAt === b.focusAt &&
      a.effort === b.effort &&
      a.effortKey === b.effortKey &&
      a.tools === b.tools);
  return {
    get: () => value,
    set(next) {
      if (same(value, next)) return;
      value = next;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
/** The bloom inside the timeline (backlog 0036, "better use the space given"): its canvas (the kit
 * draws the petals within 0.38 of it, so a 150 px canvas is a ~114 px bloom) and a box wider than
 * tall for the register names around it. The conduct gauge with its names beside it. */
const BLOOM = { canvas: 150, box: 210 };
const BLOOM_PHONE = { canvas: 120, box: 160 };
const GAUGE = 72;

/** The bloom's canvas and box for this screen. */
export function useMonitorBloomSize(): { canvas: number; box: number } {
  return useAfMedia(AF_MEDIA.sm) ? BLOOM_PHONE : BLOOM;
}

/** The bloom, its register names around it (the box's height is the canvas's). */
export function NamedBloom({ size, scores, emotions }: { size: { canvas: number; box: number }; scores: Record<string, number>; emotions: Record<string, number> | undefined }): React.ReactElement {
  return (
    <>
      <div className="cm_bloom_canvas" style={{ left: (size.box - size.canvas) / 2 }}>
        {/* Edge tint off (operator 2026-11-07): the kit reads values as intensities, which a
          * similarity scale is not. The breathing stays. */}
        <AfCognitionBloom scores={scores} options={{ labels: false, vignette: false }} size={size.canvas} />
      </div>
      <BloomAxisOverlay width={size.box} height={size.canvas} emotions={emotions ?? {}} />
    </>
  );
}

interface ScoredText {
  scores: Record<string, number>;
  emotions?: Record<string, number>;
  novelty?: number;
  /** The abstention gate's diagnostics, kept with the reading (readingFromScore);
   * the display prints each register's similarity instead. */
  emotionEvidence?: number;
  emotionMaxSim?: number;
}

/** The score caches, one per gateway + entity for the page's life: the monitor mounts only while
 * open, and a reply already read is never embedded again; another home never shares one. */
const HOME_READS = new Map<string, ScoringReads<ScoredText>>();
function homeReads(baseUrl: string, entity: string): ScoringReads<ScoredText> {
  const key = JSON.stringify([baseUrl, entity]);
  let reads = HOME_READS.get(key);
  if (!reads) HOME_READS.set(key, (reads = new ScoringReads<ScoredText>()));
  return reads;
}

export interface CognitionWaveInlineProps {
  baseUrl: string;
  entity: string;
  /** The newest assistant reply text; null before the first reply. */
  latestReply: string | null;
  /** The assistant reply the operator is LOOKING AT (scroll-follow) — the
   * newest one visible in the thread viewport. Falls back to latestReply
   * when absent/at-bottom. */
  focusReply?: string | null;
  /** Timestamp label for focusReply when it is not the latest ("as of"). */
  focusAt?: string | null;
  /** The latest turn's mechanical conduct facts — slot (b)'s feed
   * (uic's AfConductGauge, adopted c2474; the interim app widget is
   * retired). Absent fields never zero-fake. */
  effort?: ConductFacts | null;
  /** Stable per-TURN key for the baseline deposit (adversary P2: the facts
   * object re-mints per render — identity dedup triple-counted turns). */
  effortKey?: string | null;
  /** The turn's tool calls (name + ok when known) — the gauge's ACT/RIG
   * inputs (toolCallsOf). */
  tools?: ConductToolCall[] | null;
}

/** A turn's tool calls for the conduct gauge, from the turn report: every
 * `tool_details` entry (with `ok` from its `success`, served by the visit
 * lane's ledger fold since 2026-07-18; absent = unknown, never ok), then the
 * `tools_ran` names no detail covers. null when the turn ran none. */
export function toolCallsOf(detail: { tools_ran?: string[]; tool_details?: Array<{ name: string; success?: boolean }> }): ConductToolCall[] | null {
  const details = detail.tool_details ?? [];
  const calls: ConductToolCall[] = details.map((t) => (typeof t.success === "boolean" ? { name: t.name, ok: t.success } : { name: t.name }));
  for (const name of detail.tools_ran ?? []) if (!details.some((t) => t.name === name)) calls.push({ name });
  return calls.length ? calls : null;
}

/** "Embeddings are not configured on this gateway, …" + the console page that sets the route.
 * Behind the app's proxy (`baseUrl` = "") the console lives on the proxied
 * gateway, whose address the proxy's connection status names. */
export function EmbeddingsUnconfiguredNote({ baseUrl, message, className = "cm_err", short = false }: { baseUrl: string; message: string; className?: string; /** The monitor's one short line (its height never depends on its note): the sentence in the hover. */ short?: boolean }): React.ReactElement {
  const [proxied, setProxied] = useState("");
  useEffect(() => {
    if (baseUrl.trim()) return;
    let alive = true;
    void proxyConnectionStatus().then((s) => alive && setProxied(s.gatewayUrl.trim()));
    return () => {
      alive = false;
    };
  }, [baseUrl]);
  const gateway = baseUrl.trim() || proxied;
  return (
    <span className={className} data-monitor-note="embeddings" title={short ? message : undefined}>
      {short ? "no embeddings" : message}
      {gateway ? (
        <>
          {short ? " · " : " "}
          <a href={embeddingsSetupUrl(gateway)} target="_blank" rel="noreferrer">
            {short ? "set up" : "Set up embeddings"}
          </a>
        </>
      ) : null}
    </span>
  );
}

export function CognitionWaveInline(props: CognitionWaveInlineProps): React.ReactElement {
  // A gateway/entity switch must never inherit another home's score cache, pin or conduct baseline.
  return <CognitionWaveSession key={JSON.stringify([props.baseUrl, props.entity])} {...props} />;
}

function CognitionWaveSession({ baseUrl, entity, latestReply, focusReply, focusAt, effort, effortKey, tools }: CognitionWaveInlineProps): React.ReactElement | null {
  const scorerRef = useRef<VendorScorer | null>(null);
  const embedderRef = useRef<string | null>(null);
  const setupRef = useRef<Promise<void> | null>(null);
  /** Per-text score cache (scroll-follow: each distinct reply embeds ONCE), kept per home across
   * the monitor's mounts (it closes, the timeline leaves Live and comes back). */
  const readsRef = useRef<ScoringReads<ScoredText> | null>(null);
  if (!readsRef.current) readsRef.current = homeReads(baseUrl, entity);
  /** Sticky: a KNOWN pin↔basis mismatch never retries. */
  const mismatchRef = useRef(false);

  const [status, setStatus] = useState<"idle" | "scoring" | "live" | "error" | "unavailable" | "unconfigured">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [current, setCurrent] = useState<ScoredText | null>(null);
  /** Live axis readings from the gauge (values/reasons for the code-row
   * tooltips — the kit reports them via onAxes). */
  const [gaugeAxes, setGaugeAxes] = useState<ConductAxis[]>([]);
  /** Session baseline for the conduct gauge (uic's contract: consumer-owned
   * running medians of our OWN turn history — the arcs read relative to
   * this visit, never an invented absolute). */
  const historyRef = useRef<{ think_ms: number[]; tokens_out: number[]; tool_rounds: number[]; memories_recalled: number[] }>({
    think_ms: [],
    tokens_out: [],
    tool_rounds: [],
    memories_recalled: [],
  });
  const lastEffortKeyRef = useRef<string | null>(null);
  /** The baseline the CURRENT turn is read against — PRIOR turns only,
   * frozen at deposit time. Both halves matter (adversary 2026-08-01): a
   * self-inclusive median pinned a steady cadence's EFF at exactly 0.5
   * forever (v/(2·median-of-values-including-v)), and recomputing after the
   * deposit made the same turn's reading CHANGE between renders. Turn 1 has
   * no baseline — the gauge downgrades honestly ("first turns"). */
  const baselineRef = useRef<ConductBaseline>({});
  const baseline = useMemo<ConductBaseline>(() => {
    const h = historyRef.current;
    // One deposit per TURN, keyed (adversary P2): object identity re-mints
    // per render, so identity dedup triple-counted the same turn's facts
    // into the running medians and skewed every relative arc.
    const key = effortKey ?? null;
    if (effort && key && key !== lastEffortKeyRef.current) {
      lastEffortKeyRef.current = key;
      const med = (xs: number[]) => (xs.length ? runningMedian(xs) : undefined);
      baselineRef.current = { think_ms: med(h.think_ms), tokens_out: med(h.tokens_out), tool_rounds: med(h.tool_rounds), memories_recalled: med(h.memories_recalled) };
      if (typeof effort.think_ms === "number") h.think_ms.push(effort.think_ms);
      if (typeof effort.tokens_out === "number") h.tokens_out.push(effort.tokens_out);
      if (typeof effort.tool_rounds === "number") h.tool_rounds.push(effort.tool_rounds);
      if (typeof effort.memories_recalled === "number") h.memories_recalled.push(effort.memories_recalled);
    }
    return baselineRef.current;
  }, [effort, effortKey]);

  const ensureSetup = () => {
    if (setupRef.current) return setupRef.current;
    const p = (async () => {
      const basis = await loadBasis();
      let embedderId = basis.embedder_id;
      try {
        const emb = await fetchEntityEmbedding(baseUrl, entity);
        if (emb?.pin?.model_id) embedderId = emb.pin.model_id;
      } catch {
        /* unreadable pin — proceed with the basis id, the scorer still guards */
      }
      if (embedderId !== basis.embedder_id) {
        throw Object.assign(new Error(`home embedder ${embedderId} ≠ basis ${basis.embedder_id}`), { mismatch: true });
      }
      embedderRef.current = embedderId;
      // The gate floor rides the basis when calibrated (v1: 0.0798); a
      // floor-less basis keeps the scorer's default. A factual reply often
      // sits below it (no clear emotion); its tone channels still read.
      scorerRef.current = createScorer(basis, {
        embedderId,
        ...(typeof basis.abstention_floor === "number" ? { abstention: { floor: basis.abstention_floor } } : {}),
      });
    })();
    p.catch((e: { mismatch?: boolean }) => {
      if (e.mismatch) mismatchRef.current = true; // sticky — never retry a space mismatch
      else setupRef.current = null; // transient — allow retry on the next reply
    });
    setupRef.current = p;
    return p;
  };

  // THE TEXT IN VIEW: focusReply (scroll position) wins; latestReply is the
  // at-bottom default. Score it once, cache forever, retune the bloom.
  const shownText = (focusReply ?? latestReply ?? "").trim();
  const isLatest = shownText === (latestReply || "").trim();
  useEffect(() => {
    if (!shownText) { setCurrent(null); setStatus("idle"); setNote(null); return; }
    if (mismatchRef.current) {
      setCurrent(null); setStatus("unavailable");
      setNote("This entity uses a different embedding model. Its words cannot be read by this monitor.");
      return;
    }
    const reads = readsRef.current!;
    const cached = reads.get(shownText);
    if (cached) { setCurrent(cached); setStatus("live"); setNote(null); return; }
    // Never leave the previous reply's bloom beneath a new reply's “reading” label.
    setCurrent(null);
    setStatus("scoring");
    setNote(null);
    return reads.subscribe(shownText, async () => {
      await ensureSetup();
      const res = await embedTexts(baseUrl, [shownText], embedderRef.current ?? undefined);
      const vec = res.vectors[0];
      if (!isUsableVector(vec)) throw new Error("No usable embedding was returned for this reply (empty or all zeros).");
      if (embedderRef.current && res.model && res.model !== embedderRef.current) {
        throw new Error(`The reply's embedding model (${res.model}) differs from the entity's pinned model.`);
      }
      return readingFromScore(scorerRef.current!.score(vec));
    }, (entry) => {
      setCurrent(entry); setStatus("live"); setNote(null);
    }, (e) => {
      if ((e as { mismatch?: boolean }).mismatch) {
        setStatus("unavailable");
        setNote("This entity uses a different embedding model. Its words cannot be read by this monitor.");
      } else if (isEmbeddingsUnconfigured(e)) {
        setStatus("unconfigured"); setNote(e.message);
      } else {
        setStatus("error"); setNote(e instanceof Error ? e.message : String(e));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownText, baseUrl, entity]);

  // Every register at its measured similarity on the radar's one fixed scale (bloomScoresOf
  // sends all nine explicitly; a register the basis lacks sits on the inner ring, its label "—").
  const bloomScores = useMemo(() => bloomScoresOf(current?.emotions), [current]);
  const mood = useMemo(() => dominantEmotion(current?.emotions), [current]);
  const bloom = useMonitorBloomSize();
  /** Each conduct code's value and reason: the row prints `short`, the hover card the rest. */
  const conduct = useMemo(() => Object.fromEntries(CONDUCT_AXES.map((a) => [a.id, conductCell(gaugeAxes.find((g) => g.id === a.id), effort, tools)])), [gaugeAxes, effort, tools]);

  // Nothing until a reply arrives. Failed or incompatible readings stay visible as such.
  if (status === "idle") return null;

  return (
    <div className="cm_panel cm_compact" data-reading-state={status}>
      {/* THE READING, compact (backlog 0032): the bloom (its closest register in the hover), the tone
        * channels with their signed scores, and FOCUS & EFFORT, the mechanical facts of the latest
        * turn (uic's AfConductGauge; every code carries its value, a 300 ms hover or a long-press opens
        * its card). No sentence comments on the values. */}
      <div className="cm_body">
        <div
          className="cm_canvas_box"
          style={{ width: bloom.box, height: bloom.canvas }}
          title={mood ? `closest to ${mood.axis.name} (${simText(mood.value)})` : undefined}
        >
          {status === "live" && current ? (
            <NamedBloom size={bloom} scores={bloomScores} emotions={current.emotions} />
          ) : (
            <div role="status" className="cm_reading_state" style={{ width: bloom.box, height: bloom.canvas, display: "grid", placeItems: "center", textAlign: "center", boxSizing: "border-box" }}>
              {status === "scoring" ? "reading…" : "not read"}
            </div>
          )}
        </div>
        {/* The five tone channels, each with its signed score (both poles show). */}
        {status === "live" && current ? <ToneRow scores={current.scores} /> : null}
        <div className="cm_gauge_box">
          <AfConductGauge facts={effort ?? null} tools={tools ?? null} baseline={baseline} size={GAUGE} labels={false} onAxes={setGaugeAxes} />
          <div className="cm_gauge_codes">
            {CONDUCT_AXES.map((a) => {
              const cell = conduct[a.id];
              return (
                <ExplainedCode key={a.id} className="cm_gauge_code" style={{ color: a.color }} explain={conductExplainer(a, cell)}>
                  <span className="cm_gauge_name">{a.name}</span>
                  <span className="cm_gauge_val">{cell?.short ?? ""}</span>
                </ExplainedCode>
              );
            })}
          </div>
        </div>
      </div>
      <div className="cm_head">
        {!isLatest ? (
          <span className="cm_asof" title="The monitor is showing the mood at the message you scrolled to — scroll to the bottom for the latest.">
            as of {focusAt ? new Date(focusAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "an earlier message"}
          </span>
        ) : null}
        {status === "error" || status === "unavailable" ? (
          <span className="cm_err" title={note || undefined}>
            not read
          </span>
        ) : null}
        {status === "unconfigured" ? <EmbeddingsUnconfiguredNote baseUrl={baseUrl} message={note || ""} className="cm_err" short /> : null}
      </div>
    </div>
  );
}
