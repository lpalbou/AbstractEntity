// cognition_scorer — framework-free live scorer for the cognition monitor.
// Consumes a FROZEN basis artifact (scripts/build_basis.py) and raw embedding
// vectors; produces the same {scores, emotions} the replay pipeline computes,
// without any per-conversation recalibration (the live-honesty gate).
//
// Contract (entity thread c1807/c1816/c1824):
//   - embed() is the CALLER's injection — this module never does I/O.
//   - createScorer(basis) REFUSES an embedder-id/dim mismatch loudly (M1):
//     pass the runtime embedder id you actually used to produce vectors.
//   - "current" (conversation PC) and "wandering" (EMA drift) are inherently
//     conversation-relative — computed over the live session by the returned
//     scorer's running state, NOT frozen in the basis. Both are labeled as
//     session-relative in the honesty framing.
// Numbers only: the basis carries aggregate statistics, never calibration text.

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function unit(v) {
  let m = 0;
  for (let i = 0; i < v.length; i++) m += v[i] * v[i];
  m = Math.sqrt(m) || 1;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / m;
  return out;
}

/**
 * Create a scorer bound to a frozen basis.
 * @param {object} basis - parsed basis_vN.json
 * @param {object} opts - { embedderId?: string, abstention?: { floor?: number, ramp?: number } }
 *   `embedderId` is the id of the embedder the caller will use; mismatch
 *   REFUSES (throw) rather than crossing spaces. `abstention` tunes the
 *   absolute-evidence gate below (floor: -1 effectively disables it —
 *   legacy relative-only behavior, kept reachable for A/B and replay).
 */
export function createScorer(basis, opts = {}) {
  if (opts.embedderId && opts.embedderId !== basis.embedder_id) {
    throw new Error(
      `cognition_scorer: embedder mismatch — vectors from "${opts.embedderId}" ` +
      `cannot be scored against a basis built with "${basis.embedder_id}". ` +
      `Re-cut the basis or switch the embedder; never mix embedding spaces.`
    );
  }

  const dim = basis.dim;
  const mean = basis.mean;
  const pc1 = basis.pc1;
  const channels = basis.channels;
  const emotions = basis.emotions;

  // ---- ABSOLUTE-EVIDENCE ABSTENTION GATE (fear-spike defect, 2026-07-18) --
  // The per-utterance mean-subtraction in the emotion pass is RELATIVE: on
  // ANY text roughly half the emotion sims land above mu, so
  // tanh((sim - mu) / emotion_scale) always crowns a "winner" — even when
  // every |sim| is noise. Live repro: a benign travel-logistics reply
  // rendered fear≈0.5 from a winning raw similarity of 0.066, while the
  // genuine fear control wins at 0.57 (measured separations against the v0
  // basis: neutral texts win at ≤0.16, genuinely emotional texts at ≥0.25).
  // Relative shape is only meaningful when the text is actually NEAR at
  // least one prototype in absolute terms, so the whole emotion map is
  // scaled by evidence = clamp01((maxSim - floor) / ramp): a text near NO
  // prototype shows NOTHING (the monitor's honesty rule — absent, never a
  // confident wrong reading); borderline texts fade in instead of popping.
  // Defaults derive from the basis's own emotion_scale (the p85
  // centered-sim spread of its calibration corpus), so a re-cut basis
  // recalibrates the gate automatically — no corpus-specific constants.
  const emotionScale = Number(basis.emotion_scale) > 0 ? Number(basis.emotion_scale) : 0.15;
  const abstention = opts.abstention || {};
  const gateFloor = Number.isFinite(abstention.floor) ? abstention.floor : emotionScale;
  const gateRamp = Number.isFinite(abstention.ramp) && abstention.ramp > 0 ? abstention.ramp : emotionScale;

  function whiten(vec) {
    if (vec.length !== dim) {
      throw new Error(`cognition_scorer: vector dim ${vec.length} != basis dim ${dim}`);
    }
    const u = unit(vec);
    const y = new Array(dim);
    for (let i = 0; i < dim; i++) y[i] = u[i] - mean[i];
    const d0 = dot(y, pc1);
    for (let i = 0; i < dim; i++) y[i] -= d0 * pc1[i];
    return unit(y);
  }

  // Session-relative state for wandering (EMA centroid in whitened space).
  let ema = null;
  let prev = null;
  const ALPHA = 0.15;

  return {
    basisVersion: basis.version,
    embedderId: basis.embedder_id,
    channels,
    emotions,
    calibratedOn: basis.calibrated_on,

    /** Score one utterance vector. Returns {scores, emotions, novelty,
     * emotionMaxSim, emotionEvidence} (the last two are additive gate
     * diagnostics — why a bloom is quiet, without recomputing whitening). */
    score(vec) {
      const w = whiten(vec);

      const scores = {};
      for (const cid of channels) {
        const ax = basis.axes[cid];
        const nrm = basis.channel_norms[cid];
        const raw = dot(w, ax);
        scores[cid] = Math.max(-1, Math.min(1, Math.tanh((raw - nrm.med) / (nrm.mad * 1.5))));
      }

      const sims = {};
      let mu = 0;
      let maxSim = -Infinity;
      for (const eid of emotions) {
        sims[eid] = dot(w, basis.emotion_protos[eid]);
        mu += sims[eid];
        if (sims[eid] > maxSim) maxSim = sims[eid];
      }
      mu /= emotions.length;
      // evidence: absolute proximity to the NEAREST prototype, mapped
      // through the gate (0 below floor, 1 above floor+ramp). The relative
      // shape (which register leads) survives untouched; only its permission
      // to show scales with real evidence.
      const evidence = Math.max(0, Math.min(1, (maxSim - gateFloor) / gateRamp));
      const emo = {};
      for (const eid of emotions) {
        emo[eid] = evidence * Math.max(0, Math.min(1, Math.tanh((sims[eid] - mu) / emotionScale)));
      }

      // wandering: session-relative EMA drift (labeled as such — this is the
      // one deliberately conversation-relative output, same as the replay).
      let novelty = 0;
      if (ema !== null) {
        const drift = 1 - dot(w, ema);
        const adj = 1 - dot(w, prev);
        novelty = Math.max(0, Math.min(1, (0.6 * drift + 0.4 * adj - 0.5) / 0.6));
        const next = new Array(dim);
        for (let i = 0; i < dim; i++) next[i] = ALPHA * w[i] + (1 - ALPHA) * ema[i];
        ema = unit(next);
      } else {
        ema = w.slice();
      }
      prev = w;

      // Additive diagnostics (contract-preserving): the gate's inputs ride
      // along so mounts/tests can see WHY a bloom is quiet (maxSim below the
      // floor) without recomputing whitening.
      return { scores, emotions: emo, novelty, emotionMaxSim: maxSim, emotionEvidence: evidence };
    },

    /** Reset session-relative state (new conversation). */
    reset() {
      ema = null;
      prev = null;
    },
  };
}
