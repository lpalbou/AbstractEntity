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
   * (a cut JSON excerpt): shown as is, never half-parsed. */
  raw: string | null;
}

function argValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
}

/** What a call asked, from its name and its served `arg`: a JSON object of
 * arguments (visit lane) or the block body (hosted lane). */
export function describeToolAsk(name: string, arg: string | undefined): ToolAsk {
  const spec = TOOL_ASKS[name];
  const text = String(arg ?? "").trim();
  const verb = spec ? spec.verb : `Used the tool ${name}`;
  const form: AskForm = spec ? spec.form : "plain";
  const absent = (extra: Array<[string, string]>, raw: string | null = null): ToolAsk => ({
    verb,
    object: spec?.empty ?? null,
    form: "plain",
    extra,
    raw,
  });
  if (text.startsWith("{")) {
    let args: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      args = null;
    }
    // A cut excerpt (the gateway ends it with "…") is shown as served.
    if (!args) return absent([], text);
    const key = spec?.key;
    const value = key && key in args ? argValue(args[key]).trim() : "";
    const extra = Object.entries(args)
      .filter(([k]) => k !== key)
      .map(([k, v]) => [k, argValue(v)] as [string, string]);
    return value ? { verb, object: value, form, extra, raw: null } : absent(extra);
  }
  return text ? { verb, object: text, form, extra: [], raw: null } : absent([]);
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

/** A call that did not work, as our own code words it in the result:
 * `execute_tool_elections` ("(the <name> call failed: …)") and
 * `_run_fetch_url` ("(could not read <url>: …)"). */
export function isFailureText(name: string, text: string): boolean {
  return text.startsWith(`(the ${name} call failed: `) || (name === "fetch_url" && /^\(could not read \S+: /.test(text));
}

/** What came back, by the tool that produced it. */
export function readToolResult(name: string, result: string, success?: boolean): ToolResultView {
  const text = String(result ?? "");
  if (success === false || isFailureText(name, text)) return { type: "failed", text };
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

// The paragraphs compose_system_base (chat.py) and the hosted turn add,
// by the first words of the constant that writes each: CONTRACT_PARAGRAPH,
// VISIT_OWN_TIME_PARAGRAPH (chat.py), TOOLS_CONTRACT_PARAGRAPH,
// WORKSPACE_CONTRACT_PARAGRAPH, EXECUTE_CONTRACT_PARAGRAPH (tools.py),
// the narrowed-grant line, the capability map file's heading
// (<home>/capability_map.md), OWN_TIME_CONTRACT (life.py), the operator
// block, and the hosted turn's presence / MEMORIES / FEELINGS blocks.
const PARAGRAPH_MARKERS: Array<[string, string, boolean]> = [
  // [first words, title, the heading line is dropped from the body]
  ["The block above is your identity.", "How a conversation works", false],
  ["One more thing that is true about your life", "His own time between visits", false],
  ["You can also use a few tools", "The tools he can use", false],
  ["You also have a workspace", "His workspace", false],
  ["This phase also grants you execute_command", "Running programs", false],
  ["(of the tools described above, this phase of your life grants:", "Tools this phase grants", false],
  ["# How your memory works", "How his memory works", false],
  ["This is your own time.", "His own time", false],
  ["STANDING INSTRUCTIONS FROM YOUR OPERATOR:", "Standing instructions from his operator", true],
  ["(present with you:", "Who is present", false],
  ["MEMORIES (what this moment reminds you of", "Memories this turn", true],
  ["FEELINGS (what already stands in you toward", "Feelings this turn", true],
];

function dropFirstLine(s: string): string {
  const i = s.indexOf("\n");
  return i < 0 ? "" : s.slice(i + 1);
}

/** The prompt cut into titled sections. Every character belongs to exactly
 * one section; text no reader knows stays in the section it follows (or in
 * one "System prompt" section when nothing is recognised). */
export function parseSystemPrompt(text: string): ParsedPrompt {
  const prompt = String(text ?? "");
  const cuts: Array<{ at: number; title: string; identity: boolean; dropHead: boolean; envelopeOpen?: boolean; envelopeClose?: number }> = [];
  let envelope: Record<string, string> | null = null;
  let rest = 0;

  const open = /^<identity_prelude ([^>\n]*)>\n/.exec(prompt);
  const closeAt = open ? prompt.indexOf("\n</identity_prelude>") : -1;
  if (open && closeAt > 0) {
    envelope = {};
    for (const a of open[1].matchAll(/(\w+)="([^"]*)"/g)) envelope[a[1]] = a[2];
    cuts.push({ at: 0, title: "Who he is", identity: true, dropHead: false, envelopeOpen: true });
    let pos = open[0].length;
    for (const line of prompt.slice(pos, closeAt).split("\n")) {
      for (const [re, title] of PRELUDE_HEADINGS) {
        const m = re.exec(line);
        if (m) cuts.push({ at: pos, title: title(m), identity: true, dropHead: true });
      }
      pos += line.length + 1;
    }
    rest = closeAt + "\n</identity_prelude>".length;
    cuts[cuts.length - 1].envelopeClose = rest;
  }

  const found: Array<{ at: number; title: string; dropHead: boolean }> = [];
  for (const [words, title, dropHead] of PARAGRAPH_MARKERS) {
    let at = -1;
    if (prompt.startsWith(words, rest) && rest === 0) at = 0;
    else {
      const i = prompt.indexOf("\n\n" + words, rest);
      if (i >= 0) at = i + 2;
    }
    if (at >= 0) found.push({ at, title, dropHead });
  }
  found.sort((a, b) => a.at - b.at);
  if (cuts.length === 0 && (found.length === 0 || found[0].at > 0)) cuts.push({ at: 0, title: "System prompt", identity: false, dropHead: false });
  for (const f of found) cuts.push({ at: f.at, title: f.title, identity: false, dropHead: f.dropHead });

  const sections: PromptSection[] = cuts.map((c, i) => {
    const end = i + 1 < cuts.length ? cuts[i + 1].at : prompt.length;
    const raw = prompt.slice(c.at, end);
    let body = raw;
    if (c.envelopeClose !== undefined) {
      // The closing tag ends the prelude's last section; what follows it
      // (before the next known paragraph) is kept, shown after it.
      const close = c.envelopeClose - c.at;
      const after = raw.slice(close).trim();
      body = raw.slice(0, close - "\n</identity_prelude>".length) + (after ? "\n\n" + after : "");
    }
    if (c.envelopeOpen) body = body.slice(open![0].length);
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
