/**
 * Label CONTENT shaping (operator 15:06: "the labels are awful, including
 * in their content"). One shared shaper for canvas labels, hovercards and
 * neighbor tags — the full title stays available in the inspector; these
 * rules make the GLANCE readable:
 *
 * - record-scaffolding prefixes ("exchange:", "episode:", and — laurent
 *   dm#84 2026-07-20 "do not show 'lesson:' for each card, just show the
 *   lesson" — "lesson:"/"dream:" too) are dropped: the kind is ALWAYS
 *   encoded elsewhere (canvas color, detail badge, panel header), so a
 *   type prefix is dead weight everywhere a label renders (the dm#46
 *   principle applied to its last holdouts). Leading "gist:" residue
 *   from formation strips the same way — prefixes strip in chains
 *   ("lesson: gist: X" → "X");
 * - speaker scaffolding at the head ("person:laurent said/asked …") is
 *   trimmed to the said thing — who spoke is in the record, the label is
 *   for WHAT it is about;
 * - snake_case identity names read as words ("shared_vulnerability" →
 *   "shared vulnerability");
 * - truncation happens at WORD boundaries, never mid-word.
 */

const MECHANICAL_PREFIXES = /^(exchange|episode|memory|record|lesson|dream|interest|summary|gist|realization|world[\s_]?model)\s*:\s*/i;
const SPEAKER_SCAFFOLD = /^(?:person|entity|user|operator):[\w.-]+\s+(?:said|asked|replied|wrote|told (?:him|her|them|me))\s*:?\s*/i;

/** Shape a raw node title into glanceable label content. */
export function shapeLabel(raw: string): string {
  let t = String(raw || "").trim();
  if (!t) return t;
  // Prefixes strip in chains: "lesson: gist: X" carries two layers of
  // scaffolding over one sentence of content.
  for (let guard = 0; guard < 4 && MECHANICAL_PREFIXES.test(t); guard += 1) {
    t = t.replace(MECHANICAL_PREFIXES, "");
  }
  t = t.replace(SPEAKER_SCAFFOLD, "");
  // Identity/value names arrive snake_cased from the spark engram.
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(t)) t = t.replace(/_/g, " ");
  // "trait-0" / "purpose-1" index-titles read as words with their number.
  const idx = t.match(/^(trait|purpose|value|limit)-(\d+)$/);
  if (idx) t = `${idx[1]} ${idx[2]}`;
  // Collapse whitespace runs (multi-line digests fold to one line).
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/** Truncate at a word boundary — a cut like "the restor…" reads awful;
 * "the restore…" or "the…" does not. Falls back to a hard cut only when
 * the first word alone exceeds the budget. */
export function clipAtWord(text: string, max: number): string {
  const t = String(text || "");
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > Math.floor(max * 0.4) ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/** The one call sites use: shaped + word-clipped. */
export function nodeLabel(raw: string, max: number): string {
  return clipAtWord(shapeLabel(raw), max);
}

/** Laurent dm#46 (2026-07-16): "a node label must never be its type,
 * since it's already encoded in color and shape. the node label MUST be
 * a short 1 sentence summary." Type stand-ins and act-frame placeholders
 * return null — NO label is better than a type label:
 * - "a diary entry" / "diary entry" (the redacted stand-in);
 * - the diaryLabel date shape ("diary · Jul 7 06:10 · #d1817a");
 * - bare graph ids ("ex:memory-…") and id-ish fragments.
 * Real summaries (episode digests, diary gists, identity names) pass
 * through untouched. */
export function summaryLabel(title: string | null | undefined, redacted?: boolean): string | null {
  if (redacted) return null;
  const t = String(title || "").trim();
  if (!t) return null;
  if (/^(a )?diary entry\b/i.test(t)) return null;
  if (/^diary\s*(·|$)/i.test(t)) return null;
  if (/^ex:[\w.-]+/i.test(t)) return null;
  return t;
}
