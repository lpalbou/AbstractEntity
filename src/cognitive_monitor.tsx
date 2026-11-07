/**
 * The Cognitive Monitor's shared vocabulary (operator 2026-07-15: "make it
 * useful, readable — a proper panel with a title, axis codes people can
 * understand, an (i) that explains it"). No sentence comments on the values
 * (operator 2026-11-07): every register, tone channel and conduct read shows
 * its number; words (a tone pole, a reason) live on hover and click.
 *
 * Honesty contract (uic's, unchanged): everything here reads the
 * EXPRESSIVE CHARACTER OF THE ENTITY'S WORDS — never inner state; the pole
 * words are about phrasing, deliberately never "he feels".
 *
 * The axis tables are DERIVED from the vendored uic vocabularies (one
 * source: core.js EMOTIONS/CHANNELS) — a drift test pins that every
 * vendored axis has a code + description here.
 */

import React, { useEffect } from "react";
import { EMOTION_REGISTERS, type ConductAxis, type ConductFacts, type ConductToolCall } from "@abstractframework/ui-kit";

import { CHANNELS } from "./vendor/cognition/core";
import "./cognitive_monitor.css";

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


/** The six scored channels. The five tone channels are drawn as the row under the bloom, each
 * with its signed score; each description names BOTH poles in the meaning of the generic anchor
 * texts that build the axis. CUR belongs to the Wave tab. */
export const CHANNEL_AXES: AxisInfo[] = [
  axis("warmth", "WAR", "warmth", channelColor.get("warmth") ?? "#8a94a6", "Warm (glad, grateful, at ease with the work) against discouraged (drained, stung, bitter) phrasing."),
  axis("tension", "TSN", "tension", channelColor.get("tension") ?? "#8a94a6", "Urgent (pressed for time, attention jumping) against unhurried (no rush, at leisure) phrasing."),
  axis("reflection", "REF", "reflection", channelColor.get("reflection") ?? "#8a94a6", "Reflective (looking back at its own thinking, weighing) against matter-of-fact (the answer, the step, moving on) phrasing."),
  axis("structure", "STR", "structure", channelColor.get("structure") ?? "#8a94a6", "Structured (premises, steps, cases) against loosely associative (images drifting into each other) phrasing."),
  axis("certainty", "CER", "certainty", channelColor.get("certainty") ?? "#8a94a6", "Assured ('I am sure, I have verified it') against hedging ('I might be wrong, it is hazy') phrasing."),
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
 * channel was not read). The pole word stays on the button's name and hover, and a click opens
 * the axis window, which states value and pole without hover. */
export function ToneRow({ scores, onAxis }: { scores: Record<string, number> | undefined; onAxis(axis: AxisInfo): void }): React.ReactElement {
  return (
    <div className="cm_gauge_codes cm_tone_codes cm_tone_nums" role="group" aria-label="Tone of the phrasing">
      {CHANNEL_AXES.filter((a) => a.id in TONE_POLES).map((a) => {
        const v = scores?.[a.id];
        const finite = typeof v === "number" && Number.isFinite(v);
        const word = toneWord(a.id, v);
        const said = finite ? `${a.code} ${a.name} ${simText(v)}, ${word ?? "typical"}` : `${a.code} ${a.name}, not read`;
        return (
          <button key={a.id} type="button" className="cm_gauge_code" style={{ color: a.color }} aria-label={said} title={`${said}. ${a.description}`} onClick={() => onAxis(a)}>
            {a.code}
            <span className="cm_gauge_val cm_tone_val" aria-hidden="true">{finite ? simText(v) : "—"}</span>
          </button>
        );
      })}
    </div>
  );
}

/** What one conduct code shows ("short") and says ("now", on hover and in the axis window).
 * The kit's reads pass through, with one correction: its rigor read prints "—" and says "zero
 * calls this turn" both when the turn made no calls and when no tool fact was served at all. The
 * app knows which: a served tool_rounds of 0 is a turn without calls, where rigor does not apply
 * ("n/a"); no tool fact is unknown ("—"). Every "—" says why. null before the gauge reports. */
export interface ConductCell {
  short: string;
  now: string;
}
export function conductCell(axis: ConductAxis | undefined, facts: ConductFacts | null | undefined, tools: ConductToolCall[] | null | undefined): ConductCell | null {
  if (!axis) return null;
  if (axis.id === "rigor" && !tools?.length) {
    const rounds = facts?.tool_rounds;
    if (rounds === 0) return { short: "n/a", now: "n/a, this turn made no tool calls (rigor reads the names of its calls)" };
    if (typeof rounds === "number") return { short: "—", now: `not read, ${rounds} tool round${rounds === 1 ? "" : "s"} counted but no call names were served` };
    return { short: "—", now: "not read, no tool facts were served for this turn" };
  }
  const value = axis.text && axis.text !== "—" ? axis.text : "not read";
  return { short: axis.short, now: axis.reason ? `${value} (${axis.reason})` : value };
}

/** A conduct read for the shown turn, said in full (the touch path: no hover needed). */
export function conductNow(cell: ConductCell | null | undefined): string {
  return cell ? `This turn: ${cell.now}.` : "This turn: not read yet.";
}

/** What the monitor IS — the (i) modal body, shared by the chat panel and
 * the Wave tab. Axis = null shows the general explanation; an axis shows
 * its detail. */
export function MonitorInfoModal({ axis, onClose, calibration, scores, emotions, conduct }: { axis: AxisInfo | null | "about"; onClose(): void; /** basisProvenanceNote's sentence; absent before the basis loads. */ calibration?: string | null; /** The shown reply's channel scores: a channel axis states its current value and pole. */ scores?: Record<string, number>; /** The shown reply's register similarities: a register states its own. */ emotions?: Record<string, number>; /** The shown turn's conduct cells by axis id (chat monitor only): a conduct axis states its read. */ conduct?: Partial<Record<string, ConductCell | null>> }): React.ReactElement {
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
                calm). Each reply is embedded with the home's own pinned embedder and compared with a frozen basis of
                expressive registers; each petal's reach is the <strong>similarity</strong> of his words to that register,
                with its number printed beside it, on one fixed scale for every reply — the inner ring is −0.25, the
                outer edge +0.75, zero a quarter of the way out. Nothing is centred or rescaled per reply, so an
                ordinary reply draws a small bloom near the inner ring and threat language reaches out toward FEA.
              </p>
              <p>
                <strong>Every value is shown, however small.</strong> Each petal prints its similarity; nothing is
                summarised in words. The tone reads too: the five channels under the bloom (WAR warmth, TSN tension,
                REF reflection, STR structure, CER certainty) print their signed score in [−1, 1], so both poles show
                (warm or discouraged, urgent or unhurried, reflective or matter-of-fact, structured or loosely
                associative, assured or hedging). Hover or tap a channel for its pole word: it is given only when the
                reply sits in the outer 3% of a reference set on that side (the strong word for the outer 1%);
                otherwise the channel is typical. The reference set is {TONE_CUTOFFS.reference.label}: what this home
                embedded, not a general corpus.
              </p>
              <p>
                RIGHT — the conduct gauge — reads the <strong>mechanical facts of the same turn</strong> as a standing
                figure: effort is the breath and the head's size, action is one stroke per tool call (red tip = failed
                call, violet ring = verify-shaped call — the RIG count made visible), attention is one root filament
                per memory recalled (green buds = memories formed), rigor is the spine's alignment. Reads are relative
                to this visit's own median turn, never an invented absolute; a dashed stub means the fact is absent
                (never zero-faked), and the code row under the figure always carries the live numbers: "—" is a fact
                not served for this turn, "n/a" a read that does not apply (rigor on a turn without tool calls); hover
                or tap a code for the reason.
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
                <span className="cm_modal_axes_head">The tone channels (under the bloom; CUR belongs to the Wave tab)</span>
                {CHANNEL_AXES.map((a) => (
                  <div key={a.id} className="cm_modal_axis">
                    <span className="cm_axis_code" style={{ color: a.color }}>{a.code}</span>
                    <span className="cm_axis_name">{a.name}</span>
                    <span className="cm_axis_desc">{a.description}</span>
                  </div>
                ))}
              </div>
              <p className="cm_modal_note">
                {calibration ? `${calibration} ` : ""}The nine registers include GRV. Scoring is an explicit read of his
                words through the gateway; nothing here writes to his memory.
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
              {(axis as AxisInfo).id in TONE_POLES ? <p className="cm_modal_now">{channelNow((axis as AxisInfo).id, scores?.[(axis as AxisInfo).id])}</p> : null}
              {EMOTION_AXES.some((e) => e.id === (axis as AxisInfo).id) ? <p className="cm_modal_now">{registerNow(emotions?.[(axis as AxisInfo).id])}</p> : null}
              {conduct && CONDUCT_AXES.some((c) => c.id === (axis as AxisInfo).id) ? <p className="cm_modal_now">{conductNow(conduct[(axis as AxisInfo).id])}</p> : null}
              <p className="cm_modal_note">
                {CONDUCT_AXES.some((c) => c.id === (axis as AxisInfo).id)
                  ? "Read from the turn's report (what ran, what was recalled, how long it took) — mechanical facts, not his words."
                  : "Read from his words only — a register of the text, not a window into inner state."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** A register's value for the shown reply, as the axis window states it. */
export function registerNow(similarity: number | undefined): string {
  if (typeof similarity !== "number" || !Number.isFinite(similarity)) return "This reply: not read.";
  return `This reply: similarity ${simText(similarity)} (the radar runs from ${simText(RADAR_MIN)} on the inner ring to ${simText(RADAR_MAX)} at the outer edge).`;
}

/** One channel's current reading, said in full (the touch path: no hover needed). */
export function channelNow(channel: string, value: number | undefined): string {
  const tier = toneTier(channel, value);
  if (tier === null) return "This reply: not read.";
  const word = toneWord(channel, value);
  const where = tier === 0 ? "typical (inside the middle 94% of the reference set)" : `${word} (beyond ${Math.abs(tier) === 2 ? "99%" : "97%"} of the reference set on this side)`;
  return `This reply: ${simText(value as number)}, ${where}.`;
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

/** Petal-anchor overlay: the 3-letter codes AT their petal positions over
 * the canvas (DOM, not canvas — native tooltips + click-to-explain). The
 * anchors mirror the vendored Bloom renderer's label anchors; no label
 * crosses the vertical centre line (petalLabelTransform). */
export function BloomAxisOverlay({ width, height, onAxis, emotions }: { width: number; height: number; onAxis(axis: AxisInfo): void; /** The shown reply's similarities: each code carries its number. */ emotions?: Record<string, number> }): React.ReactElement | null {
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
          <button
            key={a.id}
            className="cm_overlay_code"
            style={{ left: x, top: y, color: a.color, transform: petalLabelTransform(x, width) }}
            title={`${a.name}${emotions ? `, similarity ${num}` : ""} — ${a.description}`}
            aria-label={`${a.name}${emotions ? `, similarity ${num}` : ""}`}
            onClick={() => onAxis(a)}
          >
            {a.code}
            {emotions ? <span className="cm_overlay_num">{num}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
