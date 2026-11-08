/**
 * A memory's stored understanding, as the gateway serves it (understanding
 * pass, backlog entity 0001; DESIGN §4/§10): the record read
 * (GET …/records/{id}/verbatim) carries memory's display block verbatim —
 * `digest, digest_method, digest_version, version_count, authored_by
 * {kind, id}, reader {provider, model, thinking}, understood_at, cause` and
 * `versions` (every reading the record has had); a card adds `target,
 * target_type, card_revision, source_count`. Absent values are served as
 * `null`, never omitted.
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

/** Mechanical words (a `mechanical-*` digest): a placeholder. */
export const MECHANICAL_WORDS = "mechanical — a placeholder until he understands it";

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
 * as the journal keeps it: `author`, `reader`, `cause` {cause, …}). */
export interface UnderstandingVersion {
  version: number;
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
}

export type UnderstandingRead = { served: true; understanding: Understanding } | { served: false; missing: string[] };

/** The keys every record read carries (null when not computed yet). */
export const UNDERSTANDING_KEYS = ["digest", "digest_method", "digest_version", "version_count", "authored_by", "reader", "understood_at", "cause", "versions"] as const;

/** The card key this app reads (a world model's read carries it). */
export const CARD_KEYS = ["target_type"] as const;

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

const VERSION_KEYS = ["version", "text", "author", "reader", "cause", "understood_at", "digest_method"] as const;

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
    out.push({
      version,
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
 * record's kind (a world model's read carries the card keys). */
export function readUnderstanding(body: Body, kind: string | undefined): UnderstandingRead {
  const missing: string[] = UNDERSTANDING_KEYS.filter((k) => !(k in body));
  if (kind === "world_model") missing.push(...CARD_KEYS.filter((k) => !(k in body)));
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
  };
  if (missing.length || bad.length) return { served: false, missing: [...missing, ...bad] };
  return { served: true, understanding };
}

// ------------------------------------------------------------ in words

const filled = (s: string | null | undefined): string | null => (typeof s === "string" && s.trim() ? s.trim() : null);

/** Who wrote the words, in end-user words (no ids, no labels). */
export function authorWords(author: ServedAuthor | null, digestMethod: string | null, reader: ServedReader | null): string {
  if (!author) return `who wrote it: ${NOT_YET}`;
  if (author.kind === "entity-mind") return "his own words";
  if (author.kind === "capability-model") return `a passive memory process, part of him (${filled(reader?.model) ?? `model ${NOT_YET}`})`;
  if (author.kind === "operator") return "set by the operator";
  if (author.kind === "mechanical" || (filled(digestMethod) ?? "").startsWith("mechanical")) return MECHANICAL_WORDS;
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

/** The readings before the current one, newest first (null: not computed
 * yet). The current reading is the one numbered `digest_version`. */
export function earlierVersions(u: Pick<Understanding, "versions" | "digest_version">): UnderstandingVersion[] | null {
  if (u.versions === null) return null;
  const rows = u.digest_version === null ? u.versions : u.versions.filter((v) => v.version !== u.digest_version);
  return [...rows].sort((a, b) => b.version - a.version);
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
