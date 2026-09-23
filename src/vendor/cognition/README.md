# Vendored: uic cognition-monitor (the SCORING half only)

The RENDERER is now the kit's `AfCognitionBloom` (uic shipped it c2242;
`@abstractframework/ui-kit`). This directory keeps only the SCORING half —
the kit ships rendering, not scoring, so the scorer + basis stay vendored
here until a `monitor-cognition` scoring package exists. `render_bloom.js`
was DELETED on the kit adoption (its morph gate + labels option + vignette
all live in the kit now, co-designed via c2229→c2242).

- `cognition_scorer.js` (+ `.d.ts`) — the frozen, parity-tested scorer. This
  is the **package boundary**: our adapter is built against exactly this
  contract, so the eventual `import { createScorer } from
  "@abstractframework/monitor-cognition"` is a one-line swap.
  2026-07-18 (fear-spike defect, operator report): the emotion pass now
  carries an ABSOLUTE-EVIDENCE ABSTENTION GATE — the per-utterance relative
  scoring (sim − mean) always crowned a winner, so a benign travel reply
  whose best raw prototype similarity was 0.066 (noise) rendered fear≈0.5.
  All emotion values scale by `clamp01((maxSim − floor)/ramp)` with
  floor = ramp = the basis's own `emotion_scale`; a text near NO prototype
  shows an empty bloom (the monitor's absent-not-zero honesty rule).
  Additive outputs: `emotionMaxSim`, `emotionEvidence`. Regression tests +
  frozen live-embedding fixtures: `src/cognition_scorer_gate.test.ts`,
  `src/fixtures/cognition_gate_vectors.json`.
- `core.js` (+ `.d.ts`) — the framework-free vocab + physics core. Now used
  ONLY for the `CHANNELS` table (the six scored channels' colors feed the
  monitor's channel axis list + info modal); the physics
  (createWaveState/setTargets/step) is dead here (the kit's bloom springs
  replaced it). The 9-register EMOTION set + codes now live in the kit's
  `EMOTION_REGISTERS` (the contract source); the app derives its axis table
  from there.
- `data/basis_v0.json` — frozen basis v0.1.0, **curated-arc only**
  (`calibrated_on: {curated_arc: 20, castor_utterances: 0}`). A basis v1
  cut on Castor's real utterances is a **data swap** (drop-in file), not a
  code change.

**Honesty:** the widget reads the *expressive character of text*, not inner
state — that framing label rides the mount default-on. `wandering`/novelty
(and `current`) are session-relative, labeled as such.

**Removal:** when uic ships the kit package, delete this whole directory and
import from the package; the adapter (`src/cognition_adapter.ts`) does not
change.
