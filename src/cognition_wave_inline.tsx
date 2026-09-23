/**
 * The CHAT tab's Cognitive Monitor — a proper, foldable panel (operator
 * 2026-07-15 pm). The DIAGRAM is now the kit's `AfCognitionBloom`
 * (co-designed component, c2242: nine registers incl. GRAVITY, morph-gated
 * breath, settledness-gated valence vignette, optional effort column); this
 * app owns the FEED (embed → scorer → register values), the header, the
 * interpretation sentence, the DOM 3-letter code overlay, and scroll-follow.
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
import {
  AfCognitionBloom,
  AfConductGauge,
  runningMedian,
  type ConductAxis,
  type ConductBaseline,
  type ConductFacts,
  type ConductToolCall,
} from "@abstractframework/ui-kit";

import { BloomAxisOverlay, CONDUCT_AXES, dominantEmotion, evidenceNote, evidenceTitle, MonitorInfoModal, type AxisInfo } from "./cognitive_monitor";
import { embedTexts, fetchEntityEmbedding } from "./stream_source";
import { createScorer, type FrozenBasis, type VendorScorer } from "./vendor/cognition/cognition_scorer";

async function loadBasis(): Promise<FrozenBasis> {
  // v1 (2026-08-01): cut on HIS real utterances (74 door-read episode
  // replies + diary entries + the curated arc) — the v0 provenance's
  // promised re-cut. Ships GRV (nine registers) and a corpus-calibrated
  // abstention floor; v0 stays beside it (the gate tests pin it).
  const mod = await import("./vendor/cognition/data/basis_v1.json");
  return (mod.default ?? mod) as unknown as FrozenBasis;
}

const FOLD_KEY = "abstractentity_cogmon_fold_v1";
/** Preferred square size; the pair SHRINKS to fit the rail side by side
 * (two fixed 190px squares overflowed the ~360px drawer and clipped the
 * bloom's letter codes). */
const BLOOM_SIZE = 190;
const MIN_SIZE = 132;

interface ScoredText {
  scores: Record<string, number>;
  emotions?: Record<string, number>;
  novelty?: number;
  /** The abstention gate's diagnostics (adversarial finding 2026-08-01:
   * dropping these made honest-quiet pixel-identical to broken — the panel
   * now SAYS why a bloom is flat). */
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
   * inputs. */
  tools?: ConductToolCall[] | null;
}

export function CognitionWaveInline({ baseUrl, entity, latestReply, focusReply, focusAt, effort, effortKey, tools }: CognitionWaveInlineProps): React.ReactElement | null {
  const scorerRef = useRef<VendorScorer | null>(null);
  const embedderRef = useRef<string | null>(null);
  const setupRef = useRef<Promise<void> | null>(null);
  /** Per-text score cache (scroll-follow: each distinct reply embeds ONCE). */
  const cacheRef = useRef<Map<string, ScoredText>>(new Map());
  const inflightRef = useRef<Set<string>>(new Set());
  /** Sticky: a KNOWN pin↔basis mismatch never retries. */
  const mismatchRef = useRef(false);

  const [status, setStatus] = useState<"idle" | "scoring" | "live" | "error" | "unavailable">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [current, setCurrent] = useState<ScoredText | null>(null);
  const [folded, setFolded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FOLD_KEY) === "1";
    } catch {
      return false;
    }
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

  useEffect(() => {
    try {
      localStorage.setItem(FOLD_KEY, folded ? "1" : "0");
    } catch {
      // presentation only
    }
  }, [folded]);

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
      // The gate floor rides the basis when calibrated (v1: p20 of his own
      // corpus's nearest-register sims — mild leans fade in, noise stays
      // dark); a floor-less basis keeps the scorer's default.
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
    if (!shownText || mismatchRef.current) return;
    const cached = cacheRef.current.get(shownText);
    if (cached) {
      setCurrent(cached);
      setStatus("live");
      return;
    }
    if (inflightRef.current.has(shownText)) return;
    inflightRef.current.add(shownText);
    let cancelled = false;
    // Unconditional (adversary nit 2026-08-01): the old `idle`-only flip
    // meant "reading…" never showed again after the first score — later
    // texts scored silently behind a stale "live" header.
    setStatus("scoring");
    (async () => {
      try {
        await ensureSetup();
        const scorer = scorerRef.current!;
        const res = await embedTexts(baseUrl, [shownText], embedderRef.current ?? undefined);
        const vec = res.vectors[0];
        if (!Array.isArray(vec) || vec.length === 0) {
          if (!cancelled) {
            setStatus("error");
            setNote("no vector for the reply");
          }
          return;
        }
        if (embedderRef.current && res.model && res.model !== embedderRef.current) {
          if (!cancelled) {
            setStatus("error");
            setNote(`embedder mismatch (${res.model} ≠ pin)`);
          }
          return;
        }
        const scored = scorer.score(vec);
        const entry: ScoredText = {
          scores: scored.scores,
          emotions: scored.emotions,
          novelty: scored.novelty,
          emotionEvidence: scored.emotionEvidence,
          emotionMaxSim: scored.emotionMaxSim,
        };
        cacheRef.current.set(shownText, entry);
        if (cancelled) return;
        setCurrent((prev) => ((focusReply ?? latestReply ?? "").trim() === shownText ? entry : prev));
        setStatus("live");
        setNote(null);
      } catch (e) {
        if (cancelled) return;
        if ((e as { mismatch?: boolean }).mismatch) {
          setStatus("unavailable");
        } else {
          setStatus("error");
          setNote((e as Error).message.slice(0, 80));
        }
      } finally {
        inflightRef.current.delete(shownText);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownText, baseUrl, entity]);

  // The bloom's `scores` prop is keyed by REGISTER id (the emotion values);
  // absent keys keep their target (the kit's absent-not-zero rule), so an
  // 8-emotion v0 basis leaves the 9th (gravity) petal flat until the basis
  // ships it. Explicit 0 lowers a petal, so we send every known register.
  const bloomScores = useMemo(() => current?.emotions ?? {}, [current]);
  const mood = useMemo(() => dominantEmotion(current?.emotions), [current]);
  /** The honest quiet/faint caption (null when the bloom has real reach or
   * the diagnostics are absent — old cache entries predate them). */
  const quiet = evidenceNote(current?.emotionEvidence);

  // Discreet: nothing until the first reply arrives; nothing at all for a
  // home whose embedder space the basis can't score.
  if (status === "idle" || status === "unavailable") return null;

  return (
    <div className={`cm_panel ${folded ? "cm_panel_folded" : ""}`}>
      <div className="cm_head">
        <button className="cm_fold" onClick={() => setFolded((v) => !v)} title={folded ? "Unfold the monitor" : "Fold the monitor (the chat keeps the room)"} aria-expanded={!folded}>
          {folded ? "▸" : "▾"}
        </button>
        <span className="cm_title">
          🧠 Cognitive Monitor
          {mood ? <span className="cm_mood_dot" style={{ background: mood.axis.color }} title={`leaning ${mood.axis.name}`} /> : <span className="cm_mood_dot cm_mood_neutral" title="even" />}
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
        {status === "error" ? <span className="cm_err">{note || "unavailable"}</span> : null}
      </div>

      {!folded ? (
        // TWO WIDGETS SIDE BY SIDE (operator 2026-07-15 23:41/23:50):
        // (a) the mood/state bloom; (b) FOCUS & EFFORT — the mechanical
        // facts of the shown turn. The sentence, the right-hand legend
        // and the old fact-card are gone (the in-bloom codes carry the
        // hover explanations). Slot (b) is an interim app-side widget;
        // uic's kit component swaps in when it ships (commons#2469).
        <div className="cm_body" ref={bodyRef}>
          <div className="cm_canvas_box" style={{ width: pairSize }}>
            <AfCognitionBloom scores={bloomScores} options={{ labels: false, vignette: true }} size={pairSize} />
            <BloomAxisOverlay width={pairSize} height={pairSize} onAxis={(a) => setModalAxis(a)} />
            {/* The abstention gate, SAID (adversarial finding 2026-08-01):
              * a flat bloom was pixel-identical to a broken one. The scorer
              * ships evidence diagnostics for exactly this — hover explains
              * the gate with the live numbers. */}
            {quiet ? (
              <div className="cm_quiet" title={evidenceTitle(current?.emotionEvidence, current?.emotionMaxSim)}>
                {quiet}
              </div>
            ) : null}
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
                const live = gaugeAxes.find((g) => g.id === a.id);
                return (
                  <button
                    key={a.id}
                    className="cm_gauge_code"
                    style={{ color: a.color }}
                    title={`${a.name} — ${a.description}${live?.text && live.text !== "—" ? ` NOW: ${live.text}.` : ""}${live?.reason ? ` (${live.reason})` : ""}`}
                    onClick={() => setModalAxis(a)}
                  >
                    {a.code}
                    <span className="cm_gauge_val">{live?.short ?? ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {modalAxis !== null ? <MonitorInfoModal axis={modalAxis} onClose={() => setModalAxis(null)} /> : null}
    </div>
  );
}
