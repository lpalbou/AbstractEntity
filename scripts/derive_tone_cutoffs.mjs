// Derive the Cognitive Monitor's tone cutoffs (TONE_CUTOFFS in src/cognitive_monitor.tsx) from a
// reference population of embeddings, scored with the shipped basis. The vectors are private (a
// home's embeddings cache) and are not committed; pass a JSON array of embedding vectors.
// Run: node scripts/derive_tone_cutoffs.mjs <vectors.json> [plainTail=0.03] [strongTail=0.01]
import { readFileSync } from "node:fs";
import { createScorer } from "../src/vendor/cognition/cognition_scorer.js";
const [file, plainArg, strongArg] = process.argv.slice(2);
if (!file) throw new Error("usage: node scripts/derive_tone_cutoffs.mjs <vectors.json> [plainTail] [strongTail]");
const plain = Number(plainArg ?? 0.03), strong = Number(strongArg ?? 0.01);
const basis = JSON.parse(readFileSync(new URL("../src/vendor/cognition/data/basis_v1.json", import.meta.url), "utf8"));
const vectors = JSON.parse(readFileSync(file, "utf8"));
// One scorer per text: the session-relative channel (CUR) and novelty must not leak between texts.
const scores = vectors.map((v) => createScorer(basis, { embedderId: basis.embedder_id, abstention: { floor: basis.abstention_floor } }).score(v).scores);
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.round(p * (s.length - 1))]; };
const channels = Object.fromEntries(["warmth", "tension", "reflection", "structure", "certainty"].map((c) => {
  const xs = scores.map((s) => s[c]);
  return [c, { low: +q(xs, plain).toFixed(3), lowStrong: +q(xs, strong).toFixed(3), high: +q(xs, 1 - plain).toFixed(3), highStrong: +q(xs, 1 - strong).toFixed(3) }];
}));
console.log(JSON.stringify({ basisVersion: basis.version, population: vectors.length, tails: { plain, strong }, channels }, null, 2));
