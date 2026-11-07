/**
 * The CHAT tab's Cognitive Monitor — a proper, foldable panel (operator
 * 2026-07-15 pm). The DIAGRAM is now the kit's `AfCognitionBloom`
 * (co-designed component, c2242: nine registers incl. GRAVITY, morph-gated
 * breath, settledness-gated valence vignette, optional effort column); this
 * app owns the FEED (embed → scorer → register values), the header, the
 * DOM 3-letter code overlay with each value, and scroll-follow. No sentence
 * comments on the values (operator 2026-11-07).
 *
 * SCROLL-FOLLOW (operator): scrolling the chat up retunes the monitor to the
 * mood AT that message — the drawer reports the newest assistant reply
 * visible in the viewport (`focusReply`); each distinct text scores once
 * (embed-per-unique-text, cached). "as of" is labeled when not the latest.
 *
 * Honesty (unchanged): reads the expressive character of his WORDS, never
 * inner state; a known pin↔basis embedder mismatch renders NOTHING (sticky).
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AF_MEDIA } from "@abstractframework/ui-kit";
import {
  AfCognitionBloom,
  AfConductGauge,
  runningMedian,
  type ConductAxis,
  type ConductBaseline,
  type ConductFacts,
  type ConductToolCall,
} from "@abstractframework/ui-kit";

import { isUsableVector, readingFromScore } from "./cognition_adapter";
import { basisProvenanceNote, BloomAxisOverlay, bloomScoresOf, CONDUCT_AXES, conductCell, conductNow, dominantEmotion, MonitorInfoModal, simText, ToneRow, type AxisInfo } from "./cognitive_monitor";
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

const FOLD_KEY = "abstractentity_cogmon_fold_v1";

/** The monitor's first state: the viewer's remembered choice, else folded on
 * a phone (DESIGN §12 — the ~300 px bloom left a 393x852 phone ~6 transcript
 * lines) and open elsewhere. */
export function initialMonitorFolded(stored: string | null, phone: boolean): boolean {
  if (stored === "1") return true;
  if (stored === "0") return false;
  return phone;
}
/** Preferred square size; the pair SHRINKS to fit the rail side by side
 * (two fixed 190px squares overflowed the ~360px drawer and clipped the
 * bloom's letter codes). */
const BLOOM_SIZE = 190;
const MIN_SIZE = 132;

interface ScoredText {
  scores: Record<string, number>;
  emotions?: Record<string, number>;
  novelty?: number;
  /** The abstention gate's diagnostics, kept with the reading (readingFromScore);
   * the display prints each register's similarity instead. */
  emotionEvidence?: number;
  emotionMaxSim?: number;
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
export function EmbeddingsUnconfiguredNote({ baseUrl, message, className = "cm_err" }: { baseUrl: string; message: string; className?: string }): React.ReactElement {
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
    <span className={className} data-monitor-note="embeddings">
      {message}
      {gateway ? (
        <>
          {" "}
          <a href={embeddingsSetupUrl(gateway)} target="_blank" rel="noreferrer">
            Set up embeddings
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
  /** Per-text score cache (scroll-follow: each distinct reply embeds ONCE). */
  const readsRef = useRef<ScoringReads<ScoredText> | null>(null);
  if (!readsRef.current) readsRef.current = new ScoringReads<ScoredText>();
  /** Sticky: a KNOWN pin↔basis mismatch never retries. */
  const mismatchRef = useRef(false);

  const [status, setStatus] = useState<"idle" | "scoring" | "live" | "error" | "unavailable" | "unconfigured">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [current, setCurrent] = useState<ScoredText | null>(null);
  /** The loaded basis's provenance (whose words calibrated it) — the
   * tooltip and the (i) modal say it for THIS entity, never "his own". */
  const [calibratedOn, setCalibratedOn] = useState<Record<string, unknown> | null>(null);
  const [folded, setFolded] = useState<boolean>(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(FOLD_KEY);
    } catch {
      // presentation state only
    }
    let phone = false;
    try {
      phone = window.matchMedia(AF_MEDIA.sm).matches;
    } catch {
      // no matchMedia: the desktop default
    }
    return initialMonitorFolded(stored, phone);
  });
  const [modalAxis, setModalAxis] = useState<AxisInfo | "about" | null>(null);
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
  /** Fit the PAIR into the rail: both squares shrink together (min 132px)
   * so the side-by-side ruling holds at any drawer width. */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [pairSize, setPairSize] = useState(BLOOM_SIZE);
  useEffect(() => {
    // Re-arm whenever the body can have (re)appeared: the whole component
    // returns null until the first score lands, so a [folded]-only effect
    // armed against nothing and the pair never shrank (live miss).
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setPairSize(Math.max(MIN_SIZE, Math.min(BLOOM_SIZE, Math.floor((w - 14) / 2))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [folded, status]);

  // Written on the viewer's own toggle only: the phone default must not
  // become a stored choice that folds the monitor on the desktop too.
  const toggleFolded = () => {
    const next = !folded;
    setFolded(next);
    try {
      localStorage.setItem(FOLD_KEY, next ? "1" : "0");
    } catch {
      // presentation only
    }
  };

  const ensureSetup = () => {
    if (setupRef.current) return setupRef.current;
    const p = (async () => {
      const basis = await loadBasis();
      setCalibratedOn(basis.calibrated_on ?? {});
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
  /** Each conduct code's value and reason, shared by the code row and the axis window. */
  const conduct = useMemo(() => Object.fromEntries(CONDUCT_AXES.map((a) => [a.id, conductCell(gaugeAxes.find((g) => g.id === a.id), effort, tools)])), [gaugeAxes, effort, tools]);
  const calibration = calibratedOn ? basisProvenanceNote(calibratedOn) : null;

  // Nothing until a reply arrives. Failed or incompatible readings stay visible as such.
  if (status === "idle") return null;

  return (
    <div className={`cm_panel ${folded ? "cm_panel_folded" : ""}`} data-reading-state={status}>
      <div className="cm_head">
        <button className="cm_fold" onClick={toggleFolded} title={folded ? "Unfold the monitor" : "Fold the monitor (the chat keeps the room)"} aria-expanded={!folded}>
          {folded ? "▸" : "▾"}
        </button>
        <span className="cm_title">
          🧠 Cognitive Monitor
          {mood ? <span className="cm_mood_dot" style={{ background: mood.axis.color }} title={`closest to ${mood.axis.name} (${mood.axis.code} ${simText(mood.value)})`} /> : <span className="cm_mood_dot cm_mood_neutral" title="not read" />}
        </span>
        <button className="cm_info" onClick={() => setModalAxis("about")} title="What is this? How to read it">
          ⓘ
        </button>
        <span className="cm_subtitle" title="The monitor reads the expressive character of his words, not his inner state — a text performing calm scores calm. Full explanation behind the ⓘ.">
          his words, not his inner state
        </span>
        {!isLatest ? (
          <span className="cm_asof" title="The monitor is showing the mood at the message you scrolled to — scroll to the bottom for the latest.">
            as of {focusAt ? new Date(focusAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "an earlier message"}
          </span>
        ) : null}
        {status === "scoring" ? <span className="cm_reading">reading…</span> : null}
        {status === "error" || status === "unavailable" ? <span className="cm_err">{note || "unavailable"}</span> : null}
      </div>
      {/* Its own full-width line under the header (never squeezed into the title row). */}
      {status === "unconfigured" ? <EmbeddingsUnconfiguredNote baseUrl={baseUrl} message={note || ""} className="cm_err cm_note_line" /> : null}

      {!folded ? (
        // TWO WIDGETS SIDE BY SIDE (operator 2026-07-15 23:41/23:50):
        // (a) the mood/state bloom; (b) FOCUS & EFFORT — the mechanical
        // facts of the latest turn. No sentence, no right-hand legend, no
        // fact-card: every code carries its value, hover and click explain.
        <div className="cm_body" ref={bodyRef}>
          <div className="cm_canvas_box" style={{ width: pairSize }}>
            {status === "live" && current ? <>
              {/* Edge tint off (operator 2026-11-07): the kit reads values as intensities, which a
                * similarity scale is not. The breathing stays. */}
              <AfCognitionBloom scores={bloomScores} options={{ labels: false, vignette: false }} size={pairSize} />
              <BloomAxisOverlay width={pairSize} height={pairSize} onAxis={(a) => setModalAxis(a)} emotions={current.emotions} />
            </> : <div role="status" className="cm_reading_state" style={{ width: pairSize, height: pairSize, display: "grid", placeItems: "center", textAlign: "center", padding: "1rem", boxSizing: "border-box" }}>
              {status === "scoring" ? "Reading this reply…" : "This reply has not been scored."}
            </div>}
            {/* The five tone channels, each with its signed score (both poles show). */}
            {status === "live" && current ? <ToneRow scores={current.scores} onAxis={(a) => setModalAxis(a)} /> : null}
          </div>
          {/* Slot (b): uic's AfConductGauge v2.1 "THE STANCE" (posture
            * figure — breath+head size=effort, strokes=tools with violet
            * verify rings, root filaments=memories recalled, spine
            * alignment=rigor; idle breath keeps quiet turns alive). The
            * code row is OURS (operator dm#22 (a)-(c)): interactive
            * EFF/ACT/ATT/RIG spread across the full width, click = the
            * axis modal; the canvas draws no labels (labels:false — bloom
            * parity). Since 2026-08-01 each code carries its LIVE compact
            * value (the kit's `short`) — the operator's finding: EFF/RIG
            * encoded as motion/alignment alone were never perceived, so
            * every read now has a static numeric channel too. */}
          <div className="cm_gauge_box" style={{ width: pairSize }}>
            <AfConductGauge facts={effort ?? null} tools={tools ?? null} baseline={baseline} size={pairSize} labels={false} onAxes={setGaugeAxes} />
            <div className="cm_gauge_codes">
              {CONDUCT_AXES.map((a) => {
                const cell = conduct[a.id];
                return (
                  <button
                    key={a.id}
                    className="cm_gauge_code"
                    style={{ color: a.color }}
                    title={`${a.name}. ${conductNow(cell)} ${a.description}`}
                    onClick={() => setModalAxis(a)}
                  >
                    {a.code}
                    <span className="cm_gauge_val">{cell?.short ?? ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {modalAxis !== null ? <MonitorInfoModal axis={modalAxis} onClose={() => setModalAxis(null)} calibration={calibration} scores={current?.scores} emotions={current?.emotions} conduct={conduct} /> : null}
    </div>
  );
}
