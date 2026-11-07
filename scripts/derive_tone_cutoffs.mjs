// The Cognitive Monitor's tone cutoffs (TONE_CUTOFFS in src/cognitive_monitor.tsx).
//
// Default: re-derive them from the committed reference matrix of channel scores
// (src/fixtures/tone_reference_scores.json: scores only, no texts, no vectors) and print them.
//   node scripts/derive_tone_cutoffs.mjs
//
// Re-cut (after a basis change, or a new reference set): score a JSON array of embedding vectors
// with the shipped basis and write a NEW matrix, then re-derive from it and update TONE_CUTOFFS.
//   node scripts/derive_tone_cutoffs.mjs --vectors <vectors.json> --source "<description>" --out <matrix.json>
// The 2026-11-07 vectors were the first 1,599 entries (insertion order) of this home's abstractcore
// embedding cache, runtime/abstractcore/embeddings/lmstudio_text_embedding_qwen3_embedding_0.6b_cache.pkl
// (a pickle dict md5(text) -> vector), exported as a JSON array of vectors.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createScorer } from "../src/vendor/cognition/cognition_scorer.js";
import { deriveToneCutoffs } from "../src/tone_cutoffs_derive.js";

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? "" : process.argv[i + 1]; };
const COLUMNS = ["warmth", "tension", "reflection", "structure", "certainty"];
const matrixPath = new URL("../src/fixtures/tone_reference_scores.json", import.meta.url);
const sha = (s) => createHash("sha256").update(s).digest("hex");

if (arg("vectors")) {
  const basis = JSON.parse(readFileSync(new URL("../src/vendor/cognition/data/basis_v1.json", import.meta.url), "utf8"));
  const raw = readFileSync(arg("vectors"));
  const vectors = JSON.parse(raw.toString("utf8"));
  // One scorer per text: novelty (the only session-relative output) never leaks between texts.
  const rows = vectors.map((v) => {
    const s = createScorer(basis, { embedderId: basis.embedder_id, abstention: { floor: basis.abstention_floor } }).score(v).scores;
    return COLUMNS.map((c) => Math.round(s[c] * 1e6) / 1e6);
  });
  const out = {
    _note: "Channel scores (no texts, no vectors) of the Cognitive Monitor's tone reference set; TONE_CUTOFFS is derived from this file (scripts/derive_tone_cutoffs.mjs).",
    source: arg("source") || "unspecified",
    date: new Date().toISOString().slice(0, 10),
    basis_version: basis.version,
    embedder_id: basis.embedder_id,
    count: rows.length,
    vectors_sha256: sha(raw),
    columns: COLUMNS,
    scores_sha256: sha(JSON.stringify(rows)),
    scores: rows,
  };
  writeFileSync(arg("out") || matrixPath, `${JSON.stringify(out, null, 0)}\n`);
  console.error(`wrote ${rows.length} rows to ${arg("out") || matrixPath.pathname}`);
}

const matrix = JSON.parse(readFileSync(arg("out") || matrixPath, "utf8"));
if (sha(JSON.stringify(matrix.scores)) !== matrix.scores_sha256) throw new Error("reference matrix checksum mismatch");
const plain = Number(arg("plain") || 0.03), strong = Number(arg("strong") || 0.01);
console.log(JSON.stringify({ basisVersion: matrix.basis_version, count: matrix.count, tails: { plain, strong }, channels: deriveToneCutoffs(matrix.columns, matrix.scores, plain, strong) }, null, 2));
