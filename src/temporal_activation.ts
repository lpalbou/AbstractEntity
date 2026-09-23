/**
 * The TEMPORAL access count: engine-parity activation over the fold.
 *
 * THE TWO-COUNT CONTRACT (the maintainer's model, encoded in the engine at
 * abstractmemory/attention.py): every memory and every co-use trail carries
 * a GLOBAL count (absolute selected-use, never decays — the fold's
 * `selected_count` / edge `count`) AND a TEMPORAL count that DECAYS with
 * activity, so it reflects only what was recently selected. The view was
 * rendering selection intensity (green edges, node blooms) from the GLOBAL
 * count — a memory selected 300 times over a life glowed forever, and a
 * long life read as "everything is selected" (maintainer screenshot,
 * 2026-07-10 21:27). This module computes the TEMPORAL side so intensity
 * can mean "warm NOW".
 *
 * PARITY, not invention — this is a faithful port of the engine's
 * compute_activation / compute_trail_activation semantics:
 *
 * - Only attention kinds feed it: selected / co_selected / pinned /
 *   silenced, plus refocus as a decay marker. Audit kinds (listed, shown,
 *   expanded, cited) never occupy window slots — reading is not using.
 * - Per (scope, owner) event stream: no cross-scope bleed. A busy life
 *   scope must not flush the self scope's recency out of the window.
 * - Window = the last `window_limit` attention events of that stream
 *   (activity distance, NOT wall clock). Distance = rank index in the
 *   window, newest first.
 * - contribution = sign · weight / (1 + distance / decay_window); silenced
 *   contributes negatively; refocus stretches the distance of everything
 *   older than the latest in-window refocus by refocus_multiplier, once.
 * - Per-STEP clamp to [0, max_activation], newest→oldest (fork parity —
 *   not one final clamp of the raw sum).
 * - pinned/silenced with ttl_activity contribute 0 past their raw rank
 *   distance.
 * - co_selected events occupy rank slots but credit only the PAIR trail
 *   (crediting members too would double-count once spreading exists).
 *
 * Two deliberate divergences:
 * - pair trails are keyed by the fold's RESOLVED edge key (nodes merge
 *   row/graph ids; edge rows merge onto their source record), so temporal
 *   values join the rendered edges directly. The engine keys raw row-id
 *   pairs; after resolution these are the same association.
 * - the engine's OPTIONAL cumulative prior (include_prior: ln(global+1)
 *   blended in for inspection ranking) is NOT ported: the prior re-blends
 *   the never-decaying global count, which is exactly what the green must
 *   not mean here. Warmth is pure temporal.
 *
 * HONEST LIMIT (config, not data): the stream does not carry the host's
 * AttentionConfig. The view mirrors the ENGINE default (window_limit=8192
 * since memory c5458 — the burst-keyed axis needs the window to hold a
 * real horizon of TURNS at ruled shelves) and labels the value as "the
 * recent window", not as the entity's exact retrieval strength. If the
 * stream ever carries the host config, mirror it here.
 */

/** Attention kinds that occupy window slots and carry weight. */
export const ATTENTION_KINDS = new Set(["selected", "co_selected", "pinned", "silenced"]);
/** Decay markers: occupy a slot, carry no weight, stretch older distances. */
export const DECAY_MARKER_KINDS = new Set(["refocus"]);

/** Engine DEFAULT_WEIGHTS (journal.py) — fallback only: stream events carry
 * their journaled weight, and scoring must reproduce what was journaled. */
const DEFAULT_WEIGHTS: Record<string, number> = {
  selected: 8.0,
  co_selected: 4.0,
  pinned: 8.0,
  silenced: 8.0, // negative sign applied at scoring time
};

/** One buffered attention event (the fold keeps a bounded window per
 * scope stream — exactly what the engine's scoring walk reads). */
export interface AttentionEventLite {
  kind: string;
  /** Resolved node id for record events (selected/pinned/silenced). */
  record_id: string | null;
  /** Resolved edge key ("a|b", sorted) for co_selected events. */
  pair_key: string | null;
  weight: number;
  ttl_activity: number | null;
  seq: number;
  /** The commit that deposited this event — burst grouping key (wash-note
   * render: one commit's deposit measured against the window). */
  trace_id: string | null;
}

/** Mirror of the engine's AttentionConfig defaults (attention.py). */
export interface TemporalConfig {
  window_limit: number;
  decay_window: number;
  refocus_multiplier: number;
  max_activation: number;
}

export const ENGINE_DEFAULT_CONFIG: TemporalConfig = {
  window_limit: 8192,
  decay_window: 20.0,
  refocus_multiplier: 6.0,
  max_activation: 25.0,
};

export interface TemporalActivation {
  /** node id -> base-level activation, clamped [0, max_activation]. */
  records: Map<string, number>;
  /** edge key ("a|b") -> pair-trail activation, clamped [0, max_activation]. */
  pairs: Map<string, number>;
  config: TemporalConfig;
  /** The newest commit's deposit size (events sharing the newest event's
   * trace across all streams): the WASH measure. A young life's shelf
   * deposits n + C(n,2) window slots per commit (selected + the complete
   * co_selected pair set), so one turn can push every prior selection
   * hundreds of ranks deep — honest decay that reads as data loss unless
   * the legend says why (fable5 verdict, laurent c5439). */
  head_burst: { total: number; selected: number; trace_id: string } | null;
}

/** Weight for a stream event: the journaled weight when present (scoring
 * reproduces what was journaled), else the engine default for the kind. */
export function eventWeight(kind: string, weight: unknown): number {
  const w = typeof weight === "number" && Number.isFinite(weight) && weight > 0 ? weight : 0;
  return w > 0 ? w : DEFAULT_WEIGHTS[kind] ?? 0;
}

/** Append to a scope's bounded window buffer (ascending seq order). The
 * trim keeps slightly more than the window so amortized appends stay O(1);
 * the scoring walk re-truncates exactly. COUPLING: the trim bound must be
 * >= the window computeTemporalActivation is later called with — both
 * default to the engine default; if a host-config window ever ships
 * (memory-replay-stream ask, 2026-07-10), thread it through BOTH the fold
 * pushes and the compute call. */
export function pushAttentionEvent(
  buffers: Map<string, AttentionEventLite[]>,
  scopeKey: string,
  event: AttentionEventLite,
  windowLimit: number = ENGINE_DEFAULT_CONFIG.window_limit,
): void {
  let buf = buffers.get(scopeKey);
  if (!buf) {
    buf = [];
    buffers.set(scopeKey, buf);
  }
  buf.push(event);
  if (buf.length > windowLimit * 1.25) {
    buf.splice(0, buf.length - windowLimit);
  }
}

/** Node re-keys (graph id -> row id merges) must carry their attention
 * history, or a merged node's warmth silently drops to zero — the same
 * class of bug as edges losing traffic on re-key. */
export function rekeyAttentionEvents(
  buffers: Map<string, AttentionEventLite[]>,
  oldId: string,
  newId: string,
): void {
  for (const buf of buffers.values()) {
    for (let i = 0; i < buf.length; i++) {
      const ev = buf[i];
      if (ev.record_id === oldId) {
        buf[i] = { ...ev, record_id: newId };
      } else if (ev.pair_key) {
        const [a, b] = ev.pair_key.split("|");
        if (a === oldId || b === oldId) {
          const na = a === oldId ? newId : a;
          const nb = b === oldId ? newId : b;
          // A pair merging into a self-pair keeps its slot (activity
          // happened) but credits no rendered edge.
          buf[i] = { ...ev, pair_key: na === nb ? null : na < nb ? `${na}|${nb}` : `${nb}|${na}` };
        }
      }
    }
  }
}

const TTL_KINDS = new Set(["pinned", "silenced"]);

function contribution(
  ev: AttentionEventLite,
  rankIndex: number,
  latestRefocusSeq: number | null,
  config: TemporalConfig,
): number {
  // TTL expiry compares the RAW rank index (activity distance) — refocus
  // never retroactively shortens a deliberate act's promised lifetime.
  if (TTL_KINDS.has(ev.kind) && ev.ttl_activity !== null && rankIndex > ev.ttl_activity) {
    return 0;
  }
  let distance = rankIndex;
  if (latestRefocusSeq !== null && ev.seq < latestRefocusSeq) {
    distance *= config.refocus_multiplier;
  }
  const sign = ev.kind === "silenced" ? -1 : 1;
  return (sign * ev.weight) / (1 + distance / config.decay_window);
}

/** Compute the temporal activation over the fold's buffered windows.
 * Pure read: identical fold state yields identical maps, and because the
 * fold is prefix-limited to the scrub seq, this IS the engine's `as_of`
 * semantics — the temporal field at time T. */
export function computeTemporalActivation(
  buffers: Map<string, AttentionEventLite[]>,
  config: TemporalConfig = ENGINE_DEFAULT_CONFIG,
): TemporalActivation {
  const records = new Map<string, number>();
  const pairs = new Map<string, number>();

  for (const buf of buffers.values()) {
    // Window: last window_limit events, walked newest -> oldest.
    const start = Math.max(0, buf.length - config.window_limit);
    // Latest in-window refocus (first hit in DESC order).
    let latestRefocusSeq: number | null = null;
    for (let i = buf.length - 1; i >= start; i--) {
      if (DECAY_MARKER_KINDS.has(buf[i].kind)) {
        latestRefocusSeq = buf[i].seq;
        break;
      }
    }
    // THE BURST AXIS (engine parity, memory c5458 — laurent's c5439 wash):
    // consecutive events sharing one trace_id are ONE burst (one lived
    // beat — a commit's n + C(n,2) bookkeeping rows all happened in the
    // same moment of experience); the rank advances when the trace
    // changes. Events without a trace_id each advance the rank (legacy
    // journals keep per-event decay; null never groups). decay_window
    // means distance in TURNS again — shelf-independent by construction.
    let rank = -1;
    let prevTrace: string | undefined = undefined;
    for (let i = buf.length - 1; i >= start; i--) {
      const ev = buf[i];
      const trace = ev.trace_id || null;
      if (trace === null || trace !== prevTrace) rank += 1;
      prevTrace = trace === null ? undefined : trace;
      if (DECAY_MARKER_KINDS.has(ev.kind)) continue; // slot, no weight
      const c = contribution(ev, rank, latestRefocusSeq, config);
      if (ev.kind === "co_selected") {
        if (!ev.pair_key) continue; // merged self-pair: slot only
        // PER-STEP clamp, newest -> oldest (fork parity).
        const prev = pairs.get(ev.pair_key) ?? 0;
        pairs.set(ev.pair_key, Math.min(Math.max(prev + c, 0), config.max_activation));
      } else if (ev.record_id) {
        const prev = records.get(ev.record_id) ?? 0;
        records.set(ev.record_id, Math.min(Math.max(prev + c, 0), config.max_activation));
      }
    }
  }
  // The wash measure: find the globally newest attention event (by seq)
  // and count how many events share its trace — one commit's deposit.
  let newest: AttentionEventLite | null = null;
  for (const events of buffers.values()) {
    const tail = events[events.length - 1];
    if (tail && (!newest || tail.seq > newest.seq)) newest = tail;
  }
  let head_burst: TemporalActivation["head_burst"] = null;
  if (newest?.trace_id) {
    let total = 0;
    let selected = 0;
    for (const events of buffers.values()) {
      for (const ev of events) {
        if (ev.trace_id === newest.trace_id) {
          total += 1;
          if (ev.kind === "selected") selected += 1;
        }
      }
    }
    head_burst = { total, selected, trace_id: newest.trace_id };
  }
  return { records, pairs, config, head_burst };
}

/** Presentation normalization: activation -> [0,1] intensity.
 *
 * RECALIBRATED for the burst axis (deep-check monitor C, 2026-07-27): the
 * old comment claimed the clamp ceiling (25) was "nearly unreachable at
 * real cadence" — true under per-event ranks, FALSIFIED by burst-keyed
 * ranks (memory c5458), where one recall later = rank 1 and the ceiling
 * became the MEDIAN: on a live young life 64% of edges spanned raw
 * activation 8-25 yet painted one identical green (saturation at 2x the
 * fresh weight). New map, two segments: one just-now use of the kind
 * lands at 0.45 (clearly visible), and the remaining headroom to the
 * engine ceiling spreads 0.45 -> 1.0 — so "used once lately" and "used
 * constantly" finally look different. Presentation only — the MATH above
 * stays the engine's. */
export function temporalIntensity(activation: number, freshWeight: number, ceiling: number = ENGINE_DEFAULT_CONFIG.max_activation): number {
  if (!Number.isFinite(activation) || activation <= 0) return 0;
  if (activation <= freshWeight) return 0.45 * (activation / freshWeight);
  const span = Math.max(ceiling - freshWeight, 1);
  return Math.min(1, 0.45 + 0.55 * ((activation - freshWeight) / span));
}

/** Node warmth intensity (selected weight 8 -> saturation 16). */
export function nodeWarmth(activation: number): number {
  return temporalIntensity(activation, DEFAULT_WEIGHTS.selected);
}

/** Pair-trail warmth intensity (co_selected weight 4 -> saturation 8). */
export function pairWarmth(activation: number): number {
  return temporalIntensity(activation, DEFAULT_WEIGHTS.co_selected);
}
