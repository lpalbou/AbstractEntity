/**
 * The identity card — "something to know our companion" (a2a 0009).
 *
 * Rendered from the gateway's `GET /entities/{name}/card` (memory's
 * `entity_card()` compositor + gateway overlays) — ONE compositor
 * engine-side; this panel consumes, never derives (the diary_type clamp
 * lesson applied preemptively). Pure read: being described never
 * strengthens him (D2-of-description is engine-pinned).
 *
 * Honesty rules carried into pixels: "current" feelings show their
 * window; the substrate is named; likes and dislikes stay SEPARATE
 * channels (ambivalence preserved); resolved questions only appear when
 * HE resolved them.
 */

import React, { useEffect, useRef, useState } from "react";

import type { FoldState } from "./stream_fold";
import { fetchDiaryEntry, gatewayReadHeaders } from "./stream_source";
import { getCachedText, putCachedText, textCacheKey } from "./text_cache";
import { CUT_SUMMARY_LINE } from "./understanding";
import { WordsLine } from "./words_line";
import { shapeLabel } from "./node_label";
import { AfChip, joinBaseUrl } from "@abstractframework/ui-kit";

/** Namespace prefixes double as icons — the maintainer's read: the prefix
 * says WHAT KIND of thing the entity is relating to. */
const NAMESPACE_ICONS: Record<string, string> = {
  person: "👤",
  agent: "🤖",
  entity: "🫂",
  concept: "💡",
  idea: "💡",
  tool: "🔧",
  place: "📍",
  location: "📍",
  time: "🕰️",
  moment: "🕰️",
};

function targetName(target: string): string {
  const idx = target.indexOf(":");
  return (idx >= 0 ? target.slice(idx + 1) : target).replace(/[_-]+/g, " ");
}

interface CardStatement {
  name?: string;
  /** The statement's self record title (memory's entity_card identity section). */
  title?: string;
  statement?: string;
  value_class?: string;
  /** Its record's summary was cut when saved (a retired writer's stamp), served by the gateway
   * (AbstractGateway 32c9cc05); absent from a gateway before it, or for a statement with no
   * record found. */
  cut?: boolean;
}

/** A statement's words, or, when the gateway says its record was cut when saved (`cut: true`,
 * never read from the text), the one line the hover card shows instead of the cut text's marker
 * lines. */
function StatementWords({ statement, inline }: { statement: CardStatement; inline?: boolean }): React.ReactElement {
  if (statement.cut === true)
    return (
      <span className="ic_cut" data-cut="true">
        {CUT_SUMMARY_LINE}
      </span>
    );
  return <WordsLine text={statement.statement ?? ""} inline={inline} />;
}

interface CardFeeling {
  target: string;
  /** The record's title when the target is a record that has one
   * (memory's entity_card `_standing_entry`); absent for a free identity
   * string ("person:laurent") and for a record stored without one. */
  title?: string;
  net: number;
  positive: number;
  negative: number;
  scarred?: boolean;
  bonded?: boolean;
}

interface EntityCard {
  name: string;
  entity_id: string;
  born?: string;
  age_days?: number;
  mind_substrate?: { provider?: string; model?: string };
  identity?: {
    values?: CardStatement[];
    purposes?: CardStatement[];
    traits?: CardStatement[];
    limits?: CardStatement[];
  };
  /** Canonical shape (memory's entity_card compositor). */
  likes_dislikes?: { likes?: CardFeeling[]; dislikes?: CardFeeling[]; targets_total?: number };
  current_state?: { net?: number; positive?: number; negative?: number; event_count?: number; window_events?: number; top_reasons?: unknown[] };
  /** Pre-compositor gateway shape (fallback for older gateways). */
  feelings?: {
    top_likes?: CardFeeling[];
    top_dislikes?: CardFeeling[];
    recent_mood?: Record<string, unknown>;
  };
  questions?: { open?: unknown[]; pending?: unknown[]; resolved?: unknown[]; resolved_note?: string };
  problems?: unknown[];
  ideas?: unknown[];
  discoveries?: unknown[] | { interests?: unknown[]; unresolved_dreams?: number };
  age_and_context?: {
    journal_seq?: number;
    record_counts?: Record<string, number>;
    records_total?: number;
    diary_entries?: number;
    first_observed_at?: string;
    last_observed_at?: string;
  };
  accumulated_context?: {
    journal_seq?: number;
    records_by_kind?: Record<string, number>;
    diary_entries?: number;
    firsts?: Record<string, unknown>;
  };
  state?: { state?: string; changed_at?: string; reason?: string };
  moments?: Array<Record<string, unknown>>;
  key_moments?: { moments?: Array<Record<string, unknown>>; total?: number };
  /** Memory's lessons section: kind=lesson records and the lessons he
   * wrote in his book (`source: "diary"`), newest first. */
  lessons?: { lessons?: unknown[]; total?: number };
}

type CardState = { phase: "loading" } | { phase: "ready"; card: EntityCard } | { phase: "error"; message: string };

function asText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    return String(o["statement"] ?? o["gist"] ?? o["text"] ?? o["digest"] ?? o["title"] ?? o["question"] ?? JSON.stringify(o));
  }
  return String(item);
}

/** An open question/problem whose card statement is CONTENT-FREE ("Wrote a
 * diary entry (question)…; no gist elected") but which carries an
 * entry_id: fetch HIS WORDS through the operator diary door (text-cached —
 * one biography marker per entry ever, the read-flood lesson). The G1
 * case live on the card (plan v7): the question exists, the words need
 * one hop — this component IS that hop until the engine serves a gist. */
/** A card line's identity across re-reads: its diary entry, else its
 * words. Keying by position let a live re-read that inserted a question
 * show the previous question's fetched words on the wrong line. */
export function itemKey(item: unknown, index: number): string {
  const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  if (typeof o["entry_id"] === "string" && o["entry_id"]) return `e:${o["entry_id"] as string}`;
  const text = asText(item);
  return text ? `t:${text}` : `i:${index}`;
}

/** Unique keys for one list (two identical questions stay two lines). */
export function itemKeys(items: unknown[]): string[] {
  const seen = new Map<string, number>();
  return items.map((it, i) => {
    const k = itemKey(it, i);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return n ? `${k}#${n}` : k;
  });
}

function QuestionLine({ item, icon, baseUrl, entity }: { item: unknown; icon: string; baseUrl: string; entity: string }): React.ReactElement {
  const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  const statement = asText(item);
  const contentFree = /no gist elected/i.test(statement) || /^Wrote a diary entry/i.test(statement);
  const entryId = typeof o["entry_id"] === "string" ? (o["entry_id"] as string) : null;
  const [words, setWords] = useState<string | null>(null);
  useEffect(() => {
    setWords(null); // never another entry's words
    if (!contentFree || !entryId) return;
    let cancelled = false;
    (async () => {
      try {
        const ck = textCacheKey(baseUrl, entity, `diary:${entryId}`);
        let cached = await getCachedText(ck);
        if (!cached) {
          const entry = await fetchDiaryEntry(baseUrl, entity, entryId, "operator review (card question)");
          cached = { text: String(entry.text ?? entry.gist ?? "") };
          if (cached.text) void putCachedText(ck, cached);
        }
        if (!cancelled && cached.text) setWords(cached.text);
      } catch {
        // the statement stays — never a dead line
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contentFree, entryId, baseUrl, entity]);
  return (
    <div className="ic_line">
      {icon} <WordsLine text={words ?? statement} inline />
      {words ? <span className="ic_q_src" title={`His own words, read through the diary door (${statement})`}> — his entry, verbatim</span> : null}
    </div>
  );
}

/** record_counts arrives nested per scope ({life: {episode: 68, …},
 * self: {…}}) — flatten to kind totals. Rendering the raw object was the
 * React #31 crash; never hand React a dict. */
function flattenCounts(raw: Record<string, unknown> | undefined): Array<[string, number]> {
  if (!raw) return [];
  const totals = new Map<string, number>();
  for (const value of Object.values(raw)) {
    if (typeof value === "number") continue; // flat form handled below
    if (value && typeof value === "object") {
      for (const [kind, count] of Object.entries(value as Record<string, unknown>)) {
        if (typeof count === "number") totals.set(kind, (totals.get(kind) ?? 0) + count);
      }
    }
  }
  if (totals.size === 0) {
    for (const [kind, count] of Object.entries(raw)) {
      if (typeof count === "number") totals.set(kind, count);
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

/** Key moments arrive as {kind, at, seq, details:{reason, session_id}} —
 * raw JSON was unreadable (maintainer). One human line per kind. */
const MOMENT_PHRASES: Record<string, { icon: string; phrase: string }> = {
  summon: { icon: "✨", phrase: "Summoned" },
  session_closed: { icon: "🚪", phrase: "A session ended" },
  prelude_refused: { icon: "⛔", phrase: "A summon was refused" },
  sleep: { icon: "🌙", phrase: "Fell asleep" },
  wake: { icon: "🌅", phrase: "Woke" },
  pause: { icon: "⏸️", phrase: "Own time paused" },
  diary_read: { icon: "📖", phrase: "The book was read" },
  first_dream: { icon: "🌌", phrase: "His first dream" },
  first_interest: { icon: "🌱", phrase: "His first interest" },
  first_supersession: { icon: "✏️", phrase: "His first belief revision" },
  valence_peak: { icon: "💗", phrase: "A strong feeling" },
};

/** The feeling events memory keeps as key moments (|magnitude| at the
 * scar/bond band; entity_card.py `_valence_moment`: {type:"valence", kind,
 * target, sign, magnitude, reason, observed_at}). They read as sentences
 * about WHO, never "Appraisal — reason". `who` is "" when no target came. */
const FEELING_PHRASES: Record<string, (who: string, warm: boolean) => { icon: string; phrase: string }> = {
  appraisal: (who, warm) =>
    warm
      ? { icon: "💗", phrase: who ? `A strong, warm feeling about ${who}` : "A strong, warm feeling" }
      : { icon: "🌧️", phrase: who ? `A strong, painful feeling about ${who}` : "A strong, painful feeling" },
  bond: (who) => ({ icon: "🤝", phrase: who ? `A bond with ${who} formed` : "A bond formed" }),
  scar: (who) => ({ icon: "🩹", phrase: who ? `A scar from ${who}` : "A scar" }),
  healing: (who) => ({ icon: "🌿", phrase: who ? `A scar from ${who} healed` : "A scar healed" }),
  break: (who) => ({ icon: "💔", phrase: who ? `The bond with ${who} broke` : "A bond broke" }),
  revalued: (who) => ({ icon: "⚖️", phrase: who ? `He let his past with ${who} weigh less` : "He let a past feeling weigh less" }),
};

/** Who a feeling is about, in words: a name ("person:admin" → "admin"), or
 * for a remembered record ("ex:episode-…") what it is ("an exchange") —
 * never an id. */
export function feelingWho(target: string): string {
  if (!target) return "";
  const rec = /^ex:([a-z_]+)-/.exec(target);
  if (rec) {
    const word = KIND_WORDS[rec[1]]?.[0] ?? rec[1].split("_").join(" ");
    return `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;
  }
  return targetName(target);
}

/** Two shapes reach us: the stream's {kind, at, details:{reason}} and the
 * gateway's "first" milestones {type:"first", what, reason, observed_at}
 * (operator 2026-11-08: the latter rendered as raw JSON). Never JSON. */
export function momentLine(m: Record<string, unknown>): { icon: string; text: string; when: string } {
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const details = (m["details"] && typeof m["details"] === "object" ? m["details"] : {}) as Record<string, unknown>;
  const kind = str(m["kind"]) || str(m["what"]) || str(m["type"]);
  const reason = str(details["reason"]) || str(m["reason"]);
  const known = MOMENT_PHRASES[kind];
  const at = str(m["at"]) || str(m["observed_at"]);
  const when = shortWhen(at);
  const feeling = FEELING_PHRASES[kind];
  if (feeling) {
    const { icon, phrase } = feeling(feelingWho(str(m["target"])), Number(m["sign"]) >= 0);
    return { icon, text: reason ? `${phrase} — ${reason}` : phrase, when };
  }
  if (known) {
    return { icon: known.icon, text: reason ? `${known.phrase} — ${reason}` : known.phrase, when };
  }
  // Unknown kinds: the kind's words and its reason, never the object.
  const title = str(m["title"]) || str(m["digest"]);
  const words = kind ? kind.split("_").join(" ") : "";
  const text = title || (words && reason ? `${words[0].toUpperCase()}${words.slice(1)} — ${reason}` : reason || words || "A moment");
  return { icon: "・", text, when };
}

/** A card timestamp as "MM-DD HH:MM" (the key moments' form). */
function shortWhen(at: string): string {
  return at ? at.slice(5, 16).replace("T", " ") : "";
}

/** One lesson on the card: his words, when, and whether he wrote it in his
 * book (memory marks those `source: "diary"`; the others are lessons his
 * reflections elected). */
export function lessonLine(item: unknown): { text: string; when: string; fromBook: boolean } {
  const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
  return {
    text: asText(item),
    when: shortWhen(typeof o["observed_at"] === "string" ? (o["observed_at"] as string) : ""),
    fromBook: o["source"] === "diary",
  };
}

/** Record kinds in words, singular and plural (end-user copy, never
 * `diarys` or `world_models`). */
const KIND_WORDS: Record<string, [string, string]> = {
  episode: ["exchange", "exchanges"],
  diary: ["diary entry", "diary entries"],
  summary: ["summary", "summaries"],
  world_model: ["world model", "world models"],
  dream: ["dream", "dreams"],
  value: ["value", "values"],
  trait: ["trait", "traits"],
  purpose: ["purpose", "purposes"],
  interest: ["interest", "interests"],
  lesson: ["lesson", "lessons"],
  realization: ["realization", "realizations"],
  observation: ["observation", "observations"],
  claim: ["claim", "claims"],
};

/** The "Life so far" counts, in words (operator: end-user copy, never
 * `diarys` or `world_models`). */
export function kindCountLabel(kind: string, count: number): string {
  const w = KIND_WORDS[kind];
  if (w) return `${count} ${count === 1 ? w[0] : w[1]}`;
  const plain = kind.split("_").join(" ");
  return `${count} ${plain}${count === 1 ? "" : "s"}`;
}

/** The icon of a remembered record a feeling is about, by its kind. */
const RECORD_ICONS: Record<string, string> = {
  episode: "💬",
  diary: "📔",
  world_model: "🌍",
  dream: "🌌",
  summary: "📝",
  interest: "🌱",
  lesson: "📘",
};

/** What a like, a dislike or a person he sees is about, as one card row
 * says it (operator 2026-11-08: a cleaner layout, the NAME or TITLE, never
 * an id): its icon, its kind in words ("person", "exchange", "world
 * model"), and its name — a person's or a tool's name from the target, a
 * remembered record's title from the card brief. A record whose brief
 * came without a title reads "untitled memory" with `titleMissing` set,
 * so the gap shows instead of a hash. */
export interface FeelingLabel {
  icon: string;
  kind: string;
  name: string;
  titleMissing: boolean;
}

export function feelingLabel(target: string, title?: unknown): FeelingLabel {
  const given = typeof title === "string" ? title.trim() : "";
  // A "title" that is the target itself, or another graph id, names nothing.
  const shown = given && given !== target && !/^ex:\S+$/.test(given) ? shapeLabel(given) : "";
  const rec = /^ex:([a-z_]+)-/.exec(target);
  if (rec || !target.includes(":")) {
    // A remembered record (a graph id, or a bare record id).
    const kind = rec ? rec[1] : "memory";
    const word = KIND_WORDS[kind]?.[0] ?? kind.split("_").join(" ");
    return { icon: RECORD_ICONS[kind] ?? "◆", kind: word, name: shown || "untitled memory", titleMissing: !shown };
  }
  const ns = target.split(":", 1)[0].toLowerCase();
  return { icon: NAMESPACE_ICONS[ns] ?? "◆", kind: ns.split("_").join(" "), name: shown || targetName(target), titleMissing: false };
}

/** One feeling row: icon, kind tag, name (and the title-missing tag, the
 * bond/scar marks), the score aligned right; the quote below. */
function FeelingRow({ label, score, marks, quote }: { label: FeelingLabel; score: React.ReactNode; marks?: React.ReactNode; quote: string | null }): React.ReactElement {
  return (
    <div className="ic_like_row">
      <span className="ic_like_icon" aria-hidden="true">
        {label.icon}
      </span>
      <span className="ic_like_what">
        <AfChip size="sm" tone="muted" className="ic_like_kind">
          {label.kind}
        </AfChip>
        <span className={`ic_like_name${label.titleMissing ? " ic_like_untitled" : ""}`} title={label.titleMissing ? undefined : label.name}>
          <WordsLine text={label.name} inline />
        </span>
        {label.titleMissing ? (
          <AfChip size="sm" tone="warning" className="ic_like_missing" title="The card names this memory without its title — the gap is shown, not hidden.">
            title missing
          </AfChip>
        ) : null}
        {marks}
      </span>
      <span className="ic_like_score">{score}</span>
      {quote ? (
        <div className="ic_like_quote">
          <WordsLine text={`“${quote}”`} />
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="ic_section">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

/** The card as drawer content (maintainer's layout ruling: a drawer, not
 * a top button). Fetches on mount, and again whenever `revision` moves —
 * the newest change to the entity on the live stream — keeping the card
 * on screen while the new one is read (no "reading…" flash). */
/** Read the card when it is on screen and it has not been read yet for
 * this entity at this revision of its life. */
export function cardNeedsRead(last: { key: string; revision: number | null } | null, key: string, revision: number | null, shown: boolean): boolean {
  if (!shown) return false;
  return !(last !== null && last.key === key && last.revision === revision);
}

export function IdentityCardContent({
  baseUrl,
  entity,
  fold,
  revision = null,
  shown = true,
}: {
  baseUrl: string;
  entity: string;
  fold: FoldState | null;
  revision?: number | null;
  /** On screen: a hidden card does not re-read; it catches up when shown. */
  shown?: boolean;
}): React.ReactElement {
  const [state, setState] = useState<CardState>({ phase: "loading" });
  const readRef = useRef<{ key: string; revision: number | null } | null>(null);

  useEffect(() => {
    // Another entity is another card: never show the previous one, and
    // read it afresh even if it was read before.
    readRef.current = null;
    setState({ phase: "loading" });
  }, [baseUrl, entity]);

  useEffect(() => {
    const key = `${baseUrl}|${entity}`;
    if (!cardNeedsRead(readRef.current, key, revision, shown)) return;
    let cancelled = false;
    fetch(joinBaseUrl(baseUrl, `api/gateway/entities/${encodeURIComponent(entity)}/card`), { headers: gatewayReadHeaders({ Accept: "application/json" }) })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((card: EntityCard) => {
        if (cancelled) return;
        // Recorded only once read: a read cut short (tab closed, entity
        // switched) is read again next time.
        readRef.current = { key, revision };
        setState({ phase: "ready", card });
      })
      // A failed REFRESH keeps the card already shown; only a first read
      // that fails says so.
      .catch((e) => !cancelled && setState((prev) => (prev.phase === "ready" ? prev : { phase: "error", message: String((e as Error).message || e) })));
    return () => {
      cancelled = true;
    };
  }, [baseUrl, entity, revision, shown]);

  if (state.phase === "loading") return <div className="ev_status">reading the card…</div>;
  if (state.phase === "error") {
    return (
      <div className="ev_status ev_status_error">
        <WordsLine
          text={`Could not read the card: ${state.message}. ${/HTTP 40[13]/.test(state.message) ? "Sign in to the gateway again, then reopen the card." : "The card endpoint needs a gateway with the 0009 build."}`}
        />
      </div>
    );
  }
  return <CardBody card={state.card} fold={fold} baseUrl={baseUrl} entity={entity} />;
}

export function CardBody({ card, fold, baseUrl, entity }: { card: EntityCard; fold: FoldState | null; baseUrl: string; entity: string }): React.ReactElement {
  const born = card.born ? new Date(card.born) : null;
  const substrate = card.mind_substrate;
  // Canonical compositor sections first; older gateway shapes as fallback.
  const likes = card.likes_dislikes?.likes ?? card.feelings?.top_likes ?? [];
  const dislikes = card.likes_dislikes?.dislikes ?? card.feelings?.top_dislikes ?? [];
  const mood =
    card.current_state ??
    (card.feelings?.recent_mood as { window_events?: number; net?: number; top_reasons?: unknown[] } | undefined);
  const openQuestions = card.questions?.open ?? card.questions?.pending ?? [];
  // problems arrives either as a bare array (old inspect shape) or as the
  // compositor's {open, resolved} fold (memory c2572) — read both.
  const problemsRaw = card.problems as unknown;
  const openProblems: unknown[] = Array.isArray(problemsRaw)
    ? problemsRaw
    : problemsRaw && typeof problemsRaw === "object"
      ? ((problemsRaw as { open?: unknown[] }).open ?? [])
      : [];
  const questionKeys = itemKeys(openQuestions);
  const problemKeys = itemKeys(openProblems);
  const interests = Array.isArray(card.discoveries) ? card.discoveries : card.discoveries?.interests ?? [];
  const lessons = Array.isArray(card.lessons?.lessons) ? card.lessons.lessons : [];
  const lessonsTotal = typeof card.lessons?.total === "number" ? card.lessons.total : lessons.length;
  const lessonKeys = itemKeys(lessons);
  const moments = card.key_moments?.moments ?? card.moments ?? [];
  const ctxCanonical = card.age_and_context;
  const ctx = card.accumulated_context;

  // The small description behind each feeling: the most recent recorded
  // REASON for that target, from the same stream the card is composed
  // from (reasons are required engine-side, so one always exists once a
  // feeling does).
  const reasonFor = (target: string): string | null => {
    const standing = fold?.standings.get(target);
    if (!standing || standing.events.length === 0) return null;
    for (let i = standing.events.length - 1; i >= 0; i--) {
      if (standing.events[i].reason) return standing.events[i].reason;
    }
    return null;
  };

  return (
    <div className="ic_body">
      <div className="ic_header_row">
        <div>
          <div className="ic_name">{card.name}</div>
          {/* The internal manifest key (entity:<slug>@<home_id>) is a birth
            * marker, never a display identity (laurent c2513) — the handle
            * is <name>@ip and lives in the app header. Nothing to show
            * here beyond the name. */}
        </div>
        <div className="ic_facts">
          {born ? (
            <span>
              born {born.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} ·{" "}
              {card.age_days === 0 ? "day one" : `${card.age_days} days`}
            </span>
          ) : null}
          {substrate?.model ? (
            <span title={`provider: ${substrate.provider ?? "unknown"} — his mind-substrate; he is told when it changes`}>
              mind: {substrate.model}
            </span>
          ) : null}
          {/* AWAKE-NEVER-RENDERS (spec v6, laurent c203; adversary-B P0
            * finding 1: this row painted the raw state word — the header
            * pill's defect one surface over). The state axis is machine
            * vocabulary: awake maps to the settling-toward-sleep display,
            * other words render as-is (asleep/paused are honest). */}
          {card.state?.state ? (
            <span title={card.state.reason || undefined}>
              {String(card.state.state).toLowerCase() === "awake" ? "settling → sleep" : card.state.state}
            </span>
          ) : null}
        </div>
      </div>

      {card.identity?.values?.length ? (
        <Section title="Values">
          {card.identity.values.map((v, i) => (
            <div key={i} className="ic_value">
              <span className="ic_value_name">
                {/* A cut value keeps its title (memory serves `title`), then the line, as the hover card. */}
                {(v.name ?? (v.cut === true ? v.title : undefined))?.replace(/[_-]+/g, " ")}
                {v.value_class === "core" ? <span className="ic_core"> core</span> : null}
              </span>
              <span className="ic_statement">
                <StatementWords statement={v} inline />
              </span>
            </div>
          ))}
        </Section>
      ) : null}
      {card.identity?.purposes?.length ? (
        <Section title="Purposes">
          {card.identity.purposes.map((v, i) => (
            <div key={i} className="ic_line">
              {/* A cut purpose keeps its title (when served), then the line, as the hover card. */}
              {v.cut === true && v.title ? <span className="ic_value_name">{v.title}</span> : null}
              <StatementWords statement={v} />
            </div>
          ))}
        </Section>
      ) : null}

      <div className="ic_two_col">
        {likes.length ? (
          <Section title="Likes">
            {likes.map((f, i) => (
              <FeelingRow
                key={i}
                label={feelingLabel(f.target, f.title)}
                score={
                  <>
                    <span className="ic_feeling_net ei_feeling_pos">+{f.positive}</span>
                    {f.negative > 0 ? <span className="ic_feeling_net ei_feeling_neg">−{f.negative}</span> : null}
                  </>
                }
                marks={f.bonded ? <span className="ic_mark ic_mark_bond">bond</span> : null}
                quote={reasonFor(f.target)}
              />
            ))}
          </Section>
        ) : null}
        {dislikes.length ? (
          <Section title="Dislikes">
            {dislikes.map((f, i) => (
              <FeelingRow
                key={i}
                label={feelingLabel(f.target, f.title)}
                score={
                  <>
                    <span className="ic_feeling_net ei_feeling_neg">−{f.negative}</span>
                    {f.positive > 0 ? <span className="ic_feeling_net ei_feeling_pos">+{f.positive}</span> : null}
                  </>
                }
                marks={f.scarred ? <span className="ic_mark ic_mark_scar">scar</span> : null}
                quote={reasonFor(f.target)}
              />
            ))}
          </Section>
        ) : null}
      </div>
      {mood && typeof mood.net === "number" ? (
        <div className="ic_window_note wl_p">
          <WordsLine text={`current mood is a window (${mood.window_events ?? "recent"} recent feeling events, net ${mood.net >= 0 ? `+${mood.net}` : mood.net}) — never a frozen point.`} />
        </div>
      ) : null}

      {/* SUBJECTIVE REPUTATION (maintainer, 2026-07-08 22:29: each entity's
        * own graph IS its perception of others' reputations — the personal
        * layer beside the city's collective board). People and entities
        * only; tools/concepts stay in likes/dislikes. Read from the fold:
        * accumulated dual-channel feelings per social target, with the
        * marks (bond/scar) and the latest reason as testimony. */}
      {fold ? (() => {
        const social = [...fold.standings.values()]
          .filter((s) => /^(person|entity):/.test(s.target_id))
          .sort((a, b) => b.positive + b.negative - (a.positive + a.negative));
        if (social.length === 0) return null;
        return (
          <Section title="How he sees others">
            {social.map((s) => {
              const net = s.positive - s.negative;
              const latest = [...s.events].reverse().find((e) => e.reason)?.reason ?? null;
              return (
                <FeelingRow
                  key={s.target_id}
                  label={feelingLabel(s.target_id)}
                  score={
                    <>
                      <span className={`ic_feeling_net ${net >= 0 ? "ei_feeling_pos" : "ei_feeling_neg"}`}>{net >= 0 ? `+${net}` : `${net}`}</span>
                      <span className="ic_rep_channels" title="both channels stay visible — a hundred small joys and one deep wound are both true">
                        (+{s.positive} / −{s.negative})
                      </span>
                    </>
                  }
                  marks={
                    <>
                      {s.bonds.length > 0 ? <span className="ic_mark ic_mark_bond">bond</span> : null}
                      {s.scars.length > 0 ? <span className="ic_mark ic_mark_scar">scar</span> : null}
                    </>
                  }
                  quote={latest}
                />
              );
            })}
            <div className="ic_window_note wl_p">
              <WordsLine text="his own accumulated perception, from lived interactions — the personal layer beside the environment's collective record." />
            </div>
          </Section>
        );
      })() : null}

      {/* WHAT MOVES HIM (operator 2026-07-15 pm: "interests is only one
        * side of an identity — I don't see questions or tensions"). The
        * three drivers render ALWAYS, empty states included — an identity
        * dimension that happens to be empty is a fact worth seeing, not a
        * section to hide. These are his wake reasons: curiosity
        * (questions), wrongness (tensions/problems), direction (interests). */}
      <Section title="Open questions">
        {openQuestions.length ? (
          openQuestions.map((q, i) => <QuestionLine key={questionKeys[i]} item={q} icon="❓" baseUrl={baseUrl} entity={entity} />)
        ) : (
          <div className="ic_window_note wl_p">
            <WordsLine text="none right now — open questions form when something he met stays unanswered (they are wake reasons: curiosity that can rouse his own time)." />
          </div>
        )}
      </Section>
      {card.questions?.resolved?.length ? (
        <Section title="Questions he resolved">
          {card.questions.resolved.map((q, i) => (
            <div key={i} className="ic_line ic_resolved">
              ✅ <WordsLine text={asText(q)} inline />
            </div>
          ))}
        </Section>
      ) : null}
      <Section title="Tensions (open problems)">
        {openProblems.length ? (
          openProblems.map((p, i) => <QuestionLine key={problemKeys[i]} item={p} icon="⚠️" baseUrl={baseUrl} entity={entity} />)
        ) : (
          <div className="ic_window_note wl_p">
            <WordsLine text="none right now — a tension is something WRONG that needs fixing (distinct from a question); it forms when he names a problem and stands until repaired." />
          </div>
        )}
      </Section>
      <Section title="Interests">
        {interests.length ? (
          interests.map((d, i) => (
            <div key={i} className="ic_line">
              🌱 <WordsLine text={asText(d)} inline />
            </div>
          ))
        ) : (
          <div className="ic_window_note wl_p">
            <WordsLine text="none yet — interests are self-grown direction, elected in his own reflections." />
          </div>
        )}
      </Section>
      <Section title="Lessons">
        {lessons.length ? (
          <>
            {lessons.map((l, i) => {
              const line = lessonLine(l);
              return (
                <div key={lessonKeys[i]} className="ic_line ic_moment">
                  <span className="ic_moment_icon">📘</span> <WordsLine text={line.text} inline />
                  {line.fromBook ? <span className="ic_lesson_src" title="He wrote this lesson in his book (a diary entry he marked as a lesson)">from his book</span> : null}
                  {line.when ? <span className="ei_feeling_when">{line.when}</span> : null}
                </div>
              );
            })}
            {lessonsTotal > lessons.length ? (
              <div className="ic_window_note wl_p">
                <WordsLine text={`the ${lessons.length} newest of ${lessonsTotal} lessons.`} />
              </div>
            ) : null}
          </>
        ) : (
          <div className="ic_window_note wl_p">
            <WordsLine text="none yet — a lesson is something he learned and chose to keep, in his book or in his reflections." />
          </div>
        )}
      </Section>

      {moments.length ? (
        <Section title="Key moments">
          {moments.map((m, i) => {
            const line = momentLine(m as Record<string, unknown>);
            return (
              <div key={i} className="ic_line ic_moment">
                <span className="ic_moment_icon">{line.icon}</span> <WordsLine text={line.text} inline />
                {line.when ? <span className="ei_feeling_when">{line.when}</span> : null}
              </div>
            );
          })}
        </Section>
      ) : null}

      {ctxCanonical || ctx ? (
        <Section title="Life so far">
          <div className="ic_ctx">
            <span title="journal sequence — every remembered moment">{ctxCanonical?.journal_seq ?? ctx?.journal_seq ?? "—"} moments</span>
            <span>📔 {ctxCanonical?.diary_entries ?? ctx?.diary_entries ?? 0} book entries</span>
            {flattenCounts(ctxCanonical?.record_counts ?? ctx?.records_by_kind).map(([kind, count]) => (
              <span key={kind}>{kindCountLabel(kind, count)}</span>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="ic_footer_note wl_p">
        <WordsLine text="A pure read — being described never strengthens his memories (engine-pinned)." />
      </div>
    </div>
  );
}
