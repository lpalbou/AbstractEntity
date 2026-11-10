/**
 * The turn probe's readers: what a tool call asked, what it returned, and
 * the system prompt's sections — each parsed from a format OUR OWN code
 * emits (cited per reader), never guessed from model behaviour. Anything a
 * reader does not recognise comes back as `text` and renders as Markdown.
 *
 * Where the data comes from:
 * - tool_details on the visit lane: abstractgateway entity_visits
 *   `_ledger_tool_details` — `arg` is `json.dumps(arguments)` cut at 200
 *   characters with "…" (`_TOOL_ARG_EXCERPT_CHARS`), `result` the tool's
 *   output as returned, `success` the ledger's flag.
 * - tool_details on the hosted chat lane: abstractruntime identity/chat.py
 *   (the tool round) — `arg` is the block body with whitespace folded, cut
 *   at 120 characters (the path for write_file/read_file), `result` the
 *   executor's string.
 * - outputs: abstractruntime identity/tools.py (TOOL_DESCRIPTORS executors,
 *   `execute_tool_elections`) and identity/memory_reader.py.
 * - system_prompt: abstractruntime identity/prelude.py
 *   (`render_summon_prelude`) + identity/chat.py (`compose_system_base`,
 *   and the per-turn presence / MEMORIES / FEELINGS blocks of the hosted
 *   lane).
 */

// ------------------------------------------------------------- the ask

/** How the asked-for thing reads: a quoted query, a link, a code-like
 * address (path, #tag, entry id, command), a count, or plain words. */
export type AskForm = "quote" | "link" | "code" | "count" | "plain";

/** The argument each tool declares (abstractruntime identity/tools.py
 * TOOL_DESCRIPTORS `properties`), with the sentence that says what the
 * call asked. `empty` is what an absent optional argument means there. */
const TOOL_ASKS: Record<string, { key: string; verb: string; form: AskForm; empty?: string }> = {
  web_search: { key: "query", verb: "Searched the web for", form: "quote" },
  fetch_url: { key: "url", verb: "Read the web page", form: "link" },
  diary_list: { key: "limit", verb: "Listed his latest diary entries", form: "count", empty: "the 5 most recent" },
  diary_read: { key: "entry", verb: "Read a diary entry", form: "code" },
  read_memory: { key: "tag", verb: "Read a memory in full", form: "code" },
  search_memory: { key: "query", verb: "Searched his memory for", form: "quote" },
  recent_memories: { key: "window", verb: "Looked back over his recent memories", form: "plain", empty: "the last 2 days" },
  feelings_about: { key: "target", verb: "Looked into his feelings about", form: "code" },
  write_file: { key: "path", verb: "Wrote a file in his workspace", form: "code" },
  read_file: { key: "path", verb: "Read a file in his workspace", form: "code" },
  list_files: { key: "path", verb: "Listed the files in his workspace", form: "code", empty: "the whole workspace" },
  execute_command: { key: "command", verb: "Ran a program in his workspace", form: "code" },
};

export interface ToolAsk {
  /** "Searched the web for" — what the call did, in words. */
  verb: string;
  /** The thing asked about (a query, a url, a path…), or null. */
  object: string | null;
  form: AskForm;
  /** Other arguments, as written. */
  extra: Array<[string, string]>;
  /** The argument text as served, when it could not be read as arguments
   * (the visit lane's cut JSON excerpt): shown as is, never half-parsed. */
  raw: string | null;
  /** How the recorded argument was shortened, when the record says so. */
  note: string | null;
}

/** An argument's value in plain words: a string or a number as it is; an object or a list by its
 * size ("an object with 3 fields", "a list of 2 items"), never its JSON (operator rule: a tool's
 * key parameters in plain words; a nested one opened as kilobytes of braces, review 2b-3). */
function argValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.length ? `a list of ${v.length} ${v.length === 1 ? "item" : "items"}` : "an empty list";
  if (typeof v === "object") {
    const n = Object.keys(v as object).length;
    return n ? `an object with ${n} ${n === 1 ? "field" : "fields"}` : "an empty object";
  }
  return String(v);
}

/** The visit lane keeps `json.dumps(arguments)` up to 200 characters and
 * ends a longer one with "…" (abstractgateway entity_visits
 * `_TOOL_ARG_EXCERPT_CHARS`). The chat lane keeps the block body's first
 * 120 characters, with no mark (abstractruntime chat.py tool round,
 * `[:120]`) — except read_file/write_file, whose recorded arg is the path. */
export const VISIT_ARG_CHARS = 200;
export const CHAT_ARG_CHARS = 120;

/** What a call asked, from its name and its served `arg`: a JSON object of
 * arguments (visit lane) or the block body (chat lane). */
export function describeToolAsk(name: string, arg: string | undefined): ToolAsk {
  const spec = TOOL_ASKS[name];
  const text = String(arg ?? "").trim();
  const verb = spec ? spec.verb : `Used the tool ${name}`;
  const form: AskForm = spec ? spec.form : "plain";
  const absent = (extra: Array<[string, string]>): ToolAsk => ({ verb, object: spec?.empty ?? null, form: "plain", extra, raw: null, note: null });
  if (text.startsWith("{")) {
    let args: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      args = null;
    }
    if (args) {
      const key = spec?.key;
      const value = key && key in args ? argValue(args[key]).trim() : "";
      const extra = Object.entries(args)
        .filter(([k]) => k !== key)
        .map(([k, v]) => [k, argValue(v)] as [string, string]);
      return value ? { verb, object: value, form, extra, raw: null, note: null } : absent(extra);
    }
    // The visit lane's cut excerpt: its length plus the gateway's "…".
    if (text.endsWith("…") && text.length === VISIT_ARG_CHARS + 1) {
      return { verb, object: null, form: "plain", extra: [], raw: text, note: `the arguments as recorded (visit turns keep their first ${VISIT_ARG_CHARS} characters)` };
    }
  }
  if (!text) return absent([]);
  const chatCut = text.length === CHAT_ARG_CHARS && name !== "read_file" && name !== "write_file";
  return { verb, object: text, form, extra: [], raw: null, note: chatCut ? `the argument as recorded (chat turns keep its first ${CHAT_ARG_CHARS} characters)` : null };
}

// ---------------------------------------------------------- the result

export interface WebResult {
  title: string;
  snippet: string;
  url: string;
}

export interface MemoryHit {
  tag: string;
  kind: string;
  date: string;
  origin: string;
  text: string;
  /** The diary entry id the line names for a reread, when it does. */
  reread: string | null;
}

export interface BookHit {
  kind: string;
  visibility: string;
  date: string;
  gist: string;
  entryId: string;
}

export type ListingLine =
  | { type: "hit"; hit: MemoryHit }
  | { type: "book"; hit: BookHit }
  | { type: "heading"; text: string }
  | { type: "note"; text: string }
  | { type: "text"; text: string };

export type ToolResultView =
  | { type: "empty" }
  | { type: "failed"; text: string }
  | { type: "web"; query: string; results: WebResult[] }
  | { type: "web_none"; query: string }
  | { type: "page"; url: string; title: string; content: string; truncation: string | null; cap: number | null }
  | { type: "listing"; head: string; lines: ListingLine[] }
  | { type: "file"; path: string; size: string; content: string }
  | { type: "text"; text: string };

/** abstractruntime identity/tools.py `_run_web_search`: "Search results
 * for: <query>" then, per result, "- <title>\n  <snippet>\n  (<url>)";
 * or "No results found for: <query>". Null when the text has another
 * shape (abstractcore's raw payload is handed over unformatted then). */
export function parseWebSearch(text: string): ToolResultView | null {
  const none = /^No results found for: ([\s\S]*)$/.exec(text);
  if (none) return { type: "web_none", query: none[1] };
  const lines = text.split("\n");
  const head = /^Search results for: (.*)$/.exec(lines[0] ?? "");
  if (!head || (lines.length - 1) % 3 !== 0 || lines.length < 4) return null;
  const results: WebResult[] = [];
  for (let i = 1; i < lines.length; i += 3) {
    const t = /^- (.*)$/.exec(lines[i]);
    const s = /^ {2}(.*)$/.exec(lines[i + 1]);
    const u = /^ {2}\((.*)\)$/.exec(lines[i + 2]);
    if (!t || !s || !u) return null;
    results.push({ title: t[1].trim(), snippet: s[1].trim(), url: u[1].trim() });
  }
  return { type: "web", query: head[1], results };
}

/** abstractruntime identity/tools.py `_run_fetch_url`: "Fetched: <url>",
 * optional "\nTitle: <title>", a blank line, the page text, and at most a
 * labelled "#TRUNCATION (page longer than N chars; …)" last line. */
export function parseFetchedPage(text: string): ToolResultView | null {
  const m = /^Fetched: ([^\n]*)(?:\nTitle: ([^\n]*))?\n\n([\s\S]*)$/.exec(text);
  if (!m) return null;
  let content = m[3];
  let truncation: string | null = null;
  const cut = /\n#TRUNCATION \(([^\n]*)\)$/.exec(content);
  if (cut) {
    truncation = cut[1];
    content = content.slice(0, cut.index);
  }
  const cap = truncation ? /^page longer than (\d+) chars/.exec(truncation) : null;
  return { type: "page", url: m[1], title: m[2] ?? "", content, truncation, cap: cap ? Number(cap[1]) : null };
}

// abstractruntime identity/memory_reader.py (search_memory and
// recent_memories): a graph line is "- #<tag> [<kind> <date> - <origin>]
// <text>" with an optional " (reread: diary_read <id>)" tail; a book line
// is "- [<kind>/<visibility> <date>] <gist> - reread: diary_read <id>".
const GRAPH_LINE = /^- #(\S+) \[(\S+) (\S*) - ([^\]]*)\] ([\s\S]*)$/;
const BOOK_LINE = /^- \[([^/\]\s]+)\/(\S+) (\S*)\] ([\s\S]*) - reread: diary_read (\S+)$/;
const REREAD_TAIL = / \(reread: diary_read (\S+)\)$/;

function listingLine(line: string): ListingLine {
  const g = GRAPH_LINE.exec(line);
  if (g) {
    const r = REREAD_TAIL.exec(g[5]);
    const hit: MemoryHit = {
      tag: g[1],
      kind: g[2],
      date: g[3],
      origin: g[4],
      text: r ? g[5].slice(0, r.index) : g[5],
      reread: r ? r[1] : null,
    };
    return { type: "hit", hit };
  }
  const b = BOOK_LINE.exec(line);
  if (b) return { type: "book", hit: { kind: b[1], visibility: b[2], date: b[3], gist: b[4], entryId: b[5] } };
  if (/^By MEANING \(not letters\), the closest memories are:$/.test(line)) return { type: "heading", text: "Closest by meaning (no exact match)" };
  if (/^#FALLBACK /.test(line)) return { type: "note", text: line.replace(/^#FALLBACK /, "") };
  return { type: "text", text: line };
}

/** search_memory ("Searched your memory and your book for: …") and
 * recent_memories ("Your trail through … (newest first):"): the head
 * line, then memory and book lines as rows, other lines as text. Null
 * when the head is not one of those two. */
export function parseMemoryListing(text: string): ToolResultView | null {
  const lines = text.split("\n");
  const head = lines[0] ?? "";
  if (!/^Searched your memory and your book for: /.test(head) && !/^Your trail through .* \(newest first\):$/.test(head)) return null;
  return { type: "listing", head, lines: lines.slice(1).filter((l) => l.trim() !== "").map(listingLine) };
}

/** abstractruntime identity/tools.py WorkspaceRoot.read_file: "--- <path>
 * (<size>) ---" then the file's text as stored. */
export function parseFileRead(text: string): ToolResultView | null {
  const m = /^--- (.+) \(([^()\n]*)\) ---\n([\s\S]*)$/.exec(text);
  return m ? { type: "file", path: m[1], size: m[2], content: m[3] } : null;
}

/** How our own code words a call that did not work, per tool (exact
 * strings or prefixes, from the producers):
 * - every tool: execute_tool_elections "(the <name> call failed: …)";
 *   tools.py executors "(the <name> tool is not enabled in this session)".
 * - fetch_url: tools.py `_run_fetch_url` "(fetch_url needs a URL)",
 *   "(fetch_url needs an http(s) URL; got …)", "(could not read <url>: …)",
 *   "(read <url> but found no readable text)".
 * - search_memory / recent_memories / read_memory: memory_reader.py
 *   "search_memory needs words to look for…", "(your memory could not be
 *   searched right now: …)", "(your memory could not be read right now: …)",
 *   "recent_memories could not read the window …", "recent_memories needs a
 *   window larger than zero…", "read_memory needs the #tag…", "#<tag> is
 *   ambiguous: …", "No memory with tag #…", "(the memory's full words could
 *   not be loaded: …)".
 * - feelings_about: memory_reader.py `feelings_about_text` "(feelings_about
 *   needs a target…", "(the feelings story is unavailable on this
 *   engine)", "(feelings_about failed: …)".
 * - diary_read: tools.py `_resolve_entry_id` "No entry matches …".
 * - execute_command: tools.py `_run_execute_command` "execute_command needs
 *   the command…" and every "refused: …". */
const TOOL_FAILURES: Record<string, RegExp[]> = {
  fetch_url: [/^\(fetch_url needs a URL\)$/, /^\(fetch_url needs an http\(s\) URL; got /, /^\(could not read \S+: /, /^\(read \S+ but found no readable text\)$/],
  search_memory: [/^search_memory needs words to look for/, /^\(your memory could not be searched right now: /],
  recent_memories: [/^recent_memories could not read the window /, /^recent_memories needs a window larger than zero/, /^\(your memory could not be read right now: /],
  read_memory: [/^read_memory needs the #tag/, /^#\S+ is ambiguous: /, /^No memory with tag #/, /^\(the memory's full words could not be loaded: /, /^\(your memory could not be read right now: /],
  feelings_about: [/^\(feelings_about needs a target/, /^\(the feelings story is unavailable on this engine\)$/, /^\(feelings_about failed: /],
  diary_read: [/^No entry matches /],
  execute_command: [/^execute_command needs the command/, /^refused: /],
};

export function isFailureText(name: string, text: string): boolean {
  if (text.startsWith(`(the ${name} call failed: `) || text === `(the ${name} tool is not enabled in this session)`) return true;
  return (TOOL_FAILURES[name] ?? []).some((re) => re.test(text));
}

/** What came back, by the tool that produced it. */
export function readToolResult(name: string, result: string, success?: boolean): ToolResultView {
  const text = String(result ?? "");
  if (success === false || isFailureText(name, text)) return { type: "failed", text };
  if (text.trim() === "") return { type: "empty" };
  const parsed =
    name === "web_search"
      ? parseWebSearch(text)
      : name === "fetch_url"
        ? parseFetchedPage(text)
        : name === "search_memory" || name === "recent_memories"
          ? parseMemoryListing(text)
          : name === "read_file"
            ? parseFileRead(text)
            : null;
  return parsed ?? { type: "text", text };
}

/** The host of a link, for a calm "where it is from" line. */
export function linkHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ------------------------------------------------------ the system prompt

export interface PromptSection {
  title: string;
  /** Exact slice of the prompt (all slices joined = the prompt, byte for byte). */
  raw: string;
  /** The words to show: the slice without its heading line or envelope tags. */
  body: string;
  /** Part of his identity prelude (opened by default). */
  identity: boolean;
}

export interface ParsedPrompt {
  /** The prelude envelope's attributes (entity, spark, as_of_seq). */
  envelope: Record<string, string> | null;
  sections: PromptSection[];
}

// prelude.py `render_summon_prelude`: one heading line per section.
const PRELUDE_HEADINGS: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^VALUES \(ordinal precedence\):$/, () => "Values, in order of precedence"],
  [/^PURPOSES:$/, () => "Purposes"],
  [/^TRAITS:$/, () => "Traits"],
  [/^LIMITS:$/, () => "Limits"],
  [/^DIARY \(last (\d+)\):$/, (m) => `Diary, the last ${m[1]} ${m[1] === "1" ? "entry" : "entries"}`],
  [/^STANDING \(top (\d+) by \|net\|\):$/, (m) => `Standing feelings, the strongest ${m[1]}`],
];

// prelude.py: the identity cue (digital_identity.identity_change_cue) is
// one sentence with no heading, fitted after LIMITS; it opens with one of
// these words.
const IDENTITY_CUE = /^(You were given your look|Your look and voice changed |Your voice changed |Your look changed |Your identity was recorded again )/;

// The paragraphs compose_system_base (chat.py) and the hosted turn add,
// by the first words of the constant that writes each and, where the
// constant is fixed text, its last words (so an operator's rewritten or
// added paragraph after it is never filed under it): CONTRACT_PARAGRAPH,
// VISIT_OWN_TIME_PARAGRAPH (chat.py), TOOLS_CONTRACT_PARAGRAPH,
// WORKSPACE_CONTRACT_PARAGRAPH, EXECUTE_CONTRACT_PARAGRAPH (tools.py), the
// narrowed-grant line, the capability map file's heading
// (<home>/capability_map.md), OWN_TIME_CONTRACT (life.py), the operator
// block, and the hosted turn's presence / MEMORIES / FEELINGS blocks.
// An operator overlay (system_prompt.yaml) may replace the conversation
// and visit paragraphs (chat.py compose_system_base): their words are then
// unknown here and show as "Other instructions".
const PARAGRAPH_MARKERS: Array<{ start: string; title: string; dropHead?: boolean; end?: string }> = [
  { start: "The block above is your identity.", title: "How a conversation works", end: "Reply in the language of the current request." },
  { start: "One more thing that is true about your life", title: "His own time between visits", end: "never claim you cease to exist between\nconversations." },
  { start: "You can also use a few tools", title: "The tools he can use", end: "dishonesty your memory cannot repair later." },
  { start: "You also have a workspace", title: "His workspace", end: "inside each mount; a read-only mount refuses writes." },
  { start: "This phase also grants you execute_command", title: "Running programs", end: "Output comes back to you like any tool result." },
  { start: "(of the tools described above, this phase of your life grants:", title: "Tools this phase grants", end: " are refused)" },
  { start: "# How your memory works", title: "How his memory works" },
  { start: "This is your own time.", title: "His own time", end: "observation as care, not judgement." },
  { start: "STANDING INSTRUCTIONS FROM YOUR OPERATOR:", title: "Standing instructions from his operator", dropHead: true },
  { start: "(present with you:", title: "Who is present", end: ")" },
  { start: "MEMORIES (what this moment reminds you of", title: "Memories this turn", dropHead: true },
  { start: "FEELINGS (what already stands in you toward", title: "Feelings this turn", dropHead: true, end: "(to see WHY you feel any of these: the feelings_about tool)" },
];

const OTHER = "Other instructions";
const CLOSE_TAG = "\n</identity_prelude>";

function dropFirstLine(s: string): string {
  const i = s.indexOf("\n");
  return i < 0 ? "" : s.slice(i + 1);
}

interface Cut {
  at: number;
  title: string;
  identity: boolean;
  dropHead: boolean;
  /** Where its known words end (text after it, before the next cut, is
   * another section). */
  endAt?: number;
}

/** The prompt cut into titled sections. Every character belongs to exactly
 * one section; text no reader knows becomes its own "Other instructions"
 * section (or one "System prompt" section when nothing is recognised). */
export function parseSystemPrompt(text: string): ParsedPrompt {
  const prompt = String(text ?? "");
  const cuts: Cut[] = [];
  let envelope: Record<string, string> | null = null;
  let rest = 0;
  let openLen = 0;

  const open = /^<identity_prelude ([^>\n]*)>\n/.exec(prompt);
  const closeAt = open ? prompt.indexOf(CLOSE_TAG) : -1;
  if (open && closeAt > 0) {
    envelope = {};
    for (const a of open[1].matchAll(/(\w+)="([^"]*)"/g)) envelope[a[1]] = a[2];
    openLen = open[0].length;
    cuts.push({ at: 0, title: "Who he is", identity: true, dropHead: false });
    let pos = openLen;
    let afterHeading = false;
    for (const line of prompt.slice(pos, closeAt).split("\n")) {
      let matched = false;
      for (const [re, title] of PRELUDE_HEADINGS) {
        const m = re.exec(line);
        if (m) {
          cuts.push({ at: pos, title: title(m), identity: true, dropHead: true });
          matched = true;
        }
      }
      if (matched) afterHeading = true;
      else if (afterHeading && IDENTITY_CUE.test(line)) cuts.push({ at: pos, title: "How he looks and sounds now", identity: true, dropHead: false });
      pos += line.length + 1;
    }
    rest = closeAt + CLOSE_TAG.length;
    cuts[cuts.length - 1].endAt = rest;
  }

  const found: Cut[] = [];
  for (const m of PARAGRAPH_MARKERS) {
    let at = -1;
    if (rest === 0 && prompt.startsWith(m.start)) at = 0;
    else {
      const i = prompt.indexOf("\n\n" + m.start, rest);
      if (i >= 0) at = i + 2;
    }
    if (at < 0) continue;
    let endAt: number | undefined;
    if (m.end) {
      const e = prompt.indexOf(m.end, at);
      if (e >= 0) endAt = e + m.end.length;
    }
    found.push({ at, title: m.title, identity: false, dropHead: Boolean(m.dropHead), endAt });
  }
  found.sort((a, b) => a.at - b.at);
  if (cuts.length === 0 && (found.length === 0 || found[0].at > 0)) cuts.push({ at: 0, title: "System prompt", identity: false, dropHead: false });
  cuts.push(...found);

  // Words between a section's known end and the next section: their own.
  const all: Cut[] = [];
  cuts.forEach((c, i) => {
    const next = i + 1 < cuts.length ? cuts[i + 1].at : prompt.length;
    if (c.endAt !== undefined && c.endAt < next && prompt.slice(c.endAt, next).trim() !== "") {
      all.push({ ...c, endAt: undefined });
      const gap = prompt.slice(c.endAt, next);
      const lead = gap.length - gap.trimStart().length;
      // the separator before the unknown words stays with the section before
      all.push({ at: c.endAt + lead, title: OTHER, identity: false, dropHead: false });
    } else {
      all.push({ ...c, endAt: undefined });
    }
  });

  const sections: PromptSection[] = all.map((c, i) => {
    const end = i + 1 < all.length ? all[i + 1].at : prompt.length;
    const raw = prompt.slice(c.at, end);
    let body = raw;
    if (c.at === 0 && openLen) body = body.slice(openLen);
    const close = body.indexOf(CLOSE_TAG);
    if (close >= 0) body = body.slice(0, close) + body.slice(close + CLOSE_TAG.length);
    if (c.dropHead) body = dropFirstLine(body);
    return { title: c.title, raw, body: body.trim(), identity: c.identity };
  });
  return { envelope, sections };
}

// -------------------------------------------------------------- context

/** abstractruntime identity/memory_reader.py `memory_tag`: the short
 * address a mind quotes — the graph id's 8-character tail. */
export function memoryTag(graphId: string): string {
  const tail = String(graphId || "").split("-").pop() ?? "";
  return tail.length >= 8 ? tail.slice(-8) : tail;
}

/** A diary record is never read without an explicit click: the gateway
 * records such a read in his biography (ids per stream_fold
 * isDiaryGraphId; the kind is the handle's own). */
export function isDiaryMemory(m: { kind?: string; graph_id?: string }): boolean {
  return m.kind === "diary" || /(^|:)diary-/.test(String(m.graph_id ?? ""));
}

// ---------------------------------------------------------------- tools

/** One line over the Tools tab: how many lookups ran and how they went
 * (a failure counts by the same rule as the call's own card). */
export function summarizeTools(tools: Array<{ name: string; result?: string; success?: boolean }>): string {
  const n = tools.length;
  if (n === 0) return "No lookups this turn.";
  const failed = tools.filter((t) => t.result !== undefined && t.result !== null && readToolResult(t.name, String(t.result), t.success).type === "failed").length;
  const silent = tools.filter((t) => t.result === undefined || t.result === null).length;
  const parts = [`${n} ${n === 1 ? "lookup" : "lookups"} this turn`];
  if (failed > 0) parts.push(`${failed} did not work`);
  if (silent > 0) parts.push(`${silent} without a served result`);
  if (failed === 0 && silent === 0) parts.push(n === 1 ? "it came back" : "all came back");
  return parts.join(" · ");
}

/** The caps the probe payload applies to a context memory (abstractgateway
 * entity_visits `_compose_turn_probe` and abstractruntime chat.py
 * report.memories: title[:120], digest[:280]). A field at its cap was cut
 * there; the card says so and keeps the full words one click away. */
export const MEMORY_TITLE_CAP = 120;
export const MEMORY_DIGEST_CAP = 280;

export function servedExcerpt(text: string, cap: number): { text: string; cut: boolean } {
  const t = String(text ?? "");
  return { text: t, cut: t.length >= cap };
}

/** A section's words split around its fenced blocks, so a block's opening
 * line ("```tool name=web_search") stays visible — the prompt teaches the
 * entity by those lines, and a Markdown code block would drop them. An
 * unclosed fence stays text. */
export type PromptPiece = { type: "text"; text: string } | { type: "fence"; open: string; body: string };

export function splitFences(text: string): PromptPiece[] {
  const lines = String(text ?? "").split("\n");
  const out: PromptPiece[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.join("\n").trim() !== "") out.push({ type: "text", text: buf.join("\n") });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (/^```/.test(lines[i])) {
      const close = lines.findIndex((l, j) => j > i && l === "```");
      if (close > i) {
        flush();
        out.push({ type: "fence", open: lines[i], body: lines.slice(i + 1, close).join("\n") });
        i = close;
        continue;
      }
    }
    buf.push(lines[i]);
  }
  flush();
  return out;
}
