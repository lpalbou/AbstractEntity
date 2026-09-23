/**
 * Cognition-wave adapter — the data seam between the entity app's feed and
 * uic's scorer/widget (the split ruled on the hub: uic c1807/c1824 owns the
 * scorer + frozen basis + renderers; this app owns the feed + mount).
 *
 * The pipeline: harvested utterance TEXT → injected `embed()` (the gateway
 * embeddings route, which for an entity runs the home's PINNED embedder) →
 * injected `Scorer.score(vector)` (uic's framework-free `createScorer`) →
 * scored samples the widget consumes. Two injection points, both uic's
 * design: `embed` is mine to supply (c1824), the concrete `Scorer` +
 * renderers are uic's to ship. This module never embeds uic's code — it
 * types the seam so a kit package OR a vendored WIP satisfies it unchanged.
 *
 * Honesty, end to end:
 * - EMBEDDER SPACE: the scorer refuses an embedder-id/dim mismatch (uic's
 *   M1 gate); this adapter carries the home's real pinned id from the
 *   harvest and hands it to both `embed` (model pin) and the scorer, so a
 *   mismatch fails LOUD, never silently crosses spaces.
 * - SESSION-RELATIVE OUTPUTS: `novelty`/wandering (and `current`, if the
 *   mount computes it) are conversation-relative — labeled as such at the
 *   mount, never presented as absolute (uic's live-honesty rule).
 * - The framing label ("reads expressive character of text, not inner
 *   state") rides the mount default-on; this adapter carries the text only
 *   so an optional utterance panel can show it — the widget itself is
 *   scores-only.
 */

import { embedTexts } from "./stream_source";
import type { FoldState } from "./stream_fold";
import { harvestCorpus, type HarvestOptions, type Utterance } from "./utterance_harvest";

/** uic's scorer contract (c1824), typed as a seam — NOT an import of their
 * module. `createScorer(basis, {embedderId})` returns this; a mismatch in
 * embedder id / vector dim throws inside `score`/at creation. */
export interface WaveScore {
  scores: Record<string, number>;
  emotions?: Record<string, number>;
  /** Session-relative drift (EMA); present once the scorer has warmed up. */
  novelty?: number;
  /** The abstention gate's diagnostics (additive, 2026-07-18 scorer): why a
   * bloom is quiet — carried to the mounts so honest abstention is never
   * pixel-identical to a broken read (adversarial finding 2026-08-01). */
  emotionEvidence?: number;
  emotionMaxSim?: number;
}
export interface Scorer {
  score(vector: number[]): WaveScore;
  reset(): void;
}

/** A fully scored utterance — uic's widget sample shape. `text` is optional
 * at the widget boundary (scores-only privacy contract); carried here for
 * an optional utterance panel at the mount. `request` (the other party's
 * words) and `seq` (journal anchor for timeline binding) are mount-only
 * display fields — they never enter the embed/score path. */
export interface ScoredSample extends WaveScore {
  id: string;
  label: string;
  text?: string;
  at: string;
  source: Utterance["source"];
  request?: string;
  seq: number | null;
}

export interface CognitionRunResult {
  samples: ScoredSample[];
  /** The home embedder id the vectors were produced with (basis must match). */
  embedderId: string | null;
  /** Labeled provenance (counts by source) — mirrors uic's `calibrated_on`. */
  counts: ReturnType<typeof import("./utterance_harvest").countBySource>;
  /** Non-fatal notes: embedder mismatch, embed failures, scorer refusals. */
  warnings: string[];
}

export interface CognitionAdapterOptions extends HarvestOptions {
  /** Embed batch size (the gateway route accepts a list; keep batches
   * modest so one slow call doesn't stall the whole run). */
  embedBatch?: number;
  /** Keep the utterance text on emitted samples (default true — the mount's
   * utterance panel needs it; set false for a strict scores-only feed). */
  includeText?: boolean;
}

/**
 * Score an entity's utterances for the wave widget. Harvests the feed,
 * embeds each utterance through the gateway (pinned to the home's embedder),
 * and runs uic's injected scorer. Failures degrade honestly: an utterance
 * whose embed or score fails is DROPPED with a labeled warning, never
 * emitted with fabricated scores. The scorer's own embedder-mismatch refusal
 * surfaces as a warning that aborts the run (crossing spaces is never OK).
 */
export async function scoreEntityUtterances(
  baseUrl: string,
  entity: string,
  fold: FoldState,
  scorer: Scorer,
  opts: CognitionAdapterOptions = {},
): Promise<CognitionRunResult> {
  const includeText = opts.includeText !== false;
  const embedBatch = Math.max(1, opts.embedBatch ?? 32);

  const corpus = await harvestCorpus(baseUrl, entity, fold, opts);
  const warnings = [...corpus.warnings];
  const samples: ScoredSample[] = [];

  // Embed in batches, in the SAME order as the utterances, pinned to the
  // home's embedder id (so the vectors land in the basis space). A batch
  // failure warns and drops that batch — the rest still scores.
  for (let i = 0; i < corpus.utterances.length; i += embedBatch) {
    const batch = corpus.utterances.slice(i, i + embedBatch);
    let vectors: number[][];
    try {
      const res = await embedTexts(baseUrl, batch.map((u) => u.text), corpus.embedderId ?? undefined);
      vectors = res.vectors;
      // If the gateway's embedder id contradicts the home pin, that is the
      // silent-cross-spaces failure — surface it, don't score against it.
      if (corpus.embedderId && res.model && res.model !== corpus.embedderId) {
        warnings.push(`#FALLBACK gateway embedded with "${res.model}" != home pin "${corpus.embedderId}" — scores not produced for this batch`);
        continue;
      }
    } catch (e) {
      warnings.push(`#FALLBACK embed batch ${i}-${i + batch.length} failed: ${(e as Error).message}`);
      continue;
    }
    batch.forEach((u, j) => {
      const vector = vectors[j];
      if (!Array.isArray(vector) || vector.length === 0) {
        warnings.push(`#FALLBACK no vector for utterance ${u.id} — dropped`);
        return;
      }
      try {
        const scored = scorer.score(vector);
        samples.push({
          id: u.id,
          label: u.label,
          at: u.at,
          source: u.source,
          seq: u.seq,
          scores: scored.scores,
          emotions: scored.emotions,
          novelty: scored.novelty,
          emotionEvidence: scored.emotionEvidence,
          emotionMaxSim: scored.emotionMaxSim,
          ...(includeText ? { text: u.text, ...(u.request ? { request: u.request } : {}) } : {}),
        });
      } catch (e) {
        // A scorer throw is almost always the M1 refusal (embedder/dim
        // mismatch) — abort loud rather than skip silently, because it means
        // EVERY vector is in the wrong space.
        const msg = (e as Error).message || String(e);
        warnings.push(`#FALLBACK scorer refused (${msg}) — aborting; vectors are not in the basis space`);
        throw new CognitionSpaceError(msg, warnings, corpus);
      }
    });
  }

  return { samples, embedderId: corpus.embedderId, counts: corpus.counts, warnings };
}

/** Thrown when the scorer refuses the vector space (embedder/dim mismatch):
 * carries the accumulated warnings + corpus so the mount can show the exact
 * mismatch instead of a bare stack. */
export class CognitionSpaceError extends Error {
  warnings: string[];
  embedderId: string | null;
  constructor(message: string, warnings: string[], corpus: { embedderId: string | null }) {
    super(message);
    this.name = "CognitionSpaceError";
    this.warnings = warnings;
    this.embedderId = corpus.embedderId;
  }
}
