/**
 * The Cognitive Monitor's shared vocabulary (operator 2026-07-15: "make it
 * useful, readable — a proper panel with a title, axis codes people can
 * understand, an (i) that explains it"). No sentence comments on the values
 * (operator 2026-11-07): every register, tone channel and conduct read shows
 * its number, or "—" when there is none. The codes are not clickable: a
 * 300 ms hover (keyboard focus, a long-press on touch) opens a small card
 * that says what the code measures and this reply's value or reason
 * (code_explainer.tsx).
 *
 * Honesty contract (uic's, unchanged): everything here reads the
 * EXPRESSIVE CHARACTER OF THE ENTITY'S WORDS — never inner state; the pole
 * words are about phrasing, deliberately never "he feels".
 *
 * The axis tables are DERIVED from the vendored uic vocabularies (one
 * source: core.js EMOTIONS/CHANNELS) — a drift test pins that every
 * vendored axis has a code + description here.
 */

import React from "react";
import { EMOTION_REGISTERS, type ConductAxis, type ConductFacts, type ConductToolCall } from "@abstractframework/ui-kit";

import { CHANNELS } from "./vendor/cognition/core";
import { ExplainedCode, type ExplainerContent } from "./code_explainer";
import "./cognitive_monitor.css";

export interface AxisInfo {
  id: string;
  /** 3-letter code — the compact handle used in the panel + diagram. */
  code: string;
  name: string;
  color: string;
  /** What this axis reads IN HIS WORDS (never inner state) — the (i) window's prose. */
  description: string;
  /** One plain sentence of what it measures — the code's hover card. */
  summary: string;
}

const channelColor = new Map(CHANNELS.map((c) => [c.id, c.color] as const));

function axis(id: string, code: string, name: string, color: string, description: string, summary: string): AxisInfo {
  return { id, code, name, color, description, summary };
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

/** One plain sentence per register for the hover card (what the petal's number measures). */
const EMOTION_SUMMARIES: Record<string, string> = {
  joy: "How close his words are to bright, pleased phrasing.",
  discovery: "How close his words are to the language of finding something out.",
  surprise: "How close his words are to phrasing that registers the unexpected.",
  anxiety: "How close his words are to worried phrasing, hedging under pressure.",
  fear: "How close his words are to threat language: danger, loss, being overwhelmed.",
  sadness: "How close his words are to low, heavy phrasing of loss or resignation.",
  gravity: "How close his words are to solemn, serious phrasing (grave, not sad).",
  calm: "How close his words are to settled, even phrasing.",
  tenderness: "How close his words are to gentle, caring phrasing.",
};

/** The bloom registers, DERIVED from the kit's EMOTION_REGISTERS (codes +
 * colors + circumplex order ship there — one contract source, c2242); we
 * add only the honest prose. Order matches the kit, so the diagram's petal
 * positions and this list stay the same geometry key. */
export const EMOTION_AXES: AxisInfo[] = EMOTION_REGISTERS.map((r) =>
  axis(r.id, r.code, r.label, r.color, EMOTION_DESCRIPTIONS[r.id] ?? r.label, EMOTION_SUMMARIES[r.id] ?? `How close his words are to ${r.label}.`),
);


/** The six scored channels. The five tone channels are drawn as the row under the bloom, each
 * with its signed score; each description names BOTH poles in the meaning of the generic anchor
 * texts that build the axis. CUR (the conversation's own main direction) is not drawn. */
export const CHANNEL_AXES: AxisInfo[] = [
  axis("warmth", "WAR", "warmth", channelColor.get("warmth") ?? "#8a94a6", "Warm (glad, grateful, at ease with the work) against discouraged (drained, stung, bitter) phrasing.", "Warm against discouraged phrasing, from −1 to +1."),
  axis("tension", "TSN", "tension", channelColor.get("tension") ?? "#8a94a6", "Urgent (pressed for time, attention jumping) against unhurried (no rush, at leisure) phrasing.", "Urgent against unhurried phrasing, from −1 to +1."),
  axis("reflection", "REF", "reflection", channelColor.get("reflection") ?? "#8a94a6", "Reflective (looking back at its own thinking, weighing) against matter-of-fact (the answer, the step, moving on) phrasing.", "Reflective against matter-of-fact phrasing, from −1 to +1."),
  axis("structure", "STR", "structure", channelColor.get("structure") ?? "#8a94a6", "Structured (premises, steps, cases) against loosely associative (images drifting into each other) phrasing.", "Structured against loosely associative phrasing, from −1 to +1."),
  axis("certainty", "CER", "certainty", channelColor.get("certainty") ?? "#8a94a6", "Assured ('I am sure, I have verified it') against hedging ('I might be wrong, it is hazy') phrasing.", "Assured against hedging phrasing, from −1 to +1."),
  axis("current", "CUR", "current", channelColor.get("current") ?? "#8a94a6", "The conversation's own main axis (its principal component) — how strongly this utterance rides the session's dominant direction.", "How strongly this reply rides the conversation's main direction."),
];

/** The conduct gauge's four reads (slot (b), uic's AfConductGauge c2474) —
 * codes/colors mirror the kit's conductAxes output exactly; we add the
 * honest prose (the (i) window) and one sentence each (the hover card). */
export const CONDUCT_AXES: AxisInfo[] = [
  axis("effort", "EFF", "effort", "#e7b45a", "How much work this turn cost — thinking wall time and output volume, relative to this visit's own median turn. Wall time is client-measured (send to reply, network included).", "How long this turn took, send to reply as this app measured it, against this visit's usual turn."),
  axis("action", "ACT", "action", "#5eead4", "What he DID before answering — tool rounds this turn (lookups, searches, acts), relative to the visit's median. Red ticks mark failed calls.", "How many tool calls he made before answering; ✕ counts the failed ones."),
  axis("attention", "ATT", "attention", "#6ea8d8", "How much of his life he brought to bear — memories recalled into this turn's context, relative to the visit's median; +N marks memories formed from the turn.", "How many memories were recalled into this turn; +N counts the memories formed from it."),
  axis("rigor", "RIG", "rigor", "#c084dd", "The verification-SHAPED share of his calls (read/check/search/diary-class names, retry-after-failure) — act-shaped evidence of care, honestly labeled: it measures the shape of his acts, never verified truth. Each verify-shaped call rings its stroke tip violet in the figure.", "The share of his tool calls that are verification-shaped (read, check, search), by their names."),
];

/** The radar's ONE fixed scale, the same for every reply (operator 2026-11-07: "a radar with
 * continuous values — we just represent the value, however small it is"; then chose this zoom over
 * the full −1..+1, which left ordinary replies 2–3 px apart): the kit's inner ring is RADAR_MIN, the
 * outer edge RADAR_MAX, linear in between; it spans every similarity measured on real replies. */
const RADAR_MIN = -0.25;
const RADAR_MAX = 0.75;

/** Where a register's similarity sits on the radar (0 = inner ring, 1 = outer edge). Nothing is
 * centred or rescaled per reply; a value beyond the scale sits on that edge (its number is still
 * printed beside the petal); a non-number sits on the inner ring and its label reads "—". */
export function radarValue(similarity: number | undefined): number {
  if (typeof similarity !== "number" || !Number.isFinite(similarity)) return 0;
  return Math.max(0, Math.min(1, (similarity - RADAR_MIN) / (RADAR_MAX - RADAR_MIN)));
}

/** What both mounts hand the kit's bloom: every register, explicitly (a missing key would keep
 * the previous reply's petal). */
export function bloomScoresOf(emotions: Record<string, number> | undefined): Record<string, number> {
  return Object.fromEntries(EMOTION_AXES.map(({ id }) => [id, radarValue(emotions?.[id])]));
}

/** A similarity rounded as the monitor prints and words it. */
export function roundSim(similarity: number): number {
  const r = Math.round(similarity * 100) / 100;
  return r === 0 ? 0 : r;
}

/** "0.12" / "−0.02" / "0.00": a similarity as the monitor prints it (true minus sign). */
export function simText(similarity: number): string {
  const r = roundSim(similarity);
  return (r < 0 ? "−" : "") + Math.abs(r).toFixed(2);
}

/** What the frozen basis is, from its own metadata (operator ruling 2026-11-07: the design is
 * generic, for ANY entity). The registers and the tone channels come from generic anchor texts,
 * the same for every entity; basis v1 re-fitted its normalization (whitening, channel scales,
 * emotion scale) and the emotion gate's floor on the mixed corpus its `calibrated_on` records.
 * Pure: says the recorded counts, entity and date, nothing else. */
export function basisProvenanceNote(calibratedOn: Record<string, unknown> | null | undefined): string {
  const c = calibratedOn ?? {};
  const count = (k: string) => (typeof c[k] === "number" && (c[k] as number) > 0 ? (c[k] as number) : 0);
  const entity = typeof c["entity"] === "string" ? (c["entity"] as string).trim() : "";
  // Exactly what the basis records: the field names' meaning, the counts, the entity, the date.
  const parts = [
    count("curated_arc") ? `${count("curated_arc")} curated texts` : null,
    count("anchor_texts") ? `${count("anchor_texts")} anchor texts` : null,
    count("castor_utterances") ? `${count("castor_utterances")} utterances${entity ? ` of ${entity}` : ""}` : null,
  ].filter(Boolean) as string[];
  const date = typeof c["date"] === "string" ? `, recorded ${c["date"]}` : "";
  const generic = "The registers and tone channels are generic: their prototypes come from generic anchor texts, the same for every entity.";
  if (!parts.length) return generic;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `${generic} Its normalization (whitening, channel scales) was fitted on a mixed corpus: ${list}${date}.`;
}

/**
 * Where a tone channel starts to speak (review 2026-11-07, finding 1). A channel score is
 * tanh((raw - median) / (1.5 MAD)) of the basis normalization, and real text is spread wide and
 * skewed on that scale (the median text of this home already scores warmth +0.58, reflection
 * -0.47), so fixed round cutoffs called a third of all texts "very" something. A channel's pole
 * word (on hover and in the axis window; the row always prints the score) is given only when the
 * reply sits in the outer 3% of a reference population on that side (plain word) or the outer 1%
 * (strong word); everything between is typical.
 *
 * Reference set: the channel scores of 1,599 texts from this home's embedding cache (2026-11-07),
 * committed as src/fixtures/tone_reference_scores.json (scores only: no texts, no vectors; source,
 * basis version and sha256 recorded there). It is "what this home embedded", not a curated corpus,
 * and it includes the repo's frozen fixture probes. With these cutoffs 74% of the set reads typical
 * on every channel and 9% gets a strong word (the previous round cutoffs: 0% and 81%).
 * scripts/derive_tone_cutoffs.mjs re-derives these numbers from that file; a test re-derives them
 * and must match exactly, so a hand edit or a drift fails. Re-cut after a basis change.
 *
 * Known limitation (pinned in a test): the frozen storm_caution_neutral fixture ("The forecast
 * mentions a storm; pack a warm layer …") reads "hedging": hazard-topic vocabulary projects onto the
 * certainty axis's hedging side (-0.958, beyond the -0.931 cutoff). By design about a quarter of
 * texts get at least one word (ten tails of 3%), so some such readings are expected.
 */
export const TONE_CUTOFFS = {
  basisVersion: "1.0.0",
  /** The reference set, said once wherever the percentages are shown. */
  reference: { label: "this home's embedding cache, 1,599 texts, 2026-11-07", count: 1599, scoresSha256: "44cb8095852d6f1f36b356bcabe572dbc6913360e4d2f0df3ad5123cda5097f3" },
  tails: { plain: 0.03, strong: 0.01 },
  channels: {
    warmth: { low: -0.879, lowStrong: -0.963, high: 0.975, highStrong: 0.989 },
    tension: { low: -0.909, lowStrong: -0.957, high: 0.907, highStrong: 0.948 },
    reflection: { low: -0.952, lowStrong: -0.968, high: 0.727, highStrong: 0.836 },
    structure: { low: -0.936, lowStrong: -0.961, high: 0.975, highStrong: 0.988 },
    certainty: { low: -0.931, lowStrong: -0.971, high: 0.855, highStrong: 0.917 },
  } as Record<string, { low: number; lowStrong: number; high: number; highStrong: number }>,
};

/** The words for each pole, in the meaning of the generic anchor texts that build the axis:
 * [plain, strong]. Words describe the phrasing, never inner state. */
export const TONE_POLES: Record<string, { positive: [string, string]; negative: [string, string] }> = {
  warmth: { positive: ["warm", "very warm"], negative: ["discouraged", "deeply discouraged"] },
  tension: { positive: ["urgent", "very urgent"], negative: ["unhurried", "entirely unhurried"] },
  reflection: { positive: ["reflective", "deeply reflective"], negative: ["matter-of-fact", "strictly matter-of-fact"] },
  structure: { positive: ["structured", "tightly structured"], negative: ["loosely associative", "very loosely associative"] },
  certainty: { positive: ["assured", "very assured"], negative: ["hedging", "heavily hedging"] },
};

/** -2/-1 = the negative pole's strong/plain tail, 0 = typical, 1/2 = the positive pole; null when
 * there is no finite reading for the channel. */
export type ToneTier = -2 | -1 | 0 | 1 | 2;
export function toneTier(channel: string, value: number | undefined): ToneTier | null {
  const k = TONE_CUTOFFS.channels[channel];
  if (!k || typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= k.lowStrong) return -2;
  if (value <= k.low) return -1;
  if (value >= k.highStrong) return 2;
  if (value >= k.high) return 1;
  return 0;
}

/** The tone words for one channel value, or null when it is typical or unread. */
export function toneWord(channel: string, value: number | undefined): string | null {
  const tier = toneTier(channel, value);
  const poles = TONE_POLES[channel];
  if (!poles || !tier) return null;
  return (tier > 0 ? poles.positive : poles.negative)[Math.abs(tier) - 1];
}

/** The register his words are closest to (its similarity, however small or negative); null only
 * when nothing was read. */
export function dominantEmotion(emotions: Record<string, number> | undefined): { axis: AxisInfo; value: number } | null {
  if (!emotions) return null;
  let best: { axis: AxisInfo; value: number } | null = null;
  for (const axis of EMOTION_AXES) {
    const v = emotions[axis.id];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (!best || v > best.value) best = { axis, value: v };
  }
  return best;
}

/** The five tone channels as a row under the bloom (the conduct gauge's code-and-value
 * pattern): each code prints its score in [−1, 1] as the registers print theirs ("—" when the
 * channel was not read). The pole word is on the code's hover card. */
export function ToneRow({ scores }: { scores: Record<string, number> | undefined }): React.ReactElement {
  // Each channel by its NAME (operator 2026-11-10 23:07, backlog 0036: no 3-letter code), the name
  // smaller than its value; the card on hover, focus or a long-press says what it measures.
  return (
    <div className="cm_tone_list" role="group" aria-label="Tone of the phrasing">
      {CHANNEL_AXES.filter((a) => a.id in TONE_POLES).map((a) => {
        const v = scores?.[a.id];
        return (
          <ExplainedCode key={a.id} className="cm_tone_item" style={{ color: a.color }} explain={toneExplainer(a, v)}>
            <span className="cm_tone_name">{a.name}</span>
            <span className="cm_tone_val">{typeof v === "number" && Number.isFinite(v) ? simText(v) : "—"}</span>
          </ExplainedCode>
        );
      })}
    </div>
  );
}

/** A register's hover card: what it measures and this reply's similarity. */
export function registerExplainer(a: AxisInfo, similarity: number | undefined): ExplainerContent {
  const read = typeof similarity === "number" && Number.isFinite(similarity);
  return {
    // No code anywhere (backlog 0036): the register goes by its name.
    code: "",
    name: a.name,
    color: a.color,
    summary: a.summary,
    facts: [{ label: "This reply", value: read ? simText(similarity) : "—" }],
    note: read ? `Similarity, on one scale for every reply: ${simText(RADAR_MIN)} at the inner ring, +${simText(RADAR_MAX)} at the outer edge.` : "No similarity was read for this reply.",
  };
}

/** A tone channel's hover card: what it measures, this reply's score and its pole word. */
export function toneExplainer(a: AxisInfo, value: number | undefined): ExplainerContent {
  const tier = toneTier(a.id, value);
  return {
    // The channel goes by its name (backlog 0036): its card carries no 3-letter code.
    code: "",
    name: a.name,
    color: a.color,
    summary: a.summary,
    facts: [{ label: "This reply", value: tier === null ? "—" : `${simText(value as number)} · ${toneWord(a.id, value) ?? "typical"}` }],
    note: tier === null ? "No score was read for this reply." : "A pole word is given only in the outer 3% of this home's texts on that side (the strong word in the outer 1%); otherwise typical.",
  };
}

/** What one conduct code shows (`short`: the kit's compact value, "—" when there is none) and
 * what its hover card says (`value`, and the `reason` behind a "—" or a bare figure). The kit's
 * reads pass through, with one correction to a reason: its rigor read says "zero calls this
 * turn" both when the turn made no calls and when no tool fact was served at all. The app knows
 * which (a served tool_rounds of 0 is a turn without calls). null before the gauge reports. */
export interface ConductCell {
  short: string;
  value: string;
  reason?: string;
}
const sentence = (t: string) => (t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}` : t);
export function conductCell(axis: ConductAxis | undefined, facts: ConductFacts | null | undefined, tools: ConductToolCall[] | null | undefined): ConductCell | null {
  if (!axis) return null;
  if (axis.id === "rigor" && !tools?.length) {
    const rounds = facts?.tool_rounds;
    const reason =
      rounds === 0
        ? "This turn made no tool calls; rigor reads the names of its calls."
        : typeof rounds === "number"
          ? `${rounds} tool round${rounds === 1 ? "" : "s"} counted, but no call names were served.`
          : "No tool facts were served for this turn.";
    return { short: "—", value: "—", reason };
  }
  return { short: axis.short, value: axis.text || "—", ...(axis.reason ? { reason: sentence(axis.reason) } : {}) };
}

/** A conduct code's hover card: what it measures and this turn's read or reason. */
export function conductExplainer(a: AxisInfo, cell: ConductCell | null | undefined): ExplainerContent {
  return {
    code: "",
    name: a.name,
    color: a.color,
    summary: a.summary,
    facts: [{ label: "This turn", value: cell?.value ?? "—" }],
    ...(cell ? (cell.reason ? { note: cell.reason } : {}) : { note: "Not read yet." }),
  };
}

/** How far a petal label keeps from the bloom's vertical centre line (px). */
const LABEL_AXIS_GAP = 3;

/** The CSS transform that centres a petal label on its anchor (x, y) in a box `width` wide, with
 * two bounds. (1) It never crosses the bloom's vertical centre line (width / 2): the two bottom
 * petals sit only ±20° off that line, so two centred signed numbers ("−0.08 −0.04") touched at the
 * 13–14 px type floor and overlapped on a phone; a label left of the line keeps its right edge
 * LABEL_AXIS_GAP short of it, one on the right its left edge. (2) It never leaves the box: the side
 * labels' numbers ran past the panel's edge. A label on the line (the top petal) stays centred; a
 * label far from both bounds is unaffected (the centred position wins). */
export function petalLabelTransform(x: number, width: number): string {
  const cx = width / 2;
  const dx = x - cx;
  if (Math.abs(dx) < 0.5) return "translate(-50%, -50%)";
  const px = (v: number) => `${v.toFixed(1)}px`;
  return dx < 0
    ? `translate(max(${px(-x)}, min(-50%, calc(${px(cx - LABEL_AXIS_GAP - x)} - 100%))), -50%)`
    : `translate(min(calc(${px(width - x)} - 100%), max(-50%, ${px(cx + LABEL_AXIS_GAP - x)})), -50%)`;
}

/** Petal-anchor overlay: each register's NAME at its petal position over the
 * canvas (backlog 0036: no 3-letter code; DOM, not canvas — each name's hover
 * card explains it). A box wider than tall keeps the ring by its height and
 * gives the side names room. The
 * anchors mirror the vendored Bloom renderer's label anchors; no label
 * crosses the vertical centre line (petalLabelTransform). */
export function BloomAxisOverlay({ width, height, emotions }: { width: number; height: number; /** The shown reply's similarities: each code carries its number. */ emotions?: Record<string, number> }): React.ReactElement | null {
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
        const sim = emotions?.[a.id];
        const num = typeof sim === "number" && Number.isFinite(sim) ? simText(sim) : "—";
        return (
          <ExplainedCode key={a.id} className="cm_overlay_code" style={{ left: x, top: y, color: a.color, transform: petalLabelTransform(x, width) }} explain={registerExplainer(a, sim)}>
            {a.name}
            {emotions ? <span className="cm_overlay_num">{num}</span> : null}
          </ExplainedCode>
        );
      })}
    </div>
  );
}
