/**
 * Type declarations for the VENDORED uic `cognition_scorer.js` (c1831:
 * vendor the STABLE, parity-tested half — the scorer contract is the kit
 * package boundary, so this swaps to a clean import unchanged). The `.js`
 * is uic's code copied verbatim; these types describe its surface.
 */

export interface FrozenBasis {
  embedder_id: string;
  dim: number;
  version: string;
  calibrated_on: Record<string, unknown>;
  channels: string[];
  emotions: string[];
  /** Gate floor calibrated on the entity's OWN corpus (v1+, 2026-08-01:
   * the default floor=emotion_scale made his measured register the
   * baseline — "always neutral"). Mounts pass it as abstention.floor;
   * absent (v0) keeps the scorer's default. */
  abstention_floor?: number;
  [k: string]: unknown;
}

export interface ScoreOutput {
  scores: Record<string, number>;
  emotions: Record<string, number>;
  novelty: number;
  /** Raw whitened-space similarity of the NEAREST emotion prototype —
   * the abstention gate's input (additive diagnostic, 2026-07-18). */
  emotionMaxSim?: number;
  /** Absolute-evidence factor in [0,1] applied to all emotion values:
   * 0 = no prototype is near (bloom abstains), 1 = full confidence. */
  emotionEvidence?: number;
}

export interface VendorScorer {
  basisVersion: string;
  embedderId: string;
  channels: string[];
  emotions: string[];
  calibratedOn: Record<string, unknown>;
  /** Score one utterance vector. Throws on dim mismatch (M1 gate). */
  score(vec: number[]): ScoreOutput;
  /** Reset session-relative state (new conversation). */
  reset(): void;
}

/** Create a scorer bound to a frozen basis; throws on embedder-id mismatch.
 * `abstention` tunes the absolute-evidence gate on emotion outputs (defaults
 * derive from the basis's own emotion_scale; floor -1 effectively disables
 * the gate — legacy relative-only behavior). */
export function createScorer(
  basis: FrozenBasis,
  opts?: { embedderId?: string; abstention?: { floor?: number; ramp?: number } },
): VendorScorer;
