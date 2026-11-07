/**
 * A lived moment (an episode record) read in the runtime's own format —
 * nothing here guesses at what a model wrote.
 *
 * The format (abstractruntime identity/chat.py, turn formation, and
 * identity/visit_workflow.py form_node, byte for byte):
 *
 *   <speaker>:\n<what was said to him>\n\n
 *   then per lookup round:
 *     <name> (thinking, unspoken):\n<his words that round, each tool block
 *       replaced by the door's marker>\n\n
 *     and, when anything came back:
 *     (what the tools returned:)\n<parts joined by "\n\n">\n\n
 *   <name>:\n<his answer>
 *
 * A part is "[<tool>]\n<result>" (a result that came back empty is not
 * kept), or "[<tool>: content stays in your book/memory - reread with
 * <tool>]" for the tools whose words stay in his book (chat.py
 * `_at_rest_tool_results`, tools.py BOOK_ADJACENT_TOOL_NAMES). The door's
 * markers (tools.py parse_tool_blocks / native_tool_elections) are
 * "[used tool: <tool>]" for a lookup that ran, in the order they ran, and
 * "[tool call refused: <tool> is not available]", "[tool call failed:
 * <tool> needs a body]", "[tool call ignored - too many this turn]" for
 * one that did not.
 *
 * read_memory hands back an older moment in this same format
 * (memory_reader.py: "Full words of memory #<tag>:\n<text>", or "… (first
 * N of M chars - the rest exists; ask again for the tail):\n<N chars>"),
 * so the heads also appear inside a result; that header tells them apart,
 * never a guess.
 */

export type Lookup =
  | {
      type: "ran";
      name: string;
      /** What came back, as written ("" unless `returned` is "text"). */
      result: string;
      /** "text": kept here. "nothing": nothing came back (the runtime keeps
       * no part for an empty result). "in_book": it stays in his book.
       * "not_kept": an older record, from before results were kept. */
      returned: "text" | "nothing" | "in_book" | "not_kept";
    }
  | { type: "not_run"; name: string | null; reason: "refused" | "failed" | "ignored" };

export interface LookupRound {
  /** His words that round with the door's markers taken out ("" when he
   * only looked things up). */
  thinking: string;
  lookups: Lookup[];
  /** Results text no marker of the round names, as written (never dropped). */
  unmatched: string | null;
}

export interface LivedExchange {
  cueSpeaker: string;
  /** The words came from his own life, not from someone: the speaker is
   * himself (digest.py mechanical_digest_v2's self-prompted rule). */
  ownTime: boolean;
  /** A visit's opening announcement (chat.py open_greeting). */
  door: boolean;
  cue: string;
  rounds: LookupRound[];
  /** The rounds exactly as written, or null when there were none. */
  roundsText: string | null;
  answerSpeaker: string;
  answer: string;
  /** Older records: his reasoning after the answer, under a bare
   * "(thinking, unspoken)" line (the format before rounds). */
  reasoning: string | null;
}

const CUE_HEAD = /^(\S+|\(the door\)):\s*$/;
const RESULTS_HEAD = "(what the tools returned:)";
const PART_HEAD = /^\[([a-z_]+)\]$/;
const POINTER_PART = /^\[([a-z_]+): content stays in your book\/memory - reread with \1\]$/;
// The door's markers, anywhere in his words (chat.py reads "[used tool: X]"
// with the same expression).
const MARKERS = /\[used tool: ([a-z_]+)\]|\[tool call refused: ([^\]\n]*?) is not available\]|\[tool call failed: ([a-z_]+) needs a body\]|\[tool call ignored - too many this turn\]/g;
const QUOTE_HEAD = /^Full words of memory #\S+:$/;
const QUOTE_CUT_HEAD = /^Full words of memory #\S+ \(first (\d+) of \d+ chars - the rest exists; ask again for the tail\):$/;
const LEGACY_REASONING = /(^|\n)\(thinking, unspoken\)[ \t]*(\n|$)/;

/** digest.py's self-prompted rule: the speaker, lowercased and without an
 * "@<home>" suffix, is his name or "entity:<name>". */
export function isOwnSpeaker(speaker: string, entity: string): boolean {
  const s = String(speaker || "").trim().toLowerCase().split("@", 1)[0];
  const n = String(entity || "").trim().toLowerCase();
  return Boolean(n) && (s === n || s === `entity:${n}`);
}

/** His words of one round: the lookups the door marked, and the rest. */
export function readRoundWords(phase: string): { thinking: string; ran: string[]; notRun: Lookup[] } {
  const ran: string[] = [];
  const notRun: Lookup[] = [];
  for (const m of phase.matchAll(MARKERS)) {
    if (m[1]) ran.push(m[1]);
    else if (m[2] !== undefined) notRun.push({ type: "not_run", name: m[2] === "unnamed" ? null : m[2], reason: "refused" });
    else if (m[3]) notRun.push({ type: "not_run", name: m[3], reason: "failed" });
    else notRun.push({ type: "not_run", name: null, reason: "ignored" });
  }
  const thinking = phase
    .replace(MARKERS, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { thinking, ran, notRun };
}

/** Which lines sit inside an older moment that read_memory handed back.
 * Fed every results line in order: an uncut quote opens at its header
 * (when an exchange head follows) and closes at that moment's own answer
 * head; a cut one spans exactly the characters its header names. */
class QuoteTracker {
  private depth = 0;
  private skipTo = -1;
  private offset = 0;
  constructor(private readonly name: string) {}

  step(line: string, next: string | undefined, boundary: boolean): boolean {
    const start = this.offset;
    this.offset += line.length + 1;
    if (start < this.skipTo) return true;
    const inside = this.depth > 0;
    const cut = QUOTE_CUT_HEAD.exec(line);
    if (cut) this.skipTo = this.offset + Number(cut[1]);
    else if (QUOTE_HEAD.test(line) && CUE_HEAD.test(next ?? "")) this.depth += 1;
    else if (inside && boundary && line.trim().toLowerCase() === `${this.name}:`) this.depth -= 1;
    return inside;
  }
}

interface Part {
  name: string | null;
  kept: boolean;
  lines: string[];
}

function finishRound(parts: Part[], words: ReturnType<typeof readRoundWords>, older: boolean): LookupRound {
  const lookups: Lookup[] = [];
  const unmatched: string[] = [];
  let p = 0;
  while (p < parts.length && parts[p].name === null) unmatched.push(parts[p++].lines.join("\n").trim());
  for (const tool of words.ran) {
    const part = parts[p];
    if (part && part.name === tool) {
      const text = part.lines.join("\n").trim();
      lookups.push({ type: "ran", name: tool, result: part.kept ? text : "", returned: !part.kept ? "in_book" : text ? "text" : "nothing" });
      p += 1;
    } else {
      lookups.push({ type: "ran", name: tool, result: "", returned: older ? "not_kept" : "nothing" });
    }
  }
  while (p < parts.length) unmatched.push(parts[p++].lines.join("\n").trim());
  lookups.push(...words.notRun);
  const rest = unmatched.filter(Boolean).join("\n\n");
  return { thinking: words.thinking, lookups, unmatched: rest || null };
}

/** The moment, or null when the words are not shaped the way the runtime
 * writes an exchange (diary entries, born-as-words records, the flow
 * brain's "THEY SAID:" records): the caller shows those as written. */
export function parseLivedExchange(raw: string, entityName: string): LivedExchange | null {
  const lines = String(raw || "").split("\n");
  const name = entityName.trim().toLowerCase();
  if (!name) return null;
  const first = CUE_HEAD.exec(lines[0] ?? "");
  if (!first || first[1].toLowerCase() === name) return null;
  // His answer is always last: the LAST "<name>:" head at a paragraph
  // boundary (older moments quoted in results carry the same head).
  let answerAt = -1;
  for (let i = lines.length - 1; i > 0; i--) {
    if (lines[i].trim().toLowerCase() === `${name}:` && lines[i - 1].trim() === "") {
      answerAt = i;
      break;
    }
  }
  if (answerAt < 0) return null;
  // Older records name a round "<name> (while looking things up):" and keep
  // no results (the runtime's format before results were kept, fc2fc84).
  const olderHead = (i: number) => lines[i].trim().toLowerCase() === `${name} (while looking things up):`;
  const isRoundHead = (i: number) => (lines[i].trim().toLowerCase() === `${name} (thinking, unspoken):` || olderHead(i)) && lines[i - 1].trim() === "";
  let firstRound = -1;
  for (let i = 1; i < answerAt; i++) {
    if (isRoundHead(i)) {
      firstRound = i;
      break;
    }
  }

  const rounds: LookupRound[] = [];
  if (firstRound >= 0) {
    let phase: string[] = [];
    let words: ReturnType<typeof readRoundWords> | null = null; // set once results begin
    let parts: Part[] = [];
    let next = 0; // the first marker a part may still answer
    let quotes = new QuoteTracker(name);
    let older = olderHead(firstRound);
    const flush = (at: number) => {
      rounds.push(finishRound(parts, words ?? readRoundWords(phase.join("\n")), older));
      older = at < answerAt && olderHead(at);
      phase = [];
      words = null;
      parts = [];
      next = 0;
      quotes = new QuoteTracker(name);
    };
    for (let i = firstRound + 1; i < answerAt; i++) {
      const line = lines[i];
      const boundary = lines[i - 1].trim() === "";
      if (words === null) {
        if (isRoundHead(i)) {
          flush(i);
          continue;
        }
        if (boundary && line.trim() === RESULTS_HEAD) {
          words = readRoundWords(phase.join("\n"));
          continue;
        }
        phase.push(line);
        continue;
      }
      // Results: a part head right after the results head, or after a blank line.
      const startsPart = boundary || lines[i - 1].trim() === RESULTS_HEAD;
      const quoted = quotes.step(line, lines[i + 1], boundary);
      if (!quoted && boundary && isRoundHead(i)) {
        flush(i);
        continue;
      }
      if (!quoted && startsPart) {
        const pointer = POINTER_PART.exec(line);
        const head = pointer ? pointer[1] : PART_HEAD.exec(line)?.[1] ?? null;
        const at = head ? words.ran.indexOf(head, next) : -1;
        if (head && at >= 0) {
          parts.push({ name: head, kept: !pointer, lines: [] });
          next = at + 1;
          continue;
        }
      }
      if (parts.length === 0) parts.push({ name: null, kept: true, lines: [] });
      parts[parts.length - 1].lines.push(line);
    }
    flush(answerAt);
  }

  let answer = lines.slice(answerAt + 1).join("\n");
  let reasoning: string | null = null;
  const legacy = LEGACY_REASONING.exec(answer);
  if (legacy) {
    reasoning = answer.slice(legacy.index + legacy[0].length).trim() || null;
    answer = answer.slice(0, legacy.index);
  }
  return {
    cueSpeaker: first[1],
    ownTime: isOwnSpeaker(first[1], entityName),
    door: first[1] === "(the door)",
    cue: lines.slice(1, firstRound >= 0 ? firstRound : answerAt).join("\n").trim(),
    rounds,
    roundsText: firstRound >= 0 ? lines.slice(firstRound, answerAt).join("\n").trim() : null,
    answerSpeaker: lines[answerAt].trim().replace(/:$/, ""),
    answer: answer.trim(),
    reasoning,
  };
}

// ------------------------------------------------------------ in words

/** What a lookup did, counted: "searched the web 4 times". */
const LOOKUP_WORDS: Record<string, [string, (n: number) => string]> = {
  web_search: ["searched the web once", (n) => `searched the web ${n} times`],
  fetch_url: ["read a web page", (n) => `read ${n} web pages`],
  read_memory: ["read a memory in full", (n) => `read ${n} memories in full`],
  search_memory: ["searched his memory once", (n) => `searched his memory ${n} times`],
  recent_memories: ["looked back over his recent memories", (n) => `looked back over his recent memories ${n} times`],
  diary_read: ["read a diary entry", (n) => `read ${n} diary entries`],
  diary_list: ["listed his diary entries", (n) => `listed his diary entries ${n} times`],
  feelings_about: ["looked into his feelings", (n) => `looked into his feelings ${n} times`],
  write_file: ["wrote a file", (n) => `wrote ${n} files`],
  read_file: ["read a file", (n) => `read ${n} files`],
  list_files: ["listed his files", (n) => `listed his files ${n} times`],
  execute_command: ["ran a program", (n) => `ran ${n} programs`],
};

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The lookups that ran, by tool, in the order each tool first ran. */
export function lookupCounts(rounds: LookupRound[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const r of rounds) for (const l of r.lookups) if (l.type === "ran") counts.set(l.name, (counts.get(l.name) ?? 0) + 1);
  return [...counts.entries()];
}

/** "searched the web 6 times and read 6 web pages" ("" when none ran). */
export function lookupsInWords(counts: Array<[string, number]>): string {
  return joinWords(
    counts.map(([tool, n]) => {
      const w = LOOKUP_WORDS[tool];
      if (w) return n === 1 ? w[0] : w[1](n);
      return n === 1 ? `used ${tool} once` : `used ${tool} ${n} times`;
    }),
  );
}

export function notRunCount(rounds: LookupRound[]): number {
  let n = 0;
  for (const r of rounds) for (const l of r.lookups) if (l.type === "not_run") n += 1;
  return n;
}

/** The fold's one line: "Before answering he searched the web 4 times." */
export function howSentence(ex: Pick<LivedExchange, "rounds" | "reasoning">): string {
  const counts = lookupCounts(ex.rounds);
  const did = lookupsInWords(counts);
  const passes = ex.rounds.length;
  const skipped = notRunCount(ex.rounds);
  const parts: string[] = [];
  if (did) parts.push(`Before answering he ${did}${passes > 1 ? `, over ${passes} passes` : ""}.`);
  else if (passes > 0) parts.push(`Before answering he thought it through${passes > 1 ? ` over ${passes} passes` : ""}.`);
  if (skipped > 0) parts.push(skipped === 1 ? "One lookup he asked for did not run." : `${skipped} lookups he asked for did not run.`);
  if (ex.reasoning) parts.push(passes > 0 ? "His private reasoning is kept too." : "His private reasoning, not said aloud.");
  return parts.join(" ");
}

/** What the lookup asked, when its result says it (the runtime's own result
 * heads: tools.py _run_web_search "Search results for: <query>" / "No
 * results found for: <query>", _run_fetch_url "Fetched: <url>" / "(could
 * not read <url>: …)", memory_reader.py "Full words of memory #<tag>…").
 * The record keeps only the marker, never the call's arguments. */
export function askFromResult(tool: string, result: string): Record<string, string> | null {
  const firstLine = String(result || "").split("\n", 1)[0];
  if (tool === "web_search") {
    const m = /^(?:Search results for|No results found for): (.*)$/.exec(firstLine);
    return m ? { query: m[1] } : null;
  }
  if (tool === "fetch_url") {
    const m = /^Fetched: (\S+)$/.exec(firstLine) ?? /^\(could not read (\S+): /.exec(firstLine);
    return m ? { url: m[1] } : null;
  }
  if (tool === "read_memory") {
    const m = /^Full words of memory #(\S+?)(?: \(first \d+ of \d+ chars - the rest exists; ask again for the tail\))?:$/.exec(firstLine);
    return m ? { tag: `#${m[1]}` } : null;
  }
  return null;
}

/** A record the gateway would mark as read in his biography — never read
 * without an explicit click (ids per stream_fold isDiaryGraphId). */
export function isDiaryShaped(node: { diary?: boolean; kind?: string; graph_id?: string | null; id?: string }): boolean {
  return Boolean(node.diary) || node.kind === "diary" || /(^|:)diary-/.test(String(node.graph_id ?? node.id ?? ""));
}
