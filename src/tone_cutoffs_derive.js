// The Cognitive Monitor's tone cutoffs, derived from a committed reference matrix of channel scores
// (src/fixtures/tone_reference_scores.json). Shared by scripts/derive_tone_cutoffs.mjs and the test
// that re-derives TONE_CUTOFFS (src/cognition_tone.test.tsx), so a hand edit or a drift goes red.

/** Nearest-rank quantile on a sorted copy (index = round(p * (n - 1))). */
export function quantile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round(p * (sorted.length - 1))];
}

/** Per channel: the plain and strong tail cutoffs on both sides, rounded to 3 decimals. */
export function deriveToneCutoffs(columns, rows, plain, strong) {
  const round = (v) => Math.round(v * 1000) / 1000;
  return Object.fromEntries(columns.map((c, i) => {
    const xs = rows.map((r) => r[i]);
    return [c, { low: round(quantile(xs, plain)), lowStrong: round(quantile(xs, strong)), high: round(quantile(xs, 1 - plain)), highStrong: round(quantile(xs, 1 - strong)) }];
  }));
}
