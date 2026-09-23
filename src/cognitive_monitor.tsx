/**
 * The Cognitive Monitor's shared vocabulary + interpretation layer
 * (operator 2026-07-15: "make it useful, readable — a proper panel with a
 * title, axis codes people can understand, an (i) that explains it, and a
 * human-readable interpretation of the state").
 *
 * Honesty contract (uic's, unchanged): everything here reads the
 * EXPRESSIVE CHARACTER OF THE ENTITY'S WORDS — never inner state. The
 * interpreter below verbalizes the SHAPE of the scores; its sentences are
 * about phrasing and lean, deliberately never "he feels".
 *
 * The axis tables are DERIVED from the vendored uic vocabularies (one
 * source: core.js EMOTIONS/CHANNELS) — a drift test pins that every
 * vendored axis has a code + description here.
 */

import React, { useEffect } from "react";
import { EMOTION_REGISTERS } from "@abstractframework/ui-kit";

import { CHANNELS } from "./vendor/cognition/core";

export interface AxisInfo {
  id: string;
  /** 3-letter code — the compact handle used in the panel + diagram. */
  code: string;
  name: string;
  color: string;
  /** What this axis reads IN HIS WORDS (never inner state). */
  description: string;
}

const channelColor = new Map(CHANNELS.map((c) => [c.id, c.color] as const));

function axis(id: string, code: string, name: string, color: string, description: string): AxisInfo {
  return { id, code, name, color, description };
}

/** Honest per-register descriptions (keyed by id). The CODES, COLORS, and
 * ORDER are the kit's (EMOTION_REGISTERS — the contract's single source,
 * incl. GRAVITY at the ninth petal); we only add the prose. A register the
 * kit ships without a description here falls back to its label. */
const EMOTION_DESCRIPTIONS: Record<string, string> = {
  joy: "Bright, pleased phrasing — delight, warmth toward the moment, celebration in the words.",
  discovery: "The language of finding something — curiosity paying off, new ground named, 'oh, THIS is how it works'.",
  surprise: "Words registering the unexpected — a turn the text did not see coming, recalibration mid-sentence.",
  anxiety: "Worry in the phrasing — hedging under pressure, concern about what might go wrong, tight forward-looking language.",
  fear: "Strong threat language — words about danger, loss, or being overwhelmed. A spike here deserves a look at the actual text.",
  sadness: "Low, heavy phrasing — loss, resignation, things that did not go as hoped.",
  gravity: "Solemn weight — the words take something seriously, sit with how large a question is. Grave, NOT sad (the register your operator's introspective replies actually want).",
  calm: "Settled, even language — measured sentences, nothing pulling at the tone.",
  tenderness: "Gentle, caring phrasing — warmth toward someone or something, softness in how things are named.",
};

/** The bloom registers, DERIVED from the kit's EMOTION_REGISTERS (codes +
 * colors + circumplex order ship there — one contract source, c2242); we
 * add only the honest prose. Order matches the kit, so the diagram's petal
 * positions and this list stay the same geometry key. */
export const EMOTION_AXES: AxisInfo[] = EMOTION_REGISTERS.map((r) =>
  axis(r.id, r.code, r.label, r.color, EMOTION_DESCRIPTIONS[r.id] ?? r.label),
);

/** Circumplex weights for the tone clause, from the kit registers. */
const CIRCUMPLEX = EMOTION_REGISTERS.map((r) => ({ id: r.id, vx: r.vx, ay: r.ay }));

/** The six scored channels (not drawn as petals; they feed the
 * interpretation line + the info modal). */
export const CHANNEL_AXES: AxisInfo[] = [
  axis("warmth", "WAR", "warmth", channelColor.get("warmth") ?? "#8a94a6", "How warm vs cool the register of the words is."),
  axis("tension", "TSN", "tension", channelColor.get("tension") ?? "#8a94a6", "Strain in the phrasing — conflict, pressure, friction between ideas."),
  axis("reflection", "REF", "reflection", channelColor.get("reflection") ?? "#8a94a6", "Inward-looking language — thinking about thinking, weighing, reconsidering."),
  axis("structure", "STR", "structure", channelColor.get("structure") ?? "#8a94a6", "How organized the words are — lists, steps, tight argument vs loose association."),
  axis("certainty", "CER", "certainty", channelColor.get("certainty") ?? "#8a94a6", "Assertion vs hedging — 'it is' language against 'it might be' language."),
  axis("current", "CUR", "current", channelColor.get("current") ?? "#8a94a6", "The conversation's own main axis (its principal component) — how strongly this utterance rides the session's dominant direction."),
];

/** The conduct gauge's four reads (slot (b), uic's AfConductGauge c2474) —
 * codes/colors mirror the kit's conductAxes output exactly; we add the
 * honest prose the operator asked to reach by hover + click (dm#22 (a)). */
export const CONDUCT_AXES: AxisInfo[] = [
  axis("effort", "EFF", "effort", "#e7b45a", "How much work this turn cost — thinking wall time and output volume, relative to this visit's own median turn. Wall time is client-measured (send to reply, network included)."),
  axis("action", "ACT", "action", "#5eead4", "What he DID before answering — tool rounds this turn (lookups, searches, acts), relative to the visit's median. Red ticks mark failed calls."),
  axis("attention", "ATT", "attention", "#6ea8d8", "How much of his life he brought to bear — memories recalled into this turn's context, relative to the visit's median; +N marks memories formed from the turn."),
  axis("rigor", "RIG", "rigor", "#c084dd", "The verification-SHAPED share of his calls (read/check/search/diary-class names, retry-after-failure) — act-shaped evidence of care, honestly labeled: it measures the shape of his acts, never verified truth. Each verify-shaped call rings its stroke tip violet in the figure."),
];

/**
 * The bloom's QUIET states, verbalized (adversarial finding 2026-08-01: the
 * scorer ships emotionEvidence/emotionMaxSim diagnostics precisely so mounts
 * can say WHY a bloom is flat, and both mounts dropped them — an honest
 * abstention was pixel-identical to a broken widget). Tiers follow the
 * gate's own geometry (evidence = clamp01((maxSim - floor)/ramp)): ~0 is a
 * full abstention, the low band is a damped read. Pure + tested.
 */
export function evidenceNote(evidence: number | undefined): string | null {
  if (typeof evidence !== "number" || !Number.isFinite(evidence)) return null;
  if (evidence <= 0.02) return "quiet — his words sit near no emotional register";
  if (evidence < 0.35) return "faint — weak emotional evidence, petals damped";
  return null;
}

/** The (i)-level explanation of the quiet state, shared by both mounts'
 * tooltips (one sentence, honest: abstention is the design, not a fault). */
export function evidenceTitle(evidence: number | undefined, maxSim: number | undefined): string {
  const nums = [
    typeof evidence === "number" ? `evidence ${evidence.toFixed(2)}` : null,
    typeof maxSim === "number" ? `nearest-register similarity ${maxSim.toFixed(2)}` : null,
  ].filter(Boolean).join(", ");
  return `The evidence gate: petals show only when his words land near SOME register prototype in embedding space${nums ? ` (${nums})` : ""}. A quiet bloom is honest abstention — far-from-every-register words show nothing rather than a confident wrong reading. The gate's floor is calibrated on his own corpus (basis v1): typical task replies stay quiet, his warmer or heavier moments fade in.`;
}

export interface WaveSampleLike {
  emotions?: Record<string, number>;
  scores?: Record<string, number>;
  novelty?: number;
}

/** The dominant emotion (id + value) or null when the shape is flat. */
export function dominantEmotion(emotions: Record<string, number> | undefined): { axis: AxisInfo; value: number } | null {
  if (!emotions) return null;
  let best: { axis: AxisInfo; value: number } | null = null;
  for (const axis of EMOTION_AXES) {
    const v = Math.max(0, emotions[axis.id] ?? 0);
    if (!best || v > best.value) best = { axis, value: v };
  }
  return best && best.value >= 0.18 ? best : null;
}

/**
 * PRE-COMPUTED MEANING (operator's ask): a deterministic, rule-based
 * verbalization of what the diagram currently shows — so the shape always
 * arrives with a human-readable sentence. Describes the WORDS' expressive
 * character (shape, lean, phrasing), never inner state. Pure + tested.
 */
export function interpretWave(sample: WaveSampleLike | null): string {
  if (!sample) return "Nothing scored yet — the monitor reads his replies as they arrive.";
  const emotions = sample.emotions ?? {};
  const scores = sample.scores ?? {};

  // ---- rank both vocabularies; the STRONGEST signal leads the sentence
  // (investigation 2026-07-15 16:11: an introspective reply scored
  // reflection=0.83 / sadness=0.48 — the old order led with the weak
  // emotion and read as a wrong "sadness" verdict; the dominant signal
  // was reflective prose all along). ----------------------------------
  const ranked = EMOTION_AXES.map((axis) => ({ axis, v: Math.max(0, emotions[axis.id] ?? 0) })).sort((a, b) => b.v - a.v);
  const top = ranked[0];
  const second = ranked[1];
  const tension = scores.tension ?? 0;
  const certainty = scores.certainty ?? 0;
  const reflection = scores.reflection ?? 0;
  const structure = scores.structure ?? 0;

  // Candidate channel clauses carry a SALIENCE so the strongest signal is
  // the one that speaks (a 0.83 reflection must beat a 0.12-certainty
  // hedge — magnitude decides, not a fixed priority list).
  const channelCandidates: Array<{ ok: boolean; salience: number; text: string }> = [
    { ok: tension >= 0.6, salience: tension, text: "tension runs high in the phrasing" },
    { ok: reflection >= 0.65, salience: reflection, text: "deeply reflective, inward-looking prose" },
    { ok: structure >= 0.65, salience: structure, text: "tightly structured — lists and steps, not loose association" },
    { ok: certainty >= 0.7, salience: certainty, text: "the phrasing is confident, assertive" },
    { ok: certainty > 0 && certainty <= 0.3, salience: 0.6 - certainty, text: "the phrasing hedges — little is asserted flatly" },
  ];
  const chosenChannel = channelCandidates.filter((c) => c.ok).sort((a, b) => b.salience - a.salience)[0] ?? null;
  const channelClause = (): string | null => chosenChannel?.text ?? null;

  // Emotion clause with STRENGTH-HONEST verbs: a 0.4 lean is a tilt, not a
  // verdict (the v0 curated basis maps introspective gravity toward SAD —
  // a weak rectified lean must never read as "he is sad").
  const emotionClause = (): string | null => {
    if (!top || top.v < 0.18) return null;
    const verb = top.v >= 0.75 ? "lean strongly toward" : top.v >= 0.45 ? "lean" : "tilt mildly toward";
    const thread = second && second.v >= 0.2 && second.v >= top.v * 0.6 ? ` with a thread of ${second.axis.name} (${second.axis.code})` : "";
    return `the words ${verb} ${top.axis.name} (${top.axis.code})${thread}`;
  };

  const clauses: string[] = [];
  const ch = channelClause();
  const em = emotionClause();
  const channelDominates = chosenChannel !== null && (!top || chosenChannel.salience > top.v);
  if (channelDominates && ch) {
    clauses.push(ch.charAt(0).toUpperCase() + ch.slice(1));
    if (em) clauses.push(em);
  } else if (em) {
    clauses.push(em.charAt(0).toUpperCase() + em.slice(1));
    if (ch) clauses.push(ch);
  } else {
    clauses.push("An even, quiet bloom — no single feeling pulls at the words");
    if (ch) clauses.push(ch);
  }

  // ---- tone clause: valence × energy from the circumplex ---------------
  let sum = 0;
  let vx = 0;
  let ay = 0;
  for (const e of CIRCUMPLEX) {
    const v = Math.max(0, emotions[e.id] ?? 0);
    sum += v;
    vx += v * e.vx;
    ay += v * e.ay;
  }
  if (sum > 1e-6) {
    const valence = vx / sum;
    const energy = ay / sum;
    const tone: string[] = [];
    if (valence > 0.25) tone.push("bright");
    else if (valence < -0.25) tone.push("strained");
    if (energy > 0.3) tone.push("energized");
    else if (energy < -0.3) tone.push("settled");
    if (tone.length > 0) clauses.push(`the register reads ${tone.join(" and ")}`);
  }

  // ---- wandering (session-relative, labeled as such) --------------------
  if (typeof sample.novelty === "number" && sample.novelty >= 0.5) {
    clauses.push("and it wanders off the conversation's usual ground (session-relative)");
  }

  return `${clauses.join("; ")}.`;
}

/** What the monitor IS — the (i) modal body, shared by the chat panel and
 * the Wave tab. Axis = null shows the general explanation; an axis shows
 * its detail. */
export function MonitorInfoModal({ axis, onClose }: { axis: AxisInfo | null | "about"; onClose(): void }): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isAbout = axis === "about" || axis === null;
  return (
    <div
      className="ev_backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cm_modal" role="dialog" aria-label={isAbout ? "About the Cognitive Monitor" : `Axis: ${(axis as AxisInfo).name}`}>
        {isAbout ? (
          <>
            <div className="cm_modal_head">
              <span className="cm_modal_title">🧠 Cognitive Monitor</span>
              <button className="cm_modal_close" onClick={onClose} title="Close">✕</button>
            </div>
            <div className="cm_modal_body">
              <p>
                <strong>Two instruments, side by side.</strong> LEFT — the mood bloom — reads the{" "}
                <strong>expressive character of his words</strong>, never his inner state (a text performing calm scores
                calm). Each reply is embedded with the home's own pinned embedder and scored against a frozen basis of
                expressive registers; the petal's reach is that register's strength, so a spike toward FEA is threat
                language you see before reading a number.
              </p>
              <p>
                <strong>A flat bloom is usually honest abstention, not a fault:</strong> an evidence gate scales every
                register by how near the words land to ANY register prototype — words far from every register show
                NOTHING rather than a confident wrong reading. The panel says so under the bloom ("quiet" / "faint")
                with the live evidence number; expect a lot of quiet on the curated-only v0 basis until one is cut on
                his real utterances.
              </p>
              <p>
                RIGHT — the conduct gauge — reads the <strong>mechanical facts of the same turn</strong> as a standing
                figure: effort is the breath and the head's size, action is one stroke per tool call (red tip = failed
                call, violet ring = verify-shaped call — the RIG count made visible), attention is one root filament
                per memory recalled (green buds = memories formed), rigor is the spine's alignment. Reads are relative
                to this visit's own median turn, never an invented absolute; a dashed stub means the fact is absent
                (never zero-faked), and the code row under the figure always carries the live numbers.
              </p>
              <p>
                <strong>How they help together:</strong> the bloom shows how the words FEEL; the gauge shows what the
                turn COST and how carefully it was built. A bright, calm bloom over a zero-effort gauge reads
                differently than the same bloom over deep recall and verification-shaped calls.
              </p>
              <div className="cm_modal_axes">
                <span className="cm_modal_axes_head">The bloom's registers (left)</span>
                {EMOTION_AXES.map((a) => (
                  <div key={a.id} className="cm_modal_axis">
                    <span className="cm_axis_code" style={{ color: a.color }}>{a.code}</span>
                    <span className="cm_axis_name">{a.name}</span>
                    <span className="cm_axis_desc">{a.description}</span>
                  </div>
                ))}
                <span className="cm_modal_axes_head">The conduct gauge's reads (right)</span>
                {CONDUCT_AXES.map((a) => (
                  <div key={a.id} className="cm_modal_axis">
                    <span className="cm_axis_code" style={{ color: a.color }}>{a.code}</span>
                    <span className="cm_axis_name">{a.name}</span>
                    <span className="cm_axis_desc">{a.description}</span>
                  </div>
                ))}
                <span className="cm_modal_axes_head">The scored channels (behind the bloom)</span>
                {CHANNEL_AXES.map((a) => (
                  <div key={a.id} className="cm_modal_axis">
                    <span className="cm_axis_code" style={{ color: a.color }}>{a.code}</span>
                    <span className="cm_axis_name">{a.name}</span>
                    <span className="cm_axis_desc">{a.description}</span>
                  </div>
                ))}
              </div>
              <p className="cm_modal_note">
                Basis: v1 (2026-08-01) — calibrated on his real utterances (episode replies + diary entries, door-read)
                plus the curated arc; the nine registers include GRV and the quiet-gate floor comes from his own
                corpus. Scoring is an explicit read of his words through the gateway; nothing here writes to his memory.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="cm_modal_head">
              <span className="cm_modal_title">
                <span className="cm_axis_code" style={{ color: (axis as AxisInfo).color }}>{(axis as AxisInfo).code}</span> {(axis as AxisInfo).name}
              </span>
              <button className="cm_modal_close" onClick={onClose} title="Close">✕</button>
            </div>
            <div className="cm_modal_body">
              <p>{(axis as AxisInfo).description}</p>
              <p className="cm_modal_note">Read from his words only — a register of the text, not a window into inner state.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The compact axis list beside the diagram: code + name, hover for the
 * description, click for the modal. */
export function AxisList({ emotions, onAxis }: { emotions: Record<string, number> | undefined; onAxis(axis: AxisInfo): void }): React.ReactElement {
  return (
    <div className="cm_axes" role="list" aria-label="Monitor axes">
      {EMOTION_AXES.map((a) => {
        const v = Math.max(0, emotions?.[a.id] ?? 0);
        return (
          <button key={a.id} className="cm_axis_row" role="listitem" title={`${a.name} — ${a.description}`} onClick={() => onAxis(a)}>
            <span className="cm_axis_code" style={{ color: a.color, opacity: 0.55 + Math.min(0.45, v) }}>
              {a.code}
            </span>
            <span className="cm_axis_name">{a.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Petal-anchor overlay: the 3-letter codes AT their petal positions over
 * the canvas (DOM, not canvas — native tooltips + click-to-explain). The
 * geometry mirrors the vendored Bloom renderer's label anchors. */
export function BloomAxisOverlay({ width, height, onAxis }: { width: number; height: number; onAxis(axis: AxisInfo): void }): React.ReactElement | null {
  if (width < 40 || height < 40) return null;
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.min(width, height) * 0.4;
  const lr = R * 0.92 + 10;
  const m = EMOTION_AXES.length;
  return (
    <div className="cm_overlay" aria-hidden="false" style={{ width, height }}>
      {EMOTION_AXES.map((a, i) => {
        const ang = (i / m) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(ang) * lr;
        const y = cy + Math.sin(ang) * lr;
        return (
          <button
            key={a.id}
            className="cm_overlay_code"
            style={{ left: x, top: y, color: a.color }}
            title={`${a.name} — ${a.description}`}
            onClick={() => onAxis(a)}
          >
            {a.code}
          </button>
        );
      })}
    </div>
  );
}
