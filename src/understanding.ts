/**
 * A memory's stored understanding, as the gateway serves it (understanding
 * pass, backlog entity 0001; abstractgateway entity_understanding.py at
 * 1b3832b7): the record read (GET …/records/{id}/verbatim) carries memory's
 * fields under memory's names, all fifteen on every non-diary answer —
 * `digest, digest_method, digest_version, version_count, authored_by
 * {kind, id}, reader {provider, model, thinking}, understood_at, cause,
 * target, target_type, card_revision, source_count, narrated,
 * narration_version, replaced_by` — null where the store holds none, never
 * omitted; plus `versions`, memory's list verbatim (oldest first, each row
 * with `author`, `reader` ({} for a mechanical reading), `cause` {cause, …}
 * and `current`). A diary-shaped answer carries none of it.
 *
 * Three states, never confused:
 *   - a value: shown;
 *   - `null`: not computed yet — shown as such (NOT_YET);
 *   - a missing key: a gateway that does not serve the understanding — ONE
 *     sentence (UNSERVED_SENTENCE), never a silent fallback.
 *
 * Who wrote the words is read from `authored_by` (and `digest_method` for
 * mechanical text), never inferred from the text. Pure: no DOM, no fetch.
 */

/** What a `null` reads as: the gateway has not computed it yet. */
export const NOT_YET = "not computed yet";

/** The one sentence a gateway without the understanding fields gets. */
export const UNSERVED_SENTENCE = "This gateway does not serve stored understanding yet.";

/** What mechanical words are, in the card's few words (MECHANICAL_WORDS'
 * own clause: one wording, Detail and the hover card). */
export const PLACEHOLDER_WORDS = "a placeholder until he understands it";

/** Mechanical words (a `mechanical-*` digest): a placeholder. */
export const MECHANICAL_WORDS = `mechanical — ${PLACEHOLDER_WORDS}`;

/** What a reading whose words were cut when they were saved shows instead
 * of them (the gateway's `cut`, abstractgateway entity_understanding
 * cut_when_saved at 5c2f5db7: derived from the WRITER of the reading — a
 * retired writer that cut its summary when it saved it — never from the
 * text): the hover card and Detail show the record's title and this line.
 * The whole stored text stays readable in Detail (the words as saved, the
 * exchange). */
export const CUT_SUMMARY_LINE = "Older record: its summary was cut when saved; he rewrites it in his sleep.";

/** Who wrote a reading (abstractmemory understanding.AUTHOR_KINDS, plus
 * memory's "unrecorded" for an older reading it did not see written). */
export interface ServedAuthor {
  kind: string;
  id: string | null;
}

/** The model that wrote a reading. */
export interface ServedReader {
  provider: string | null;
  model: string | null;
}

/** One reading the record has had (abstractmemory UnderstandingVersion,
 * as the journal keeps it: `author`, `reader`, `cause` {cause, …}, and
 * `current` on the reading the record holds now). */
export interface UnderstandingVersion {
  version: number;
  current: boolean;
  text: string;
  author: ServedAuthor | null;
  reader: ServedReader | null;
  cause: string | null;
  understood_at: string | null;
  digest_method: string | null;
}

export interface Understanding {
  /** The stored summary: for a summary, a card or a dream it IS the content. */
  digest: string | null;
  digest_method: string | null;
  digest_version: number | null;
  version_count: number | null;
  authored_by: ServedAuthor | null;
  reader: ServedReader | null;
  understood_at: string | null;
  cause: string | null;
  /** Every reading the record has had, as served (the current one included). */
  versions: UnderstandingVersion[] | null;
  /** A card's subject type (world models only; null elsewhere). */
  target_type: string | null;
  /** The current reading's words were cut when saved (the gateway's `cut`;
   * CUT_SUMMARY_LINE). null from a gateway that does not flag it (before
   * abstractgateway 5c2f5db7): the words show as stored. */
  cut: boolean | null;
}

export type UnderstandingRead = { served: true; understanding: Understanding } | { served: false; missing: string[] };

/** The fifteen keys every non-diary block carries (null when not computed
 * yet): abstractgateway entity_understanding.UNDERSTANDING_KEYS. */
export const BLOCK_KEYS = [
  "digest",
  "digest_method",
  "digest_version",
  "version_count",
  "authored_by",
  "reader",
  "understood_at",
  "cause",
  "target",
  "target_type",
  "card_revision",
  "source_count",
  "narrated",
  "narration_version",
  "replaced_by",
] as const;

/** The keys every non-diary record read carries: the block, then `versions`. */
export const UNDERSTANDING_KEYS = [...BLOCK_KEYS, "versions"] as const;

type Body = Record<string, unknown>;

function isObject(v: unknown): v is Body {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A key's value by its type; a value of another type is named in `bad`. */
function strOrNull(body: Body, key: string, bad: string[], at = key): string | null {
  const v = body[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  bad.push(at);
  return null;
}

function numOrNull(body: Body, key: string, bad: string[], at = key): number | null {
  const v = body[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  bad.push(at);
  return null;
}

function boolOrNull(body: Body, key: string, bad: string[]): boolean | null {
  const v = body[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  bad.push(key);
  return null;
}

function authorOrNull(v: unknown, bad: string[], at: string): ServedAuthor | null {
  if (v === null || v === undefined) return null;
  if (isObject(v) && typeof v.kind === "string") return { kind: v.kind, id: typeof v.id === "string" && v.id ? v.id : null };
  // An empty object is a reading with no author recorded: not computed.
  if (isObject(v) && Object.keys(v).length === 0) return null;
  bad.push(at);
  return null;
}

function readerOrNull(v: unknown, bad: string[], at: string): ServedReader | null {
  if (v === null || v === undefined) return null;
  if (!isObject(v)) {
    bad.push(at);
    return null;
  }
  // A mechanical or operator reading has no reader: {} (memory) — not a model.
  if (Object.keys(v).length === 0) return null;
  return { provider: typeof v.provider === "string" && v.provider ? v.provider : null, model: typeof v.model === "string" && v.model ? v.model : null };
}

/** A version's cause as the journal keeps it ({cause, task_id, …}). */
function versionCause(v: unknown, bad: string[], at: string): string | null {
  if (v === null || v === undefined) return null;
  if (isObject(v)) {
    if (v.cause === null || v.cause === undefined) return null;
    if (typeof v.cause === "string") return v.cause;
  }
  bad.push(at);
  return null;
}

const VERSION_KEYS = ["version", "text", "author", "reader", "cause", "understood_at", "digest_method", "current"] as const;

function readVersions(v: unknown, missing: string[], bad: string[]): UnderstandingVersion[] | null {
  if (v === null) return null;
  if (!Array.isArray(v)) {
    bad.push("versions");
    return null;
  }
  const out: UnderstandingVersion[] = [];
  v.forEach((row, i) => {
    const at = `versions[${i}]`;
    if (!isObject(row)) {
      bad.push(at);
      return;
    }
    const gone = VERSION_KEYS.filter((k) => !(k in row));
    if (gone.length) {
      missing.push(...gone.map((k) => `${at}.${k}`));
      return;
    }
    const version = numOrNull(row, "version", bad, `${at}.version`);
    const text = strOrNull(row, "text", bad, `${at}.text`);
    if (version === null || text === null) {
      if (version === null && !bad.includes(`${at}.version`)) bad.push(`${at}.version`);
      if (text === null && !bad.includes(`${at}.text`)) bad.push(`${at}.text`);
      return;
    }
    if (typeof row.current !== "boolean") {
      bad.push(`${at}.current`);
      return;
    }
    out.push({
      version,
      current: row.current,
      text,
      author: authorOrNull(row.author, bad, `${at}.author`),
      reader: readerOrNull(row.reader, bad, `${at}.reader`),
      cause: versionCause(row.cause, bad, `${at}.cause`),
      understood_at: strOrNull(row, "understood_at", bad, `${at}.understood_at`),
      digest_method: strOrNull(row, "digest_method", bad, `${at}.digest_method`),
    });
  });
  return out;
}

/** The record read's understanding: served (every key present, each of its
 * type) or not, with the keys it lacks or could not read. `kind` is the
 * record's kind (only a world model's type is read). */
export function readUnderstanding(body: Body, kind: string | undefined): UnderstandingRead {
  const missing: string[] = UNDERSTANDING_KEYS.filter((k) => !(k in body));
  if (missing.length) return { served: false, missing };
  const bad: string[] = [];
  const understanding: Understanding = {
    digest: strOrNull(body, "digest", bad),
    digest_method: strOrNull(body, "digest_method", bad),
    digest_version: numOrNull(body, "digest_version", bad),
    version_count: numOrNull(body, "version_count", bad),
    authored_by: authorOrNull(body.authored_by, bad, "authored_by"),
    reader: readerOrNull(body.reader, bad, "reader"),
    understood_at: strOrNull(body, "understood_at", bad),
    cause: strOrNull(body, "cause", bad),
    versions: readVersions(body.versions, missing, bad),
    target_type: kind === "world_model" ? strOrNull(body, "target_type", bad) : null,
    // Not one of the fifteen: a gateway before 5c2f5db7 serves no `cut`.
    cut: boolOrNull(body, "cut", bad),
  };
  if (missing.length || bad.length) return { served: false, missing: [...missing, ...bad] };
  return { served: true, understanding };
}

// ------------------------------------------------------------ in words

const filled = (s: string | null | undefined): string | null => (typeof s === "string" && s.trim() ? s.trim() : null);

/** A `mechanical-*` digest method: the driver's floor, not an understanding
 * (memory's method names; read from the served field, never the text). */
export function isMechanicalMethod(digestMethod: string | null | undefined): boolean {
  return (filled(digestMethod) ?? "").startsWith("mechanical");
}

/** Mechanical words (the driver's floor, a placeholder), from the served
 * fields only: the author says so (authorWords' rule: `mechanical`, or a
 * `mechanical-*` method under an author that claims no words of its own),
 * or no author is recorded and the method is a `mechanical-*` one. Never
 * read from the title or the words. */
export function isMechanicalReading(author: ServedAuthor | null, digestMethod: string | null | undefined): boolean {
  if (!author) return isMechanicalMethod(digestMethod);
  return authorWords(author, digestMethod ?? null, null) === MECHANICAL_WORDS;
}

/** Who wrote the words, in end-user words (no ids, no labels). */
export function authorWords(author: ServedAuthor | null, digestMethod: string | null, reader: ServedReader | null): string {
  if (!author) return `who wrote it: ${NOT_YET}`;
  if (author.kind === "entity-mind") return "his own words";
  if (author.kind === "capability-model") return `a passive memory process, part of him (${filled(reader?.model) ?? `model ${NOT_YET}`})`;
  if (author.kind === "operator") return "set by the operator";
  if (author.kind === "mechanical" || isMechanicalMethod(digestMethod)) return MECHANICAL_WORDS;
  if (author.kind === "unrecorded") return "who wrote it was not recorded";
  return `written by ${author.kind.replace(/[_-]+/g, " ")}`;
}

const CAUSE_WORDS: Record<string, string> = {
  formation: "first formed",
  evidence: "rewritten after new evidence",
  ripple: "revisited after a surprise",
  backfill: "backfilled — an older memory, understood again",
  operator: "changed by the operator",
  revert: "restored from an earlier understanding",
};

/** Why this reading was written. */
export function causeWords(cause: string | null): string {
  const c = filled(cause);
  if (!c) return `why: ${NOT_YET}`;
  return CAUSE_WORDS[c] ?? c.replace(/[_-]+/g, " ");
}

/** A day in words ("8 Nov 2026"), in the viewer's zone unless one is given;
 * an unreadable stamp is shown as served. */
export function dayWords(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", ...(timeZone ? { timeZone } : {}) });
}

/** "understood as of <day>". */
export function asOfWords(understoodAt: string | null, timeZone?: string): string {
  const at = filled(understoodAt);
  return at ? `understood as of ${dayWords(at, timeZone)}` : `understood as of: ${NOT_YET}`;
}

export interface ProvenanceWords {
  who: string;
  when: string;
  why: string;
}

/** The provenance line's three parts, from the served fields only. */
export function provenanceWords(
  u: Pick<Understanding, "authored_by" | "digest_method" | "cause" | "understood_at" | "reader">,
  timeZone?: string,
): ProvenanceWords {
  return { who: authorWords(u.authored_by, u.digest_method, u.reader), when: asOfWords(u.understood_at, timeZone), why: causeWords(u.cause) };
}

/** The line as read: "His own words · understood as of 8 Nov 2026 · first formed". */
export function provenanceLine(p: ProvenanceWords): string {
  const who = p.who.charAt(0).toUpperCase() + p.who.slice(1);
  return `${who} · ${p.when} · ${p.why}`;
}

/** The hover card's hint under the summary, in Detail's words: a
 * mechanical reading is PLACEHOLDER_WORDS; any other is who wrote it
 * (authorWords), why — the head of causeWords, before its " — " gloss
 * ("backfilled") — and the day it is understood as of. A part the gateway
 * has not computed is left out of the hint (Detail names it). */
export function cardProvenance(
  u: Pick<Understanding, "authored_by" | "digest_method" | "cause" | "understood_at" | "reader">,
  timeZone?: string,
): string {
  const who = authorWords(u.authored_by, u.digest_method, u.reader);
  // Detail's rule (authorWords), and a mechanical method with no author
  // recorded: still the driver's floor.
  if (isMechanicalReading(u.authored_by, u.digest_method)) return PLACEHOLDER_WORDS;
  const parts = [who];
  if (filled(u.cause)) parts.push(causeWords(u.cause).split(" — ")[0]);
  const at = filled(u.understood_at);
  if (at) parts.push(dayWords(at, timeZone));
  return parts.join(" · ");
}

/** The readings before the current one (memory marks it `current`),
 * newest first (null: not computed yet). */
export function earlierVersions(u: Pick<Understanding, "versions">): UnderstandingVersion[] | null {
  if (u.versions === null) return null;
  return u.versions.filter((v) => !v.current).sort((a, b) => b.version - a.version);
}

/** One earlier reading's head: "7 Nov 2026 · mechanical — … · first formed". */
export function versionHead(v: UnderstandingVersion, timeZone?: string): string {
  const at = filled(v.understood_at);
  const when = at ? dayWords(at, timeZone) : `date ${NOT_YET}`;
  return `${when} · ${authorWords(v.author, v.digest_method, v.reader)} · ${causeWords(v.cause)}`;
}

/** The stored summary to lead with, or null when not computed yet. */
export function servedDigest(u: Pick<Understanding, "digest">): string | null {
  return filled(u.digest);
}
